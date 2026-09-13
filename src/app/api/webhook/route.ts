import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { stripeConfigured } from "@/lib/config";
import {
  ensureDb,
  applyCheckoutSessionInTransaction,
  markEventProcessedOnly,
  markPaymentRefunded,
  unwindPaymentRefundInTransaction,
  freezeListingForDisputeInTransaction,
} from "@/lib/db";

export const dynamic = "force-dynamic";

function paymentIntentId(
  value: string | Stripe.PaymentIntent | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function chargeId(
  value: string | Stripe.Charge | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function refundPaymentIntent(pi: string): Promise<boolean> {
  if (!stripeConfigured()) {
    console.warn("Stripe not configured — cannot auto-refund takeover loser", pi);
    return false;
  }
  const stripe = getStripe();
  try {
    await stripe.refunds.create({ payment_intent: pi });
    return true;
  } catch (err) {
    // Already refunded / canceled is OK
    const msg = err instanceof Error ? err.message : String(err);
    if (/already been refunded|has been charged back|canceled/i.test(msg)) {
      return true;
    }
    console.error("Failed to refund takeover loser", pi, err);
    return false;
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.includes("...")) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  await ensureDb();

  try {
    if (event.type === "checkout.session.completed") {
      return await handleCheckoutCompleted(event);
    }
    if (event.type === "charge.refunded") {
      return await handleChargeRefunded(event);
    }
    if (event.type === "charge.dispute.created") {
      return await handleDisputeCreated(event);
    }
    // Acknowledge other events idempotently so broad endpoint configs stay quiet
    await markEventProcessedOnly(event.id, event.type);
    return NextResponse.json({ received: true, ignored: event.type });
  } catch (e) {
    console.error("Webhook handler error", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const meta = session.metadata ?? {};
  const kind = meta.kind as "bid" | "rebid" | "takeover" | undefined;
  const chargeUsd = Number.parseInt(meta.chargeUsd || "0", 10);
  const targetTotalUsd = Number.parseInt(meta.targetTotalUsd || "0", 10);
  const name = meta.name || "Untitled";
  const url = meta.url || "https://example.com";
  const tagline = meta.tagline || "";
  const logoUrl = meta.logoUrl || null;
  const email = meta.email || session.customer_email || "";
  const listingId = meta.listingId || undefined;
  const pi = paymentIntentId(session.payment_intent);

  if (!email || !kind || !Number.isInteger(chargeUsd) || chargeUsd <= 0) {
    console.error("Invalid checkout metadata", meta);
    await markEventProcessedOnly(event.id, event.type);
    return NextResponse.json({ received: true, error: "bad metadata" }, { status: 200 });
  }

  const result = await applyCheckoutSessionInTransaction({
    eventId: event.id,
    eventType: event.type,
    kind,
    listingId: listingId || undefined,
    name,
    url,
    tagline,
    logoUrl,
    email,
    newTotalUsd: targetTotalUsd,
    chargeUsd,
    stripeSessionId: session.id,
    stripePaymentIntent: pi,
  });

  if (result.kind === "deduped") {
    return NextResponse.json({ received: true, deduped: true });
  }

  if (result.kind === "takeover_lost") {
    let refunded = false;
    if (pi) {
      refunded = await refundPaymentIntent(pi);
      if (refunded) {
        await markPaymentRefunded(result.paymentId, "takeover_lost_refunded");
      }
    }
    return NextResponse.json({
      received: true,
      skipped: "takeover_race",
      refunded,
      paymentId: result.paymentId,
      lockedUntil: result.lockedUntil,
    });
  }

  return NextResponse.json({
    received: true,
    applied: true,
    paymentId: result.paymentId,
    listingId: result.listing.id,
  });
}

async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const amountRefundedUsd = Math.floor((charge.amount_refunded ?? 0) / 100);
  const pi = paymentIntentId(charge.payment_intent);
  const cid = charge.id;

  const result = await unwindPaymentRefundInTransaction({
    eventId: event.id,
    eventType: event.type,
    paymentIntentId: pi,
    chargeId: cid,
    amountRefundedUsd,
  });

  return NextResponse.json({ received: true, refund: result });
}

async function handleDisputeCreated(event: Stripe.Event) {
  const dispute = event.data.object as Stripe.Dispute;
  const cid = chargeId(dispute.charge);
  const pi = paymentIntentId(dispute.payment_intent);

  const result = await freezeListingForDisputeInTransaction({
    eventId: event.id,
    eventType: event.type,
    paymentIntentId: pi,
    chargeId: cid,
  });

  return NextResponse.json({ received: true, dispute: result });
}

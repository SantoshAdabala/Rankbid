import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  getDb,
  eventAlreadyProcessed,
  markEventProcessed,
  applyBid,
  applyTakeover,
} from "@/lib/db";

export const dynamic = "force-dynamic";

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

  getDb();

  // Idempotency: dedupe by Stripe event id
  if (eventAlreadyProcessed(event.id)) {
    return NextResponse.json({ received: true, deduped: true });
  }

  if (event.type === "checkout.session.completed") {
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

    if (!email || !kind || !Number.isInteger(chargeUsd) || chargeUsd <= 0) {
      console.error("Invalid checkout metadata", meta);
      // Still mark processed to avoid poison retries looping forever without fix
      markEventProcessed(event.id, event.type);
      return NextResponse.json({ received: true, error: "bad metadata" }, { status: 200 });
    }

    try {
      if (kind === "takeover") {
        applyTakeover({
          listingId: listingId || undefined,
          name,
          url,
          tagline,
          logoUrl,
          email,
          chargeUsd,
        });
      } else {
        applyBid({
          listingId: listingId || undefined,
          name,
          url,
          tagline,
          logoUrl,
          email,
          newTotalUsd: targetTotalUsd,
          chargeUsd,
        });
      }
      markEventProcessed(event.id, event.type);
    } catch (e) {
      console.error("Failed to apply checkout", e);
      // Do not mark processed on transient/race errors so Stripe can retry
      // except takeover race (first lock wins) — mark and acknowledge to avoid infinite retry
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("First lock wins") || msg.includes("already locked")) {
        markEventProcessed(event.id, event.type);
        return NextResponse.json({ received: true, skipped: "takeover_race" });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } else {
    // Ignore other event types but record to keep idempotent if we subscribe broadly
    markEventProcessed(event.id, event.type);
  }

  return NextResponse.json({ received: true });
}

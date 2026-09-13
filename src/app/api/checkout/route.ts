import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureDb,
  getListingByEmail,
  getListingById,
  getNumberOne,
  activeTakeoverLock,
  reservePendingTakeover,
  attachPendingTakeoverSession,
  releasePendingTakeoverById,
  TakeoverRaceError,
} from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { getBaseUrl, stripeConfigured } from "@/lib/config";
import {
  MIN_BID_USD,
  computeRebidCharge,
  computeTakeoverCharge,
  usdToCents,
  isWholeUsd,
} from "@/lib/money";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["bid", "rebid", "takeover"]),
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(500),
  tagline: z.string().trim().max(160).default(""),
  logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  email: z.string().trim().email().max(200),
  listingId: z.string().uuid().optional(),
  /** Desired cumulative total (bid/rebid). Ignored for takeover. */
  targetTotalUsd: z.number().int().optional(),
});

export async function POST(req: Request) {
  let pendingId: string | undefined;
  try {
    await ensureDb();

    if (!stripeConfigured()) {
      return NextResponse.json(
        {
          error:
            "Stripe is not configured. Set STRIPE_SECRET_KEY in .env (see .env.example). Demo board works without Stripe.",
        },
        { status: 503 }
      );
    }

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const logoUrl = data.logoUrl || undefined;

    const existing =
      (data.listingId ? await getListingById(data.listingId) : null) ??
      (await getListingByEmail(data.email));

    if (existing?.frozen) {
      return NextResponse.json(
        {
          error:
            "This listing is frozen due to a payment dispute or refund review. Contact support.",
        },
        { status: 403 }
      );
    }

    let chargeUsd: number;
    let targetTotalUsd: number;
    let kind = data.kind;

    if (kind === "takeover") {
      const lock = await activeTakeoverLock();
      if (lock) {
        return NextResponse.json(
          {
            error: `Takeover is locked until ${lock.locked_until}. First lock wins — try again after it expires.`,
          },
          { status: 409 }
        );
      }

      // Short-lived reservation so two Checkouts cannot both pay before either webhook locks
      try {
        const reserved = await reservePendingTakeover(data.email);
        pendingId = reserved.pendingId;
      } catch (e) {
        if (e instanceof TakeoverRaceError) {
          return NextResponse.json({ error: e.message }, { status: 409 });
        }
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Takeover reserved" },
          { status: 409 }
        );
      }

      const numberOne = await getNumberOne();
      const { chargeUsd: c, isFirstBid } = computeTakeoverCharge(
        numberOne?.total_usd ?? null
      );
      chargeUsd = c;
      targetTotalUsd = (existing?.total_usd ?? 0) + chargeUsd;
      void isFirstBid; // empty board still uses kind=takeover (webhook treats as first bid + lock)
    } else {
      const target = data.targetTotalUsd;
      if (target === undefined || !isWholeUsd(target)) {
        return NextResponse.json(
          { error: "targetTotalUsd must be a whole dollar amount" },
          { status: 400 }
        );
      }
      if (target < MIN_BID_USD) {
        return NextResponse.json(
          { error: `Minimum bid is $${MIN_BID_USD}` },
          { status: 400 }
        );
      }

      if (existing) {
        try {
          chargeUsd = computeRebidCharge(existing.total_usd, target);
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Invalid rebid" },
            { status: 400 }
          );
        }
        kind = "rebid";
      } else {
        chargeUsd = target;
        kind = "bid";
      }
      targetTotalUsd = target;
    }

    const stripe = getStripe();
    const baseUrl = getBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Account may default Managed Payments on; disable so ad-hoc price_data
      // products need no tax_code (avoids Checkout Session 500).
      managed_payments: { enabled: false },
      customer_email: data.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: usdToCents(chargeUsd),
            product_data: {
              name:
                kind === "takeover"
                  ? `Rankbid takeover — lock #1 (${chargeUsd} USD)`
                  : kind === "rebid"
                    ? `Rankbid rebid — raise to $${targetTotalUsd}`
                    : `Rankbid bid — $${targetTotalUsd} total`,
              description: `${data.name} · rank = dollars`,
            },
          },
        },
      ],
      metadata: {
        kind,
        listingId: existing?.id ?? "",
        name: data.name,
        url: data.url,
        tagline: data.tagline,
        logoUrl: logoUrl ?? "",
        email: data.email,
        targetTotalUsd: String(targetTotalUsd),
        chargeUsd: String(chargeUsd),
        pendingTakeoverId: pendingId ?? "",
      },
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/claim?canceled=1`,
    });

    if (pendingId && session.id) {
      await attachPendingTakeoverSession(pendingId, session.id);
      pendingId = undefined; // ownership transferred; do not release on success path
    }

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      chargeUsd,
      targetTotalUsd,
      kind,
    });
  } catch (e) {
    if (pendingId) {
      try {
        await releasePendingTakeoverById(pendingId);
      } catch {
        /* ignore */
      }
    }
    console.error("checkout error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout failed" },
      { status: 500 }
    );
  }
}

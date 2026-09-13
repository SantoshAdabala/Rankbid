import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getDb,
  getListingByEmail,
  getListingById,
  getNumberOne,
  activeTakeoverLock,
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
  try {
    getDb();

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

    let existing =
      (data.listingId ? getListingById(data.listingId) : null) ??
      getListingByEmail(data.email);

    let chargeUsd: number;
    let targetTotalUsd: number;
    let kind = data.kind;

    if (kind === "takeover") {
      const lock = activeTakeoverLock();
      if (lock) {
        return NextResponse.json(
          {
            error: `Takeover is locked until ${lock.locked_until}. First lock wins — try again after it expires.`,
          },
          { status: 409 }
        );
      }
      const numberOne = getNumberOne();
      const { chargeUsd: c, isFirstBid } = computeTakeoverCharge(
        numberOne?.total_usd ?? null
      );
      chargeUsd = c;
      // For takeover, cumulative total becomes previous + charge (applied in webhook)
      targetTotalUsd = (existing?.total_usd ?? 0) + chargeUsd;
      if (isFirstBid) {
        // Documented: empty board → treat as normal first bid
        kind = "takeover";
      }
    } else {
      // bid or rebid
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
        // New listing: charge = target total
        chargeUsd = target;
        kind = "bid";
      }
      targetTotalUsd = target;
    }

    const stripe = getStripe();
    const baseUrl = getBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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
      },
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/claim?canceled=1`,
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      chargeUsd,
      targetTotalUsd,
      kind,
    });
  } catch (e) {
    console.error("checkout error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout failed" },
      { status: 500 }
    );
  }
}

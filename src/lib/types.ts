export type Listing = {
  id: string;
  name: string;
  url: string;
  tagline: string;
  logo_url: string | null;
  email: string;
  total_usd: number;
  frozen: boolean;
  created_at: string;
  updated_at: string;
};

export type LeaderboardEntry = Listing & {
  rank: number;
  locked_until: string | null;
  is_locked: boolean;
};

export type CheckoutKind = "bid" | "rebid" | "takeover";

export type CheckoutMetadata = {
  kind: CheckoutKind;
  listingId?: string;
  name: string;
  url: string;
  tagline: string;
  logoUrl?: string;
  email: string;
  /** Desired cumulative total for bid/rebid (whole USD). For takeover, charged amount. */
  targetTotalUsd: string;
  /** Amount charged this session (whole USD). */
  chargeUsd: string;
};

export type PaymentStatus =
  | "applied"
  | "refunded"
  | "disputed"
  | "takeover_lost_refunded"
  | "takeover_lost_pending_refund";

export type PaymentRow = {
  id: string;
  listing_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  stripe_charge_id: string | null;
  kind: string;
  charge_usd: number;
  unwound_usd: number;
  status: PaymentStatus;
  event_id: string | null;
  created_at: string;
  updated_at: string;
};

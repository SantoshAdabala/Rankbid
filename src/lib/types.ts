export type Listing = {
  id: string;
  name: string;
  url: string;
  tagline: string;
  logo_url: string | null;
  email: string;
  total_usd: number;
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

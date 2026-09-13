/** Whole USD only. Min bid $2. */

export const MIN_BID_USD = 2;

export function isWholeUsd(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

export function assertWholeUsd(n: number, label = "amount"): void {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${label} must be a whole dollar amount`);
  }
}

/**
 * Rebid charge = newTotal - currentTotal.
 * Rejects if charge ≤ 0 or newTotal < MIN_BID_USD.
 */
export function computeRebidCharge(
  currentTotalUsd: number,
  newTotalUsd: number
): number {
  assertWholeUsd(currentTotalUsd, "currentTotal");
  assertWholeUsd(newTotalUsd, "newTotal");
  if (newTotalUsd < MIN_BID_USD) {
    throw new Error(`New total must be at least $${MIN_BID_USD}`);
  }
  const charge = newTotalUsd - currentTotalUsd;
  if (charge <= 0) {
    throw new Error("Rebid must raise your cumulative total (charge must be > $0)");
  }
  return charge;
}

/**
 * Takeover price = 2 × current #1 total.
 * If no #1 yet (empty board), treat as normal first bid at targetTotal (min $2).
 */
export function computeTakeoverCharge(currentNumberOneTotalUsd: number | null): {
  chargeUsd: number;
  isFirstBid: boolean;
} {
  if (currentNumberOneTotalUsd === null || currentNumberOneTotalUsd <= 0) {
    return { chargeUsd: MIN_BID_USD, isFirstBid: true };
  }
  assertWholeUsd(currentNumberOneTotalUsd, "numberOneTotal");
  return { chargeUsd: currentNumberOneTotalUsd * 2, isFirstBid: false };
}

export function usdToCents(usd: number): number {
  assertWholeUsd(usd);
  return usd * 100;
}

export function getTakeoverHours(): number {
  const raw = process.env.TAKEOVER_HOURS ?? "6";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

/** Minutes a takeover Checkout reservation holds the short-lived lock. */
export function getPendingTakeoverMinutes(): number {
  const raw = process.env.PENDING_TAKEOVER_MINUTES ?? "20";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/**
 * Resolve libSQL / Turso connection.
 * Prefer TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN for remote).
 * Falls back to DATABASE_URL, then local file SQLite for easy dev.
 */
export function getDatabaseConfig(): { url: string; authToken?: string } {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const authToken =
    process.env.TURSO_AUTH_TOKEN?.trim() ||
    process.env.DATABASE_AUTH_TOKEN?.trim() ||
    undefined;

  const raw = tursoUrl || databaseUrl || "file:./data/rankbid.db";

  // Legacy: plain filesystem path (no scheme) → file: URL for libsql
  if (
    !raw.startsWith("file:") &&
    !raw.startsWith("libsql:") &&
    !raw.startsWith("http:") &&
    !raw.startsWith("https:") &&
    !raw.startsWith("ws:") &&
    !raw.startsWith("wss:")
  ) {
    return { url: `file:${raw}`, authToken };
  }

  return { url: raw, authToken };
}

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export function stripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) return false;
  if (key.includes("...")) return false;
  if (key.includes("placeholder")) return false;
  return key.startsWith("sk_test_") || key.startsWith("sk_live_");
}

export function getTakeoverHours(): number {
  const raw = process.env.TAKEOVER_HOURS ?? "6";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

export function getSqlitePath(): string {
  return process.env.SQLITE_PATH || process.env.DATABASE_URL || "./data/rankbid.db";
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

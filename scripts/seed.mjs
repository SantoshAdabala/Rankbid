import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const raw =
  process.env.TURSO_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "file:./data/rankbid.db";
const authToken =
  process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN || undefined;

let url = raw;
if (
  !raw.startsWith("file:") &&
  !raw.startsWith("libsql:") &&
  !raw.startsWith("http:") &&
  !raw.startsWith("https:") &&
  !raw.startsWith("ws:") &&
  !raw.startsWith("wss:")
) {
  url = `file:${raw}`;
}

if (url.startsWith("file:")) {
  const filePath = url.slice("file:".length);
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  // libsql file URLs are cwd-relative; keep as given when relative
}

const db = createClient({ url, authToken });

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    logo_url TEXT,
    email TEXT NOT NULL,
    total_usd INTEGER NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
    frozen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stripe_events (
    event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    processed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS takeover_locks (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL UNIQUE,
    locked_until TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES listings(id)
  );
  CREATE TABLE IF NOT EXISTS pending_takeovers (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    stripe_session_id TEXT UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    listing_id TEXT,
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
    stripe_charge_id TEXT,
    kind TEXT NOT NULL,
    charge_usd INTEGER NOT NULL,
    unwound_usd INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES listings(id)
  );
`);

try {
  await db.execute(`ALTER TABLE listings ADD COLUMN frozen INTEGER NOT NULL DEFAULT 0`);
} catch {
  /* exists */
}

const countRes = await db.execute(`SELECT COUNT(*) AS c FROM listings`);
const count = Number(countRes.rows[0]?.c ?? 0);
if (count > 0) {
  console.log(`Seed skipped — ${count} listings already present (${url})`);
  process.exit(0);
}

const demos = [
  ["PixelForge AI", "https://example.com/pixelforge", "Generate product shots that convert.", "demo+pixelforge@rankbid.local", 47],
  ["ShipLog", "https://example.com/shiplog", "Changelog + waitlist for indie SaaS.", "demo+shiplog@rankbid.local", 28],
  ["PromptVault", "https://example.com/promptvault", "Versioned prompts for your team.", "demo+promptvault@rankbid.local", 19],
  ["LatencyCheck", "https://example.com/latencycheck", "Uptime + p99 for AI APIs.", "demo+latency@rankbid.local", 12],
  ["IndieStack", "https://example.com/indiestack", "Boilerplate that ships this week.", "demo+indiestack@rankbid.local", 8],
];

const ts = new Date().toISOString();
await db.batch(
  demos.map(([name, url_, tagline, email, total]) => ({
    sql: `INSERT INTO listings (id, name, url, tagline, logo_url, email, total_usd, frozen, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
    args: [randomUUID(), name, url_, tagline, email, total, ts, ts],
  })),
  "write"
);
console.log(`Seeded ${demos.length} demo listings into ${url}`);

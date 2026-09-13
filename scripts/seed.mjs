import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sqlitePath = process.env.SQLITE_PATH || "./data/rankbid.db";
const resolved = path.isAbsolute(sqlitePath) ? sqlitePath : path.join(root, sqlitePath);

fs.mkdirSync(path.dirname(resolved), { recursive: true });
const db = new Database(resolved);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    logo_url TEXT,
    email TEXT NOT NULL,
    total_usd INTEGER NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
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
`);

const count = db.prepare(`SELECT COUNT(*) AS c FROM listings`).get().c;
if (count > 0) {
  console.log(`Seed skipped — ${count} listings already present at ${resolved}`);
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
const insert = db.prepare(
  `INSERT INTO listings (id, name, url, tagline, logo_url, email, total_usd, created_at, updated_at)
   VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`
);
const tx = db.transaction(() => {
  for (const [name, url, tagline, email, total] of demos) {
    insert.run(randomUUID(), name, url, tagline, email, total, ts, ts);
  }
});
tx();
console.log(`Seeded ${demos.length} demo listings into ${resolved}`);

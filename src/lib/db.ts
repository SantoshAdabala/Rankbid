import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getSqlitePath, getTakeoverHours } from "./config";
import type { LeaderboardEntry, Listing } from "./types";
import { MIN_BID_USD } from "./money";

declare global {
  // eslint-disable-next-line no-var
  var __rankbidDb: Database.Database | undefined;
}

function openDb(): Database.Database {
  const sqlitePath = getSqlitePath();
  const resolved = path.isAbsolute(sqlitePath)
    ? sqlitePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), sqlitePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!global.__rankbidDb) {
    global.__rankbidDb = openDb();
  }
  return global.__rankbidDb;
}

function migrate(db: Database.Database): void {
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

    CREATE INDEX IF NOT EXISTS idx_listings_total ON listings(total_usd DESC);
    CREATE INDEX IF NOT EXISTS idx_locks_until ON takeover_locks(locked_until);
  `);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function listLeaderboard(): LeaderboardEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT l.*,
              t.locked_until AS locked_until
       FROM listings l
       LEFT JOIN takeover_locks t ON t.listing_id = l.id
       WHERE l.total_usd > 0
       ORDER BY l.total_usd DESC, l.updated_at ASC`
    )
    .all() as Array<Listing & { locked_until: string | null }>;

  const now = Date.now();
  return rows.map((row, i) => {
    const lockedUntil = row.locked_until;
    const isLocked = Boolean(lockedUntil && new Date(lockedUntil).getTime() > now);
    return {
      ...row,
      rank: i + 1,
      locked_until: lockedUntil,
      is_locked: isLocked,
    };
  });
}

export function getListingById(id: string): Listing | null {
  const db = getDb();
  return (
    (db.prepare(`SELECT * FROM listings WHERE id = ?`).get(id) as Listing | undefined) ??
    null
  );
}

export function getListingByEmail(email: string): Listing | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT * FROM listings WHERE lower(email) = lower(?)`)
      .get(email) as Listing | undefined) ?? null
  );
}

export function getNumberOne(): Listing | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT * FROM listings WHERE total_usd > 0 ORDER BY total_usd DESC, updated_at ASC LIMIT 1`
      )
      .get() as Listing | undefined) ?? null
  );
}

export function activeTakeoverLock(): {
  listing_id: string;
  locked_until: string;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT listing_id, locked_until FROM takeover_locks
       WHERE datetime(locked_until) > datetime('now')
       ORDER BY locked_until DESC LIMIT 1`
    )
    .get() as { listing_id: string; locked_until: string } | undefined;
  return row ?? null;
}

export function eventAlreadyProcessed(eventId: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT 1 AS ok FROM stripe_events WHERE event_id = ?`)
    .get(eventId);
  return Boolean(row);
}

export function markEventProcessed(eventId: string, type: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)`
  ).run(eventId, type, nowIso());
}

export type ApplyBidInput = {
  listingId?: string;
  name: string;
  url: string;
  tagline: string;
  logoUrl?: string | null;
  email: string;
  /** New cumulative total after this payment */
  newTotalUsd: number;
  /** Dollars charged in this checkout (for validation) */
  chargeUsd: number;
};

/**
 * Applies a normal bid/rebid after Stripe payment.
 * Rebid math is enforced: newTotal must equal current + charge (or create at charge).
 */
export function applyBid(input: ApplyBidInput): Listing {
  const db = getDb();
  if (!Number.isInteger(input.newTotalUsd) || input.newTotalUsd < MIN_BID_USD) {
    throw new Error(`Total must be a whole dollar amount ≥ $${MIN_BID_USD}`);
  }
  if (!Number.isInteger(input.chargeUsd) || input.chargeUsd <= 0) {
    throw new Error("Charge must be a positive whole dollar amount");
  }

  const apply = db.transaction(() => {
    let listing: Listing | null = null;
    if (input.listingId) {
      listing = getListingById(input.listingId);
    }
    if (!listing) {
      listing = getListingByEmail(input.email);
    }

    if (!listing) {
      // New listing: total should equal charge
      if (input.newTotalUsd !== input.chargeUsd) {
        throw new Error("New listing total must equal charge");
      }
      const id = randomUUID();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO listings (id, name, url, tagline, logo_url, email, total_usd, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.name,
        input.url,
        input.tagline,
        input.logoUrl ?? null,
        input.email,
        input.newTotalUsd,
        ts,
        ts
      );
      return getListingById(id)!;
    }

    const expected = listing.total_usd + input.chargeUsd;
    if (input.newTotalUsd !== expected) {
      throw new Error(
        `Rebid mismatch: expected total ${expected}, got ${input.newTotalUsd}`
      );
    }
    if (input.chargeUsd !== input.newTotalUsd - listing.total_usd) {
      throw new Error("Rebid charge must equal newTotal - currentTotal");
    }

    const ts = nowIso();
    db.prepare(
      `UPDATE listings
       SET name = ?, url = ?, tagline = ?, logo_url = COALESCE(?, logo_url),
           total_usd = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      input.name || listing.name,
      input.url || listing.url,
      input.tagline || listing.tagline,
      input.logoUrl ?? null,
      input.newTotalUsd,
      ts,
      listing.id
    );
    return getListingById(listing.id)!;
  });

  return apply();
}

export type ApplyTakeoverInput = {
  listingId?: string;
  name: string;
  url: string;
  tagline: string;
  logoUrl?: string | null;
  email: string;
  chargeUsd: number;
};

/**
 * Takeover: first lock wins. Pays 2× #1 (or min bid if empty board).
 * Adds charge to listing total and writes exclusive takeover lock.
 */
export function applyTakeover(input: ApplyTakeoverInput): {
  listing: Listing;
  lockedUntil: string;
  wasFirstBid: boolean;
} {
  const db = getDb();
  const hours = getTakeoverHours();

  const run = db.transaction(() => {
    // Race: reject if an active lock already exists (first lock wins)
    const existing = activeTakeoverLock();
    if (existing) {
      throw new Error(
        `Takeover already locked until ${existing.locked_until}. First lock wins.`
      );
    }

    const numberOne = getNumberOne();
    const wasFirstBid = !numberOne || numberOne.total_usd <= 0;

    let listing: Listing | null = null;
    if (input.listingId) listing = getListingById(input.listingId);
    if (!listing) listing = getListingByEmail(input.email);

    const ts = nowIso();
    const lockedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    if (!listing) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO listings (id, name, url, tagline, logo_url, email, total_usd, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.name,
        input.url,
        input.tagline,
        input.logoUrl ?? null,
        input.email,
        input.chargeUsd,
        ts,
        ts
      );
      listing = getListingById(id)!;
    } else {
      const newTotal = listing.total_usd + input.chargeUsd;
      db.prepare(
        `UPDATE listings
         SET name = ?, url = ?, tagline = ?, logo_url = COALESCE(?, logo_url),
             total_usd = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        input.name || listing.name,
        input.url || listing.url,
        input.tagline || listing.tagline,
        input.logoUrl ?? null,
        newTotal,
        ts,
        listing.id
      );
      listing = getListingById(listing.id)!;
    }

    db.prepare(`DELETE FROM takeover_locks WHERE datetime(locked_until) <= datetime('now')`).run();
    db.prepare(`DELETE FROM takeover_locks`).run();
    db.prepare(
      `INSERT INTO takeover_locks (id, listing_id, locked_until, created_at) VALUES (?, ?, ?, ?)`
    ).run(randomUUID(), listing.id, lockedUntil, ts);

    return { listing, lockedUntil, wasFirstBid };
  });

  return run();
}

export function seedDemoListings(): void {
  const db = getDb();
  const count = db.prepare(`SELECT COUNT(*) AS c FROM listings`).get() as { c: number };
  if (count.c > 0) return;

  const demos = [
    {
      name: "PixelForge AI",
      url: "https://example.com/pixelforge",
      tagline: "Generate product shots that convert.",
      email: "demo+pixelforge@rankbid.local",
      total_usd: 47,
    },
    {
      name: "ShipLog",
      url: "https://example.com/shiplog",
      tagline: "Changelog + waitlist for indie SaaS.",
      email: "demo+shiplog@rankbid.local",
      total_usd: 28,
    },
    {
      name: "PromptVault",
      url: "https://example.com/promptvault",
      tagline: "Versioned prompts for your team.",
      email: "demo+promptvault@rankbid.local",
      total_usd: 19,
    },
    {
      name: "LatencyCheck",
      url: "https://example.com/latencycheck",
      tagline: "Uptime + p99 for AI APIs.",
      email: "demo+latency@rankbid.local",
      total_usd: 12,
    },
    {
      name: "IndieStack",
      url: "https://example.com/indiestack",
      tagline: "Boilerplate that ships this week.",
      email: "demo+indiestack@rankbid.local",
      total_usd: 8,
    },
  ];

  const ts = nowIso();
  const insert = db.prepare(
    `INSERT INTO listings (id, name, url, tagline, logo_url, email, total_usd, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const d of demos) {
      insert.run(randomUUID(), d.name, d.url, d.tagline, d.email, d.total_usd, ts, ts);
    }
  });
  tx();
}

import { createClient, type Client, type InArgs, type Row, type Transaction } from "@libsql/client";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  getDatabaseConfig,
  getPendingTakeoverMinutes,
  getTakeoverHours,
} from "./config";
import type { LeaderboardEntry, Listing, PaymentRow, PaymentStatus } from "./types";
import { MIN_BID_USD } from "./money";

export class TakeoverRaceError extends Error {
  lockedUntil: string;
  constructor(lockedUntil: string) {
    super(`Takeover already locked until ${lockedUntil}. First lock wins.`);
    this.name = "TakeoverRaceError";
    this.lockedUntil = lockedUntil;
  }
}

export class IdempotentEventError extends Error {
  constructor() {
    super("Stripe event already processed");
    this.name = "IdempotentEventError";
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __rankbidLibsql: Client | undefined;
  // eslint-disable-next-line no-var
  var __rankbidMigrated: Promise<void> | undefined;
}

type ExecClient = Pick<Client, "execute"> | Transaction;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureLocalDir(url: string): void {
  if (!url.startsWith("file:")) return;
  const filePath = url.slice("file:".length);
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
}

export function getClient(): Client {
  if (!global.__rankbidLibsql) {
    const cfg = getDatabaseConfig();
    ensureLocalDir(cfg.url);
    global.__rankbidLibsql = createClient({
      url: cfg.url,
      authToken: cfg.authToken,
    });
  }
  return global.__rankbidLibsql;
}

/** @deprecated use ensureDb — kept name for call-site clarity */
export async function getDb(): Promise<Client> {
  return ensureDb();
}

export async function ensureDb(): Promise<Client> {
  const client = getClient();
  if (!global.__rankbidMigrated) {
    global.__rankbidMigrated = migrate(client);
  }
  await global.__rankbidMigrated;
  return client;
}

async function migrate(db: Client): Promise<void> {
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

    CREATE INDEX IF NOT EXISTS idx_listings_total ON listings(total_usd DESC);
    CREATE INDEX IF NOT EXISTS idx_locks_until ON takeover_locks(locked_until);
    CREATE INDEX IF NOT EXISTS idx_payments_pi ON payments(stripe_payment_intent);
    CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(stripe_charge_id);
    CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_takeovers(expires_at);
  `);

  // Additive migration for DBs created before `frozen`
  try {
    await db.execute(`ALTER TABLE listings ADD COLUMN frozen INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // column already exists
  }
}

function listingFromRow(row: Row): Listing {
  return {
    id: String(row.id),
    name: String(row.name),
    url: String(row.url),
    tagline: String(row.tagline ?? ""),
    logo_url: row.logo_url == null ? null : String(row.logo_url),
    email: String(row.email),
    total_usd: Number(row.total_usd),
    frozen: Number(row.frozen ?? 0) === 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function paymentFromRow(row: Row): PaymentRow {
  return {
    id: String(row.id),
    listing_id: row.listing_id == null ? null : String(row.listing_id),
    stripe_session_id:
      row.stripe_session_id == null ? null : String(row.stripe_session_id),
    stripe_payment_intent:
      row.stripe_payment_intent == null ? null : String(row.stripe_payment_intent),
    stripe_charge_id:
      row.stripe_charge_id == null ? null : String(row.stripe_charge_id),
    kind: String(row.kind),
    charge_usd: Number(row.charge_usd),
    unwound_usd: Number(row.unwound_usd ?? 0),
    status: String(row.status) as PaymentStatus,
    event_id: row.event_id == null ? null : String(row.event_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function exec(
  db: ExecClient,
  sql: string,
  args: InArgs = []
): Promise<{ rows: Row[]; rowsAffected: number }> {
  const result = await db.execute({ sql, args });
  return { rows: result.rows, rowsAffected: result.rowsAffected };
}

export async function listLeaderboard(): Promise<LeaderboardEntry[]> {
  const db = await ensureDb();
  const { rows } = await exec(
    db,
    `SELECT l.*,
            t.locked_until AS locked_until
     FROM listings l
     LEFT JOIN takeover_locks t ON t.listing_id = l.id
     WHERE l.total_usd > 0 AND COALESCE(l.frozen, 0) = 0
     ORDER BY l.total_usd DESC, l.updated_at ASC`
  );

  const now = Date.now();
  return rows.map((row, i) => {
    const lockedUntil =
      row.locked_until == null ? null : String(row.locked_until);
    const isLocked = Boolean(
      lockedUntil && new Date(lockedUntil).getTime() > now
    );
    return {
      ...listingFromRow(row),
      rank: i + 1,
      locked_until: lockedUntil,
      is_locked: isLocked,
    };
  });
}

export async function getListingById(
  id: string,
  db: ExecClient = getClient()
): Promise<Listing | null> {
  await ensureDb();
  const { rows } = await exec(db, `SELECT * FROM listings WHERE id = ?`, [id]);
  return rows[0] ? listingFromRow(rows[0]) : null;
}

export async function getListingByEmail(
  email: string,
  db: ExecClient = getClient()
): Promise<Listing | null> {
  await ensureDb();
  const { rows } = await exec(
    db,
    `SELECT * FROM listings WHERE lower(email) = lower(?)`,
    [email]
  );
  return rows[0] ? listingFromRow(rows[0]) : null;
}

export async function getNumberOne(
  db: ExecClient = getClient()
): Promise<Listing | null> {
  await ensureDb();
  const { rows } = await exec(
    db,
    `SELECT * FROM listings
     WHERE total_usd > 0 AND COALESCE(frozen, 0) = 0
     ORDER BY total_usd DESC, updated_at ASC LIMIT 1`
  );
  return rows[0] ? listingFromRow(rows[0]) : null;
}

export async function activeTakeoverLock(
  db: ExecClient = getClient()
): Promise<{ listing_id: string; locked_until: string } | null> {
  await ensureDb();
  const { rows } = await exec(
    db,
    `SELECT listing_id, locked_until FROM takeover_locks
     WHERE datetime(locked_until) > datetime('now')
     ORDER BY locked_until DESC LIMIT 1`
  );
  if (!rows[0]) return null;
  return {
    listing_id: String(rows[0].listing_id),
    locked_until: String(rows[0].locked_until),
  };
}

export async function activePendingTakeover(
  db: ExecClient = getClient()
): Promise<{ email: string; expires_at: string; stripe_session_id: string | null } | null> {
  await ensureDb();
  await exec(
    db,
    `DELETE FROM pending_takeovers WHERE datetime(expires_at) <= datetime('now')`
  );
  const { rows } = await exec(
    db,
    `SELECT email, expires_at, stripe_session_id FROM pending_takeovers
     WHERE datetime(expires_at) > datetime('now')
     ORDER BY expires_at DESC LIMIT 1`
  );
  if (!rows[0]) return null;
  return {
    email: String(rows[0].email),
    expires_at: String(rows[0].expires_at),
    stripe_session_id:
      rows[0].stripe_session_id == null
        ? null
        : String(rows[0].stripe_session_id),
  };
}

/**
 * Short-lived takeover reservation at Checkout creation.
 * Prevents two parallel Checkout sessions when neither webhook has locked yet.
 */
export async function reservePendingTakeover(email: string): Promise<{
  pendingId: string;
  expiresAt: string;
}> {
  const client = await ensureDb();
  const minutes = getPendingTakeoverMinutes();
  const tx = await client.transaction("write");
  try {
    await exec(
      tx,
      `DELETE FROM pending_takeovers WHERE datetime(expires_at) <= datetime('now')`
    );

    const lock = await activeTakeoverLock(tx);
    if (lock) {
      throw new TakeoverRaceError(lock.locked_until);
    }

    const pending = await activePendingTakeover(tx);
    if (pending) {
      throw new Error(
        `Another takeover checkout is reserved until ${pending.expires_at}. Try again shortly.`
      );
    }

    const pendingId = randomUUID();
    const ts = nowIso();
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    await exec(
      tx,
      `INSERT INTO pending_takeovers (id, email, stripe_session_id, expires_at, created_at)
       VALUES (?, ?, NULL, ?, ?)`,
      [pendingId, email, expiresAt, ts]
    );
    await tx.commit();
    return { pendingId, expiresAt };
  } catch (e) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    tx.close();
  }
}

export async function attachPendingTakeoverSession(
  pendingId: string,
  sessionId: string
): Promise<void> {
  const db = await ensureDb();
  await exec(
    db,
    `UPDATE pending_takeovers SET stripe_session_id = ? WHERE id = ?`,
    [sessionId, pendingId]
  );
}

export async function clearPendingTakeover(opts: {
  pendingId?: string;
  sessionId?: string;
}): Promise<void> {
  const db = await ensureDb();
  if (opts.pendingId) {
    await exec(db, `DELETE FROM pending_takeovers WHERE id = ?`, [opts.pendingId]);
  }
  if (opts.sessionId) {
    await exec(db, `DELETE FROM pending_takeovers WHERE stripe_session_id = ?`, [
      opts.sessionId,
    ]);
  }
}

export async function releasePendingTakeoverById(pendingId: string): Promise<void> {
  await clearPendingTakeover({ pendingId });
}

export type ApplyBidInput = {
  listingId?: string;
  name: string;
  url: string;
  tagline: string;
  logoUrl?: string | null;
  email: string;
  newTotalUsd: number;
  chargeUsd: number;
};

export type ApplyTakeoverInput = {
  listingId?: string;
  name: string;
  url: string;
  tagline: string;
  logoUrl?: string | null;
  email: string;
  chargeUsd: number;
};

export type CheckoutApplyResult =
  | {
      kind: "applied";
      listing: Listing;
      lockedUntil?: string;
      wasFirstBid?: boolean;
      paymentId: string;
    }
  | {
      kind: "takeover_lost";
      paymentId: string;
      lockedUntil: string;
    }
  | { kind: "deduped" };

/**
 * ONE database transaction: claim stripe event id + apply bid/takeover + record payment.
 * Parallel checkout.session.completed cannot double-apply.
 */
export async function applyCheckoutSessionInTransaction(input: {
  eventId: string;
  eventType: string;
  kind: "bid" | "rebid" | "takeover";
  listingId?: string;
  name: string;
  url: string;
  tagline: string;
  logoUrl?: string | null;
  email: string;
  newTotalUsd: number;
  chargeUsd: number;
  stripeSessionId: string;
  stripePaymentIntent?: string | null;
}): Promise<CheckoutApplyResult> {
  const client = await ensureDb();
  const tx = await client.transaction("write");
  try {
    const inserted = await exec(
      tx,
      `INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)`,
      [input.eventId, input.eventType, nowIso()]
    );
    if (inserted.rowsAffected === 0) {
      await tx.rollback();
      return { kind: "deduped" };
    }

    const paymentId = randomUUID();
    const ts = nowIso();
    const pi = input.stripePaymentIntent ?? null;

    if (input.kind === "takeover") {
      try {
        const applied = await applyTakeoverTx(tx, {
          listingId: input.listingId,
          name: input.name,
          url: input.url,
          tagline: input.tagline,
          logoUrl: input.logoUrl,
          email: input.email,
          chargeUsd: input.chargeUsd,
        });
        await exec(
          tx,
          `INSERT INTO payments (
             id, listing_id, stripe_session_id, stripe_payment_intent, stripe_charge_id,
             kind, charge_usd, unwound_usd, status, event_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?)`,
          [
            paymentId,
            applied.listing.id,
            input.stripeSessionId,
            pi,
            "takeover",
            input.chargeUsd,
            "applied",
            input.eventId,
            ts,
            ts,
          ]
        );
        await exec(tx, `DELETE FROM pending_takeovers WHERE stripe_session_id = ? OR datetime(expires_at) <= datetime('now')`, [
          input.stripeSessionId,
        ]);
        await tx.commit();
        return {
          kind: "applied",
          listing: applied.listing,
          lockedUntil: applied.lockedUntil,
          wasFirstBid: applied.wasFirstBid,
          paymentId,
        };
      } catch (e) {
        if (e instanceof TakeoverRaceError) {
          await exec(
            tx,
            `INSERT INTO payments (
               id, listing_id, stripe_session_id, stripe_payment_intent, stripe_charge_id,
               kind, charge_usd, unwound_usd, status, event_id, created_at, updated_at
             ) VALUES (?, NULL, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?)`,
            [
              paymentId,
              input.stripeSessionId,
              pi,
              "takeover",
              input.chargeUsd,
              "takeover_lost_pending_refund",
              input.eventId,
              ts,
              ts,
            ]
          );
          await exec(tx, `DELETE FROM pending_takeovers WHERE stripe_session_id = ?`, [
            input.stripeSessionId,
          ]);
          await tx.commit();
          return { kind: "takeover_lost", paymentId, lockedUntil: e.lockedUntil };
        }
        throw e;
      }
    }

    const listing = await applyBidTx(tx, {
      listingId: input.listingId,
      name: input.name,
      url: input.url,
      tagline: input.tagline,
      logoUrl: input.logoUrl,
      email: input.email,
      newTotalUsd: input.newTotalUsd,
      chargeUsd: input.chargeUsd,
    });
    await exec(
      tx,
      `INSERT INTO payments (
         id, listing_id, stripe_session_id, stripe_payment_intent, stripe_charge_id,
         kind, charge_usd, unwound_usd, status, event_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?)`,
      [
        paymentId,
        listing.id,
        input.stripeSessionId,
        pi,
        input.kind,
        input.chargeUsd,
        "applied",
        input.eventId,
        ts,
        ts,
      ]
    );
    await tx.commit();
    return { kind: "applied", listing, paymentId };
  } catch (e) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    tx.close();
  }
}

async function applyBidTx(tx: Transaction, input: ApplyBidInput): Promise<Listing> {
  if (!Number.isInteger(input.newTotalUsd) || input.newTotalUsd < MIN_BID_USD) {
    throw new Error(`Total must be a whole dollar amount ≥ $${MIN_BID_USD}`);
  }
  if (!Number.isInteger(input.chargeUsd) || input.chargeUsd <= 0) {
    throw new Error("Charge must be a positive whole dollar amount");
  }

  let listing: Listing | null = null;
  if (input.listingId) {
    listing = await getListingById(input.listingId, tx);
  }
  if (!listing) {
    listing = await getListingByEmail(input.email, tx);
  }

  if (!listing) {
    if (input.newTotalUsd !== input.chargeUsd) {
      throw new Error("New listing total must equal charge");
    }
    const id = randomUUID();
    const ts = nowIso();
    await exec(
      tx,
      `INSERT INTO listings (id, name, url, tagline, logo_url, email, total_usd, frozen, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        input.name,
        input.url,
        input.tagline,
        input.logoUrl ?? null,
        input.email,
        input.newTotalUsd,
        ts,
        ts,
      ]
    );
    return (await getListingById(id, tx))!;
  }

  if (listing.frozen) {
    throw new Error("Listing is frozen due to a payment dispute/refund");
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
  await exec(
    tx,
    `UPDATE listings
     SET name = ?, url = ?, tagline = ?, logo_url = COALESCE(?, logo_url),
         total_usd = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name || listing.name,
      input.url || listing.url,
      input.tagline || listing.tagline,
      input.logoUrl ?? null,
      input.newTotalUsd,
      ts,
      listing.id,
    ]
  );
  return (await getListingById(listing.id, tx))!;
}

async function applyTakeoverTx(
  tx: Transaction,
  input: ApplyTakeoverInput
): Promise<{ listing: Listing; lockedUntil: string; wasFirstBid: boolean }> {
  const hours = getTakeoverHours();
  const existing = await activeTakeoverLock(tx);
  if (existing) {
    throw new TakeoverRaceError(existing.locked_until);
  }

  const numberOne = await getNumberOne(tx);
  const wasFirstBid = !numberOne || numberOne.total_usd <= 0;

  let listing: Listing | null = null;
  if (input.listingId) listing = await getListingById(input.listingId, tx);
  if (!listing) listing = await getListingByEmail(input.email, tx);

  if (listing?.frozen) {
    throw new Error("Listing is frozen due to a payment dispute/refund");
  }

  const ts = nowIso();
  const lockedUntil = new Date(
    Date.now() + hours * 60 * 60 * 1000
  ).toISOString();

  if (!listing) {
    const id = randomUUID();
    await exec(
      tx,
      `INSERT INTO listings (id, name, url, tagline, logo_url, email, total_usd, frozen, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        input.name,
        input.url,
        input.tagline,
        input.logoUrl ?? null,
        input.email,
        input.chargeUsd,
        ts,
        ts,
      ]
    );
    listing = (await getListingById(id, tx))!;
  } else {
    const newTotal = listing.total_usd + input.chargeUsd;
    await exec(
      tx,
      `UPDATE listings
       SET name = ?, url = ?, tagline = ?, logo_url = COALESCE(?, logo_url),
           total_usd = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.name || listing.name,
        input.url || listing.url,
        input.tagline || listing.tagline,
        input.logoUrl ?? null,
        newTotal,
        ts,
        listing.id,
      ]
    );
    listing = (await getListingById(listing.id, tx))!;
  }

  await exec(tx, `DELETE FROM takeover_locks`);
  await exec(
    tx,
    `INSERT INTO takeover_locks (id, listing_id, locked_until, created_at) VALUES (?, ?, ?, ?)`,
    [randomUUID(), listing.id, lockedUntil, ts]
  );

  return { listing, lockedUntil, wasFirstBid };
}

export async function markEventProcessedOnly(
  eventId: string,
  type: string
): Promise<boolean> {
  const db = await ensureDb();
  const result = await exec(
    db,
    `INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)`,
    [eventId, type, nowIso()]
  );
  return result.rowsAffected > 0;
}

export async function eventAlreadyProcessed(eventId: string): Promise<boolean> {
  const db = await ensureDb();
  const { rows } = await exec(
    db,
    `SELECT 1 AS ok FROM stripe_events WHERE event_id = ?`,
    [eventId]
  );
  return rows.length > 0;
}

export async function markPaymentRefunded(
  paymentId: string,
  status: PaymentStatus = "takeover_lost_refunded"
): Promise<void> {
  const db = await ensureDb();
  await exec(
    db,
    `UPDATE payments SET status = ?, updated_at = ? WHERE id = ?`,
    [status, nowIso(), paymentId]
  );
}

export async function findPaymentBySessionId(
  sessionId: string
): Promise<PaymentRow | null> {
  const db = await ensureDb();
  const { rows } = await exec(
    db,
    `SELECT * FROM payments WHERE stripe_session_id = ?`,
    [sessionId]
  );
  return rows[0] ? paymentFromRow(rows[0]) : null;
}

export async function findPaymentByPaymentIntent(
  paymentIntentId: string
): Promise<PaymentRow | null> {
  const db = await ensureDb();
  const { rows } = await exec(
    db,
    `SELECT * FROM payments WHERE stripe_payment_intent = ?`,
    [paymentIntentId]
  );
  return rows[0] ? paymentFromRow(rows[0]) : null;
}

export async function findPaymentByChargeId(
  chargeId: string
): Promise<PaymentRow | null> {
  const db = await ensureDb();
  const { rows } = await exec(
    db,
    `SELECT * FROM payments WHERE stripe_charge_id = ?`,
    [chargeId]
  );
  return rows[0] ? paymentFromRow(rows[0]) : null;
}

export async function attachChargeToPayment(
  paymentId: string,
  chargeId: string
): Promise<void> {
  const db = await ensureDb();
  await exec(
    db,
    `UPDATE payments SET stripe_charge_id = ?, updated_at = ? WHERE id = ?`,
    [chargeId, nowIso(), paymentId]
  );
}

/**
 * Unwind ranking dollars after a Stripe refund.
 * Subtracts newly refunded whole USD from the listing; clears takeover lock if held.
 */
export async function unwindPaymentRefundInTransaction(input: {
  eventId: string;
  eventType: string;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  /** Total amount refunded on the charge so far, in USD (floor of cents/100). */
  amountRefundedUsd: number;
}): Promise<{
  kind: "deduped" | "noop" | "unwound";
  listingId?: string;
  deltaUsd?: number;
}> {
  const client = await ensureDb();
  const tx = await client.transaction("write");
  try {
    const inserted = await exec(
      tx,
      `INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)`,
      [input.eventId, input.eventType, nowIso()]
    );
    if (inserted.rowsAffected === 0) {
      await tx.rollback();
      return { kind: "deduped" };
    }

    let payment: PaymentRow | null = null;
    if (input.chargeId) {
      const { rows } = await exec(
        tx,
        `SELECT * FROM payments WHERE stripe_charge_id = ?`,
        [input.chargeId]
      );
      payment = rows[0] ? paymentFromRow(rows[0]) : null;
    }
    if (!payment && input.paymentIntentId) {
      const { rows } = await exec(
        tx,
        `SELECT * FROM payments WHERE stripe_payment_intent = ?`,
        [input.paymentIntentId]
      );
      payment = rows[0] ? paymentFromRow(rows[0]) : null;
    }

    if (!payment) {
      await tx.commit();
      return { kind: "noop" };
    }

    if (input.chargeId && !payment.stripe_charge_id) {
      await exec(
        tx,
        `UPDATE payments SET stripe_charge_id = ?, updated_at = ? WHERE id = ?`,
        [input.chargeId, nowIso(), payment.id]
      );
    }

    // Takeover-lost payments were never applied to rank — just mark refunded
    if (
      payment.status === "takeover_lost_pending_refund" ||
      payment.status === "takeover_lost_refunded"
    ) {
      await exec(
        tx,
        `UPDATE payments SET status = ?, unwound_usd = ?, updated_at = ? WHERE id = ?`,
        ["takeover_lost_refunded", payment.charge_usd, nowIso(), payment.id]
      );
      await tx.commit();
      return { kind: "noop" };
    }

    const targetUnwound = Math.min(
      payment.charge_usd,
      Math.max(0, Math.floor(input.amountRefundedUsd))
    );
    const delta = targetUnwound - payment.unwound_usd;
    if (delta <= 0 || !payment.listing_id) {
      await exec(
        tx,
        `UPDATE payments SET status = CASE WHEN ? >= charge_usd THEN 'refunded' ELSE status END,
             unwound_usd = ?, updated_at = ? WHERE id = ?`,
        [targetUnwound, targetUnwound, nowIso(), payment.id]
      );
      await tx.commit();
      return { kind: "noop" };
    }

    const listing = await getListingById(payment.listing_id, tx);
    if (!listing) {
      await tx.commit();
      return { kind: "noop" };
    }

    const newTotal = Math.max(0, listing.total_usd - delta);
    const ts = nowIso();
    await exec(
      tx,
      `UPDATE listings SET total_usd = ?, updated_at = ? WHERE id = ?`,
      [newTotal, ts, listing.id]
    );

    // Clear takeover lock if this listing holds it
    await exec(
      tx,
      `DELETE FROM takeover_locks WHERE listing_id = ?`,
      [listing.id]
    );

    const newStatus: PaymentStatus =
      targetUnwound >= payment.charge_usd ? "refunded" : payment.status;
    await exec(
      tx,
      `UPDATE payments SET unwound_usd = ?, status = ?, updated_at = ? WHERE id = ?`,
      [targetUnwound, newStatus, ts, payment.id]
    );

    await tx.commit();
    return { kind: "unwound", listingId: listing.id, deltaUsd: delta };
  } catch (e) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    tx.close();
  }
}

/**
 * Freeze listing on dispute so paid rank cannot stick while money is contested.
 */
export async function freezeListingForDisputeInTransaction(input: {
  eventId: string;
  eventType: string;
  paymentIntentId?: string | null;
  chargeId?: string | null;
}): Promise<{ kind: "deduped" | "noop" | "frozen"; listingId?: string }> {
  const client = await ensureDb();
  const tx = await client.transaction("write");
  try {
    const inserted = await exec(
      tx,
      `INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)`,
      [input.eventId, input.eventType, nowIso()]
    );
    if (inserted.rowsAffected === 0) {
      await tx.rollback();
      return { kind: "deduped" };
    }

    let payment: PaymentRow | null = null;
    if (input.chargeId) {
      const { rows } = await exec(
        tx,
        `SELECT * FROM payments WHERE stripe_charge_id = ?`,
        [input.chargeId]
      );
      payment = rows[0] ? paymentFromRow(rows[0]) : null;
    }
    if (!payment && input.paymentIntentId) {
      const { rows } = await exec(
        tx,
        `SELECT * FROM payments WHERE stripe_payment_intent = ?`,
        [input.paymentIntentId]
      );
      payment = rows[0] ? paymentFromRow(rows[0]) : null;
    }

    if (!payment?.listing_id) {
      await tx.commit();
      return { kind: "noop" };
    }

    if (input.chargeId && !payment.stripe_charge_id) {
      await exec(
        tx,
        `UPDATE payments SET stripe_charge_id = ?, updated_at = ? WHERE id = ?`,
        [input.chargeId, nowIso(), payment.id]
      );
    }

    const ts = nowIso();
    await exec(
      tx,
      `UPDATE listings SET frozen = 1, updated_at = ? WHERE id = ?`,
      [ts, payment.listing_id]
    );
    await exec(tx, `DELETE FROM takeover_locks WHERE listing_id = ?`, [
      payment.listing_id,
    ]);
    await exec(
      tx,
      `UPDATE payments SET status = ?, updated_at = ? WHERE id = ?`,
      ["disputed", ts, payment.id]
    );
    await tx.commit();
    return { kind: "frozen", listingId: payment.listing_id };
  } catch (e) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    tx.close();
  }
}

export async function seedDemoListings(): Promise<void> {
  const db = await ensureDb();
  const { rows } = await exec(db, `SELECT COUNT(*) AS c FROM listings`);
  const count = Number(rows[0]?.c ?? 0);
  if (count > 0) return;

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
  const stmts = demos.map((d) => ({
    sql: `INSERT INTO listings (id, name, url, tagline, logo_url, email, total_usd, frozen, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
    args: [randomUUID(), d.name, d.url, d.tagline, d.email, d.total_usd, ts, ts] as InArgs,
  }));
  await db.batch(stmts, "write");
}

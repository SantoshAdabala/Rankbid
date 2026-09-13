# Rankbid

Pay-to-rank status board for indie AI & SaaS. **Rank = dollars.** No algo.

Inspired by the pay-to-rank idea (e.g. outbid.lol) with an original UI and rules tuned for builders.

## Product rules

- **Rank** = cumulative bid in **whole USD only**.
- **Minimum bid**: $2.
- **Rebid**: you set a new cumulative total; Stripe is charged only `(newTotal − currentTotal)`. Rejected if charge ≤ $0. Difference is computed **server-side** (never trust the client for charge amount).
- **Takeover**: pay **2× current #1** to lock #1 for `TAKEOVER_HOURS` (default 6). **If no #1 yet**, takeover is treated as a **normal first bid** (documented in the claim UI). **First lock wins** (takeover race).
- Payments via **Stripe Checkout**; rankings update on idempotent `checkout.session.completed` webhooks (deduped by Stripe **event id** inside the same DB transaction as the apply).
- No get-rich-quick / income claims — this is paid visibility on a public board.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- **libSQL / Turso** via `@libsql/client` (local `file:` SQLite for dev; Turso for Vercel)
- Stripe Checkout + webhooks

## Setup

```bash
git clone https://github.com/SantoshAdabala/Rankbid.git
cd Rankbid
npm install
cp .env.example .env
# edit .env with Stripe test keys (optional for viewing the seeded board)
npm run seed          # demo listings without Stripe
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret (`sk_test_…` then `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_…`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable key (Checkout redirect uses server session URL) |
| `TURSO_DATABASE_URL` | libSQL URL. Local: `file:./data/rankbid.db`. Prod: `libsql://…turso.io` |
| `TURSO_AUTH_TOKEN` | Turso auth token (required for remote Turso; leave empty for local file) |
| `DATABASE_URL` | Optional alias for `TURSO_DATABASE_URL` |
| `TAKEOVER_HOURS` | Hours #1 stays locked after takeover (default `6`) |
| `PENDING_TAKEOVER_MINUTES` | Short-lived takeover Checkout reservation (default `20`) |
| `NEXT_PUBLIC_BASE_URL` | Public origin for success/cancel URLs |

### Vercel env vars (production)

Set these in the Vercel project **Settings → Environment Variables** (Production + Preview as needed):

| Var | Required | Notes |
|-----|----------|-------|
| `TURSO_DATABASE_URL` | **Yes** | `libsql://your-db-….turso.io` — **do not** use local `file:` on Vercel (ephemeral FS) |
| `TURSO_AUTH_TOKEN` | **Yes** | From `turso db tokens create …` |
| `STRIPE_SECRET_KEY` | **Yes** | Live or test depending on env |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | From Stripe webhook endpoint for this deployment |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Recommended | Matching mode as secret key |
| `NEXT_PUBLIC_BASE_URL` | **Yes** | e.g. `https://your-app.vercel.app` |
| `TAKEOVER_HOURS` | Optional | Default `6` |
| `PENDING_TAKEOVER_MINUTES` | Optional | Default `20` |

Create a Turso database:

```bash
turso db create rankbid
turso db show rankbid --url          # → TURSO_DATABASE_URL
turso db tokens create rankbid       # → TURSO_AUTH_TOKEN
```

Subscribe the Stripe webhook endpoint to at least:

- `checkout.session.completed`
- `charge.refunded`
- `charge.dispute.created`

## Money-safety fixes

### 1. Durable DB (not SQLite-on-Vercel)

Vercel serverless has an **ephemeral filesystem** — a local SQLite file would wipe board/events between invocations. Rankbid uses **libSQL**:

- **Local**: `TURSO_DATABASE_URL=file:./data/rankbid.db` (no token)
- **Production**: Turso remote URL + `TURSO_AUTH_TOKEN`

### 2. Idempotency race (single transaction)

`checkout.session.completed` handling runs in **one** write transaction:

1. `INSERT OR IGNORE` into `stripe_events` (event id PK)
2. Apply bid / takeover + insert `payments` row
3. Commit

If two webhooks race, only one insert succeeds; the other returns `deduped` and does **not** double-apply rank dollars.

### 3. Refund / dispute unwind

| Stripe event | Behavior |
|--------------|----------|
| `charge.refunded` | Looks up `payments` by charge / payment_intent. Subtracts newly refunded whole USD from `listings.total_usd` (floored at 0), clears that listing’s takeover lock, marks payment `refunded` when fully unwound. Takeover-loser payments (never applied to rank) are only status-updated. |
| `charge.dispute.created` | **Freezes** the listing (`frozen=1`, hidden from the board), clears its takeover lock, marks payment `disputed`. Rank cannot stick while money is contested. |

### 4. Takeover loser refund

Two defenses so a skipped takeover does not keep paying:

1. **Short-lived lock at Checkout creation** — `pending_takeovers` reservation (`PENDING_TAKEOVER_MINUTES`, default 20) blocks a second takeover Checkout while one is open.
2. **Webhook auto-refund** — if two sessions still complete and the second loses “first lock wins”, the handler records `takeover_lost_pending_refund` and calls Stripe `refunds.create` on the PaymentIntent when keys are present, then marks `takeover_lost_refunded`.

## Stripe test → live checklist

1. Create a Stripe account and use **test mode** keys in `.env`.
2. `npm run dev`, then in another terminal:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```
   Copy the `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
3. Claim a spot on `/claim` with a [test card](https://stripe.com/docs/testing) (`4242…`).
4. Confirm webhook fires `checkout.session.completed`, event id is stored, and the board updates once.
5. Replay the same event (`stripe events resend evt_…`) — should **dedupe** (no double credit).
6. Exercise **rebid**: raise total by $1+; charge must equal difference only.
7. Exercise **takeover**: with an existing #1, pay 2×; confirm lock; a second concurrent takeover should lose (**first lock wins**) and be **auto-refunded**.
8. Empty the board (or fresh DB) and confirm takeover without #1 behaves as a **normal first bid**.
9. Refund a test payment in Stripe Dashboard — confirm `charge.refunded` unwinds `total_usd`.
10. Switch to **live** keys, new live webhook endpoint pointing at `/api/webhook`, update `NEXT_PUBLIC_BASE_URL` + Turso env on Vercel, re-test with a small real charge.

## Webhook notes

### Idempotency

Processed Stripe event ids are stored in `stripe_events`. Claim of the event id and the bid/takeover apply share **one** DB transaction so parallel deliveries cannot double-apply.

### Rebid math

Checkout metadata carries `chargeUsd` and `targetTotalUsd`. On `checkout.session.completed`, the server verifies:

`newTotal === currentTotal + charge` (or `newTotal === charge` for a brand-new listing).

Clients cannot invent a cheaper upgrade.

### Takeover race

`applyTakeover` rejects if an active lock already exists (**first lock wins**). Losers are marked processed and **auto-refunded** via the Stripe API when configured. Session creation also takes a short-lived `pending_takeovers` reservation.

## What works

- Landing + live leaderboard (seeded demos without Stripe)
- Claim / rebid / takeover Checkout session creation
- Idempotent webhook → durable DB rank updates + takeover lock (single transaction)
- Whole-dollar validation, min $2, server-side rebid charge
- Takeover empty-board = first bid; active lock + pending reservation block new takeovers
- Takeover loser auto-refund; `charge.refunded` unwind; dispute freeze

## TODO

- Admin UI for removing abusive listings / unfreezing after won disputes
- Email ownership verification beyond Checkout email

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run seed` | Insert demo listings if DB empty |

## License

MIT

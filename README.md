# Rankbid

Pay-to-rank status board for indie AI & SaaS. **Rank = dollars.** No algo.

Inspired by the pay-to-rank idea (e.g. outbid.lol) with an original UI and rules tuned for builders.

## Product rules

- **Rank** = cumulative bid in **whole USD only**.
- **Minimum bid**: $2.
- **Rebid**: you set a new cumulative total; Stripe is charged only `(newTotal − currentTotal)`. Rejected if charge ≤ $0. Difference is computed **server-side** (never trust the client for charge amount).
- **Takeover**: pay **2× current #1** to lock #1 for `TAKEOVER_HOURS` (default 6). **If no #1 yet**, takeover is treated as a **normal first bid** (documented in the claim UI). **First lock wins** (takeover race).
- Payments via **Stripe Checkout**; rankings update on idempotent `checkout.session.completed` webhooks (deduped by Stripe **event id**).
- No get-rich-quick / income claims — this is paid visibility on a public board.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- SQLite via `better-sqlite3` (single file, simple local deploy)
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
| `SQLITE_PATH` | Path to SQLite file (default `./data/rankbid.db`) |
| `TAKEOVER_HOURS` | Hours #1 stays locked after takeover (default `6`) |
| `NEXT_PUBLIC_BASE_URL` | Public origin for success/cancel URLs |

`DATABASE_URL` is accepted as an alias for `SQLITE_PATH` if you prefer that name.

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
7. Exercise **takeover**: with an existing #1, pay 2×; confirm lock; a second concurrent takeover should lose (**first lock wins**).
8. Empty the board (or fresh DB) and confirm takeover without #1 behaves as a **normal first bid**.
9. Switch to **live** keys, new live webhook endpoint pointing at `/api/webhook`, update `NEXT_PUBLIC_BASE_URL`, re-test with a small real charge.

## Webhook notes

### Idempotency

Processed Stripe event ids are stored in `stripe_events`. Duplicate deliveries of the same `event.id` are acknowledged without applying the bid twice.

### Rebid math

Checkout metadata carries `chargeUsd` and `targetTotalUsd`. On `checkout.session.completed`, the server verifies:

`newTotal === currentTotal + charge` (or `newTotal === charge` for a brand-new listing).

Clients cannot invent a cheaper upgrade.

### Takeover race

`applyTakeover` runs in a SQLite transaction: if an active lock already exists, the second takeover fails (**first lock wins**). A losing race after payment is marked processed and skipped (refund/unwind is TODO — see below).

## What works (MVP)

- Landing + live leaderboard (seeded demos without Stripe)
- Claim / rebid / takeover Checkout session creation
- Idempotent webhook → SQLite rank updates + takeover lock
- Whole-dollar validation, min $2, server-side rebid charge
- Takeover empty-board = first bid; active lock blocks new takeovers

## TODO

- **Refund / dispute unwind**: chargebacks and refunds do not yet reverse `total_usd` or clear locks. Wire `charge.refunded` / `charge.dispute.created` (or Checkout-related events) to unwind rankings.
- Admin UI for removing abusive listings
- Email ownership verification beyond Checkout email
- Production hosting notes (persistent disk for SQLite, or move to Postgres)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run seed` | Insert demo listings if DB empty |

## License

MIT

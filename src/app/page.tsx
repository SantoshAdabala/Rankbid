import Link from "next/link";
import { Header } from "@/components/Header";
import { Leaderboard } from "@/components/Leaderboard";
import {
  getDb,
  listLeaderboard,
  seedDemoListings,
  activeTakeoverLock,
  getNumberOne,
} from "@/lib/db";
import { getTakeoverHours } from "@/lib/config";
import { computeTakeoverCharge, MIN_BID_USD } from "@/lib/money";

export const dynamic = "force-dynamic";

export default function HomePage() {
  getDb();
  seedDemoListings();
  const entries = listLeaderboard();
  const lock = activeTakeoverLock();
  const numberOne = getNumberOne();
  const takeover = computeTakeoverCharge(numberOne?.total_usd ?? null);
  const hours = getTakeoverHours();

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 pb-20 sm:px-6">
        <section className="pt-6 sm:pt-10">
          <p className="mono mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-black/30 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--accent-2)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-2)]" />
            Status board · indie AI & SaaS
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Pay $1 more. Take #1.{" "}
            <span className="bg-gradient-to-r from-[#7c5cff] to-[#22d3ee] bg-clip-text text-transparent">
              No algo.
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[var(--muted)] sm:text-xl">
            The status board for indie AI & SaaS. Rank = dollars. Rebid only the difference.
            Takeover locks #1 for hours.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/claim" className="btn-primary px-6 py-3.5 text-base">
              Claim your spot — from ${MIN_BID_USD}
            </Link>
            <a href="#rules" className="btn-ghost px-6 py-3.5 text-base text-[var(--muted)]">
              How ranking works
            </a>
          </div>
        </section>

        <Leaderboard
          entries={entries}
          takeoverHours={hours}
          takeoverChargeUsd={takeover.chargeUsd}
          takeoverIsFirstBid={takeover.isFirstBid}
          lockedUntil={lock?.locked_until ?? null}
        />

        <section id="rules" className="grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Rank = dollars",
              body: "Your position is your cumulative whole-USD bid. Higher total = higher rank. Simple.",
            },
            {
              title: "Rebid the difference",
              body: `Want to raise your total? Pay only (newTotal − currentTotal). Rejected if ≤ $0. Min first bid $${MIN_BID_USD}.`,
            },
            {
              title: "Takeover lock",
              body: `Pay 2× current #1 to lock the top for ${hours} hours. If no #1 yet, takeover = a normal first bid. First lock wins.`,
            },
          ].map((card) => (
            <div key={card.title} className="glow-panel rounded-3xl p-5">
              <h3 className="font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{card.body}</p>
            </div>
          ))}
        </section>

        <footer className="border-t border-[var(--border)] pt-8 text-sm text-[var(--muted)]">
          <p>
            Rankbid is a paid status board — not investment advice, not a get-rich-quick scheme.
            You pay for visibility on this list.
          </p>
        </footer>
      </main>
    </>
  );
}

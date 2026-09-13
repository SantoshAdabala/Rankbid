import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { WhyBid } from "@/components/WhyBid";
import { SocialProof } from "@/components/SocialProof";
import { Leaderboard } from "@/components/Leaderboard";
import {
  ensureDb,
  listLeaderboard,
  seedDemoListings,
  activeTakeoverLock,
  getNumberOne,
} from "@/lib/db";
import { getTakeoverHours } from "@/lib/config";
import { computeTakeoverCharge } from "@/lib/money";
import type { LeaderboardEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDb();
  await seedDemoListings();
  const entries = await listLeaderboard();
  const lock = await activeTakeoverLock();
  const numberOne = await getNumberOne();
  const takeover = computeTakeoverCharge(numberOne?.total_usd ?? null);
  const hours = getTakeoverHours();

  const numberOneEntry: LeaderboardEntry | null =
    entries.find((e) => e.rank === 1) ??
    (numberOne
      ? {
          ...numberOne,
          rank: 1,
          locked_until: lock?.locked_until ?? null,
          is_locked: Boolean(
            lock?.locked_until &&
              new Date(lock.locked_until).getTime() > Date.now()
          ),
        }
      : null);

  const totalBidUsd = entries.reduce((sum, e) => sum + e.total_usd, 0);

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pb-14 pt-5 sm:gap-6 sm:px-5 sm:pt-6">
        <Hero
          numberOne={numberOneEntry}
          takeoverChargeUsd={takeover.chargeUsd}
          takeoverIsFirstBid={takeover.isFirstBid}
          takeoverHours={hours}
          lockedUntil={lock?.locked_until ?? null}
        />

        <WhyBid />

        <SocialProof
          listingCount={entries.length}
          totalBidUsd={totalBidUsd}
          lockedUntil={lock?.locked_until ?? null}
        />

        <Leaderboard
          entries={entries}
          takeoverHours={hours}
          takeoverChargeUsd={takeover.chargeUsd}
          takeoverIsFirstBid={takeover.isFirstBid}
          lockedUntil={lock?.locked_until ?? null}
        />

        <footer className="border-t border-[var(--border)] pt-4 text-[12px] leading-relaxed text-[var(--muted)]">
          Rank = cumulative whole USD. Rebid = pay the difference. Takeover = 2×
          #1, locks {hours}h. Paid status board — not investment advice.
        </footer>
      </main>
    </>
  );
}

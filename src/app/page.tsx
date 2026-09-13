import { Header } from "@/components/Header";
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

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDb();
  await seedDemoListings();
  const entries = await listLeaderboard();
  const lock = await activeTakeoverLock();
  const numberOne = await getNumberOne();
  const takeover = computeTakeoverCharge(numberOne?.total_usd ?? null);
  const hours = getTakeoverHours();

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-12 pt-4 sm:px-5">
        <Leaderboard
          entries={entries}
          takeoverHours={hours}
          takeoverChargeUsd={takeover.chargeUsd}
          takeoverIsFirstBid={takeover.isFirstBid}
          lockedUntil={lock?.locked_until ?? null}
        />
        <footer className="pt-2 text-[12px] leading-relaxed text-[var(--muted)]">
          Rank = cumulative whole USD. Rebid = pay the difference. Takeover = 2× #1,
          locks {hours}h. Paid status board — not investment advice.
        </footer>
      </main>
    </>
  );
}

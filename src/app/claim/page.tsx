import Link from "next/link";
import { Header } from "@/components/Header";
import { ClaimForm } from "@/components/ClaimForm";
import {
  ensureDb,
  seedDemoListings,
  activeTakeoverLock,
  getNumberOne,
} from "@/lib/db";
import { getTakeoverHours } from "@/lib/config";
import { computeTakeoverCharge } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; kind?: string }>;
}) {
  await ensureDb();
  await seedDemoListings();
  const params = await searchParams;
  const lock = await activeTakeoverLock();
  const numberOne = await getNumberOne();
  const takeover = computeTakeoverCharge(numberOne?.total_usd ?? null);
  const hours = getTakeoverHours();
  const initialKind = params.kind === "takeover" ? "takeover" : "bid";

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-5 sm:px-5 sm:pt-6">
        {params.canceled && (
          <div className="mb-3 border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted-2)]">
            Checkout canceled. No charge.{" "}
            <Link href="/" className="underline underline-offset-2">
              Back to board
            </Link>
          </div>
        )}

        {numberOne && (
          <div className="mb-3 flex items-baseline justify-between gap-3 border border-[var(--border)] px-3.5 py-2.5 text-[12px]">
            <span className="min-w-0 truncate text-[var(--muted)]">
              Opponent ·{" "}
              <span className="font-medium text-[var(--text)]">
                {numberOne.name}
              </span>
            </span>
            <span className="tabular shrink-0 font-semibold">
              ${numberOne.total_usd.toLocaleString("en-US")}
            </span>
          </div>
        )}

        <ClaimForm
          takeoverChargeUsd={takeover.chargeUsd}
          takeoverIsFirstBid={takeover.isFirstBid}
          takeoverHours={hours}
          lockedUntil={lock?.locked_until ?? null}
          numberOneName={numberOne?.name ?? null}
          numberOneTotalUsd={numberOne?.total_usd ?? null}
          initialKind={initialKind}
        />
      </main>
    </>
  );
}

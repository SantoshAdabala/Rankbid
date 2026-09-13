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
  searchParams: Promise<{ canceled?: string }>;
}) {
  await ensureDb();
  await seedDemoListings();
  const params = await searchParams;
  const lock = await activeTakeoverLock();
  const numberOne = await getNumberOne();
  const takeover = computeTakeoverCharge(numberOne?.total_usd ?? null);
  const hours = getTakeoverHours();

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-20 sm:px-6">
        {params.canceled && (
          <div className="mb-4 rounded-2xl border border-[var(--border)] bg-black/30 px-4 py-3 text-sm text-[var(--muted)]">
            Checkout canceled. No charge.{" "}
            <Link href="/" className="underline">
              Back to board
            </Link>
          </div>
        )}
        <ClaimForm
          takeoverChargeUsd={takeover.chargeUsd}
          takeoverIsFirstBid={takeover.isFirstBid}
          takeoverHours={hours}
          lockedUntil={lock?.locked_until ?? null}
        />
      </main>
    </>
  );
}

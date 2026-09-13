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
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4 sm:px-5">
        {params.canceled && (
          <div className="mb-3 border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted-2)]">
            Checkout canceled. No charge.{" "}
            <Link href="/" className="underline underline-offset-2">
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

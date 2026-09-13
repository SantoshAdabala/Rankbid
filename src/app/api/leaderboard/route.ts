import { NextResponse } from "next/server";
import { getDb, listLeaderboard, activeTakeoverLock, getNumberOne } from "@/lib/db";
import { getTakeoverHours } from "@/lib/config";
import { computeTakeoverCharge } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET() {
  getDb();
  const entries = listLeaderboard();
  const lock = activeTakeoverLock();
  const numberOne = getNumberOne();
  const takeover = computeTakeoverCharge(numberOne?.total_usd ?? null);

  return NextResponse.json({
    entries,
    takeover: {
      hours: getTakeoverHours(),
      chargeUsd: takeover.chargeUsd,
      isFirstBid: takeover.isFirstBid,
      lockedUntil: lock?.locked_until ?? null,
      lockedListingId: lock?.listing_id ?? null,
    },
  });
}

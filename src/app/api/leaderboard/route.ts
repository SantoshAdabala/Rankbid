import { NextResponse } from "next/server";
import {
  ensureDb,
  listLeaderboard,
  activeTakeoverLock,
  getNumberOne,
} from "@/lib/db";
import { getTakeoverHours } from "@/lib/config";
import { computeTakeoverCharge } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDb();
  const entries = await listLeaderboard();
  const lock = await activeTakeoverLock();
  const numberOne = await getNumberOne();
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

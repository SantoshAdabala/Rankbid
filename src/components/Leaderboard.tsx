import Link from "next/link";
import type { LeaderboardEntry } from "@/lib/types";

type Props = {
  entries: LeaderboardEntry[];
  takeoverHours: number;
  takeoverChargeUsd: number;
  takeoverIsFirstBid: boolean;
  lockedUntil: string | null;
};

function formatUsd(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

function lockLabel(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const hrs = Math.ceil(ms / (1000 * 60 * 60));
  return `${hrs}h left`;
}

export function Leaderboard({
  entries,
  takeoverHours,
  takeoverChargeUsd,
  takeoverIsFirstBid,
  lockedUntil,
}: Props) {
  const lockLeft = lockLabel(lockedUntil);

  return (
    <section id="board" className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="label">Full board</p>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {takeoverIsFirstBid ? (
              <span>First bid {formatUsd(takeoverChargeUsd)} min</span>
            ) : (
              <span>
                Takeover{" "}
                <span className="tabular font-medium text-[var(--muted-2)]">
                  {formatUsd(takeoverChargeUsd)}
                </span>
                <span> · {takeoverHours}h lock</span>
                {lockLeft && <span> · locked {lockLeft}</span>}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/claim"
          className="btn-ghost shrink-0 px-2.5 py-1.5 text-[12px]"
        >
          Bid
        </Link>
      </div>

      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_4.5rem] gap-2 border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] sm:grid-cols-[2.75rem_minmax(0,1fr)_5rem] sm:px-4">
        <div>#</div>
        <div>Name</div>
        <div className="text-right">$</div>
      </div>

      {entries.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-[var(--muted)]">
          Board empty. Claim from $2.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {entries.map((e) => (
            <li
              key={e.id}
              className={`grid grid-cols-[2.25rem_minmax(0,1fr)_4.5rem] items-center gap-2 px-3 py-2 sm:grid-cols-[2.75rem_minmax(0,1fr)_5rem] sm:px-4 sm:py-2.5 ${
                e.rank === 1 ? "bg-[var(--row-hot)]" : ""
              }`}
            >
              <div
                className={`tabular text-[13px] font-semibold ${
                  e.rank === 1 ? "text-[var(--text)]" : "text-[var(--muted)]"
                }`}
              >
                {e.rank}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[13px] font-medium tracking-[-0.02em] hover:underline sm:text-[14px]"
                  >
                    {e.name}
                  </a>
                  {e.rank === 1 && e.is_locked && (
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">
                      locked
                    </span>
                  )}
                </div>
                {(e.tagline || e.url) && (
                  <p className="truncate text-[11px] text-[var(--muted)] sm:text-[12px]">
                    {e.tagline || e.url}
                  </p>
                )}
              </div>
              <div className="tabular shrink-0 text-right text-[13px] font-semibold sm:text-[14px]">
                {formatUsd(e.total_usd)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

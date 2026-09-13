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
    <section id="board" className="glow-panel overflow-hidden rounded-3xl">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div>
          <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]">
            Live board
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Indie AI & SaaS ranks</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Rank = cumulative dollars. No algo. No get-rich-quick claims — just paid status.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-black/20 px-4 py-3 text-sm">
          <div className="text-[var(--muted)]">Takeover</div>
          <div className="font-semibold">
            {takeoverIsFirstBid ? (
              <>No #1 yet → first bid (${takeoverChargeUsd} min)</>
            ) : (
              <>Pay {formatUsd(takeoverChargeUsd)} · lock #1 for {takeoverHours}h</>
            )}
          </div>
          {lockLeft && (
            <div className="mt-1 text-xs text-[var(--gold)]">#1 locked · {lockLeft}</div>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="px-7 py-16 text-center text-[var(--muted)]">
          Board is empty. Be the first — claim from $2.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {entries.map((e) => (
            <li
              key={e.id}
              className={`flex items-center gap-4 px-5 py-4 sm:px-7 ${
                e.rank === 1 ? "bg-[rgba(245,197,66,0.06)]" : ""
              }`}
            >
              <div
                className={`mono w-10 shrink-0 text-center text-lg font-bold ${
                  e.rank === 1 ? "rank-gold" : "text-[var(--muted)]"
                }`}
              >
                #{e.rank}
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] text-sm font-semibold">
                {e.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.logo_url}
                    alt=""
                    className="h-11 w-11 rounded-2xl object-cover"
                  />
                ) : (
                  e.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-semibold hover:underline"
                  >
                    {e.name}
                  </a>
                  {e.rank === 1 && e.is_locked && (
                    <span className="rounded-full border border-[rgba(245,197,66,0.35)] bg-[rgba(245,197,66,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gold)]">
                      Locked
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-[var(--muted)]">{e.tagline || e.url}</p>
              </div>
              <div className="mono shrink-0 text-right text-base font-semibold sm:text-lg">
                {formatUsd(e.total_usd)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Props = {
  listingCount: number;
  totalBidUsd: number;
  lockedUntil: string | null;
};

function formatUsd(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

function formatLockUntil(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (t <= Date.now()) return null;
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SocialProof({ listingCount, totalBidUsd, lockedUntil }: Props) {
  const lockUntil = formatLockUntil(lockedUntil);

  if (listingCount === 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-[var(--border)] px-3.5 py-2.5 text-[12px] text-[var(--muted)]">
        <span>Board empty</span>
        <span className="text-[var(--border-strong)]">·</span>
        <span>$0 total bid</span>
        <span className="text-[var(--border-strong)]">·</span>
        <span>#1 open</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-[var(--border)] px-3.5 py-2.5 text-[12px] text-[var(--muted-2)]">
      <span className="tabular">
        <strong className="font-semibold text-[var(--text)]">{listingCount}</strong>{" "}
        listing{listingCount === 1 ? "" : "s"}
      </span>
      <span className="text-[var(--border-strong)]">·</span>
      <span className="tabular">
        <strong className="font-semibold text-[var(--text)]">
          {formatUsd(totalBidUsd)}
        </strong>{" "}
        total bid
      </span>
      <span className="text-[var(--border-strong)]">·</span>
      {lockUntil ? (
        <span>
          #1 locked until{" "}
          <span className="tabular text-[var(--text)]">{lockUntil}</span>
        </span>
      ) : (
        <span>#1 unlocked</span>
      )}
    </div>
  );
}

import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-5">
        <Link href="/" className="min-w-0 space-y-1.5">
          <div className="text-[16px] font-semibold tracking-[-0.04em]">
            Rankbid
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight text-[var(--muted)]">
            <span>Rank = dollars</span>
            <span className="text-[var(--border-strong)]" aria-hidden>
              /
            </span>
            <span>Bid from $2</span>
            <span className="text-[var(--border-strong)]" aria-hidden>
              /
            </span>
            <span>No algo</span>
          </div>
        </Link>
        <Link
          href="/claim"
          className="btn-primary shrink-0 px-3.5 py-2 text-[13px]"
        >
          Place bid
        </Link>
      </div>
    </header>
  );
}

import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-5">
        <Link href="/" className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.04em]">Rankbid</div>
          <div className="truncate text-[12px] text-[var(--muted)]">
            Pay $1 more. Take #1. Rank = dollars.
          </div>
        </Link>
        <Link href="/claim" className="btn-primary shrink-0 px-3 py-1.5 text-[13px]">
          Claim
        </Link>
      </div>
    </header>
  );
}

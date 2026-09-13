import Link from "next/link";

export function Header() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-6">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#22d3ee] text-sm font-bold text-white">
          R
        </span>
        <span className="text-lg font-semibold tracking-tight">Rankbid</span>
      </Link>
      <nav className="flex items-center gap-3 text-sm">
        <a href="#board" className="btn-ghost hidden px-4 py-2 text-[var(--muted)] sm:inline-flex">
          Leaderboard
        </a>
        <a href="#rules" className="btn-ghost hidden px-4 py-2 text-[var(--muted)] sm:inline-flex">
          Rules
        </a>
        <Link href="/claim" className="btn-primary px-5 py-2.5 text-sm">
          Claim your spot
        </Link>
      </nav>
    </header>
  );
}

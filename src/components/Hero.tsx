import Link from "next/link";
import type { LeaderboardEntry } from "@/lib/types";

type Props = {
  numberOne: LeaderboardEntry | null;
  takeoverChargeUsd: number;
  takeoverIsFirstBid: boolean;
  takeoverHours: number;
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

export function Hero({
  numberOne,
  takeoverChargeUsd,
  takeoverIsFirstBid,
  takeoverHours,
  lockedUntil,
}: Props) {
  const lockUntil = formatLockUntil(lockedUntil);
  const locked = Boolean(lockUntil && numberOne?.is_locked);

  if (!numberOne) {
    return (
      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-2.5 sm:px-5">
          <p className="label">#1 — open</p>
        </div>
        <div className="flex flex-col gap-5 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-5 sm:py-7">
          <div className="min-w-0 space-y-2">
            <h1 className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.05em] sm:text-[2rem]">
              Nobody holds #1.
            </h1>
            <p className="max-w-md text-[13px] leading-relaxed text-[var(--muted-2)]">
              Indie AI &amp; SaaS status board. Rank = dollars. First claim from{" "}
              {formatUsd(takeoverChargeUsd)}.
            </p>
          </div>
          <Link
            href="/claim"
            className="btn-primary inline-flex shrink-0 items-center justify-center px-5 py-3 text-[14px]"
          >
            Claim #1
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5 sm:px-5">
        <p className="label">#1 right now</p>
        {locked ? (
          <p className="text-[11px] text-[var(--muted)]">
            Locked until {lockUntil}
          </p>
        ) : (
          <p className="text-[11px] text-[var(--muted)]">Unlocked — take it</p>
        )}
      </div>

      <div className="flex flex-col gap-6 px-4 py-6 sm:flex-row sm:items-stretch sm:justify-between sm:gap-8 sm:px-5 sm:py-7">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-3">
            {numberOne.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={numberOne.logo_url}
                alt=""
                width={40}
                height={40}
                className="mt-0.5 h-10 w-10 shrink-0 border border-[var(--border)] object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--border-strong)] bg-black text-[11px] font-semibold tracking-[-0.02em] text-[var(--muted-2)]"
              >
                #1
              </div>
            )}
            <div className="min-w-0">
              <a
                href={numberOne.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.05em] hover:underline sm:text-[1.85rem]"
              >
                {numberOne.name}
              </a>
              {numberOne.tagline && (
                <p className="mt-1 max-w-lg text-[13px] leading-snug text-[var(--muted-2)] sm:text-[14px]">
                  {numberOne.tagline}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[var(--border)] pt-3">
            <div>
              <span className="label">Standing</span>
              <p className="tabular mt-0.5 text-[1.35rem] font-semibold tracking-[-0.04em]">
                {formatUsd(numberOne.total_usd)}
              </p>
            </div>
            <div className="hidden h-8 w-px bg-[var(--border)] sm:block" />
            <div>
              <span className="label">Takeover</span>
              <p className="tabular mt-0.5 text-[1.35rem] font-semibold tracking-[-0.04em]">
                {formatUsd(takeoverChargeUsd)}
                <span className="ml-1.5 text-[12px] font-normal text-[var(--muted)]">
                  · {takeoverHours}h lock
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col justify-end gap-2 sm:w-[11.5rem]">
          <Link
            href="/claim?kind=takeover"
            className="btn-primary inline-flex w-full items-center justify-center px-4 py-3 text-[14px]"
          >
            Take #1 — {formatUsd(takeoverChargeUsd)}
          </Link>
          <Link
            href="/claim"
            className="btn-ghost inline-flex w-full items-center justify-center px-4 py-2.5 text-[12px]"
          >
            Bid instead
          </Link>
        </div>
      </div>
    </section>
  );
}

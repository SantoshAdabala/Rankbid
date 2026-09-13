"use client";

import { useMemo, useState } from "react";
import { MIN_BID_USD } from "@/lib/money";

type Kind = "bid" | "takeover";

type Props = {
  takeoverChargeUsd: number;
  takeoverIsFirstBid: boolean;
  takeoverHours: number;
  lockedUntil: string | null;
  numberOneName?: string | null;
  numberOneTotalUsd?: number | null;
  initialKind?: Kind;
};

function formatUsd(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

export function ClaimForm({
  takeoverChargeUsd,
  takeoverIsFirstBid,
  takeoverHours,
  lockedUntil,
  numberOneName = null,
  numberOneTotalUsd = null,
  initialKind = "bid",
}: Props) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [email, setEmail] = useState("");
  const [targetTotalUsd, setTargetTotalUsd] = useState(
    Math.max(MIN_BID_USD, (numberOneTotalUsd ?? 0) + 1)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockActive = useMemo(() => {
    if (!lockedUntil) return false;
    return new Date(lockedUntil).getTime() > Date.now();
  }, [lockedUntil]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        kind,
        name,
        url,
        tagline,
        logoUrl: logoUrl || undefined,
        email,
      };
      if (kind === "bid") {
        payload.targetTotalUsd = Number(targetTotalUsd);
      }

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Checkout failed");
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  const fightLine =
    kind === "takeover"
      ? takeoverIsFirstBid
        ? "Board empty. First to pay holds #1."
        : numberOneName
          ? `Take ${numberOneName} for ${formatUsd(takeoverChargeUsd)}. Lock ${takeoverHours}h.`
          : `Pay ${formatUsd(takeoverChargeUsd)}. Lock #1 for ${takeoverHours}h.`
      : numberOneName
        ? `Climb past ${numberOneName}. Rebid = pay only the difference.`
        : "Set your cumulative total. Rebid = pay only the difference.";

  return (
    <form onSubmit={onSubmit} className="panel overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <p className="label">The fight</p>
        <h1 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.045em] sm:text-[1.5rem]">
          Place your bid
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted-2)]">
          {fightLine}
        </p>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setKind("bid")}
            className={`px-3 py-2.5 text-[13px] font-medium ${
              kind === "bid"
                ? "bg-white text-black"
                : "bg-transparent text-[var(--muted-2)]"
            }`}
          >
            Bid / Rebid
          </button>
          <button
            type="button"
            onClick={() => setKind("takeover")}
            disabled={lockActive && !takeoverIsFirstBid}
            className={`border-l border-[var(--border)] px-3 py-2.5 text-[13px] font-medium disabled:opacity-40 ${
              kind === "takeover"
                ? "bg-white text-black"
                : "bg-transparent text-[var(--muted-2)]"
            }`}
          >
            Takeover #1
          </button>
        </div>

        {kind === "takeover" && (
          <div className="border border-[var(--border-strong)] bg-black px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="label">Charge</span>
              <span className="tabular text-[1.25rem] font-semibold tracking-[-0.04em]">
                {formatUsd(takeoverChargeUsd)}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted-2)]">
              {takeoverIsFirstBid ? (
                <>Board empty — takeover = first bid at {formatUsd(takeoverChargeUsd)}.</>
              ) : lockActive ? (
                <>
                  Takeover locked until{" "}
                  {new Date(lockedUntil!).toLocaleString()}. Bid / rebid still open.
                </>
              ) : (
                <>
                  2× current #1
                  {numberOneTotalUsd != null
                    ? ` (${formatUsd(numberOneTotalUsd)})`
                    : ""}
                  . Locks top for {takeoverHours}h. First lock wins.
                </>
              )}
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 sm:col-span-2">
            <span className="label">Product name</span>
            <input
              className="input"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PixelForge AI"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="label">URL</span>
            <input
              className="input"
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="label">Tagline</span>
            <input
              className="input"
              maxLength={160}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="One line. Make it count."
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Logo URL (optional)</span>
            <input
              className="input"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Email (receipt + identity)</span>
            <input
              className="input"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          {kind === "bid" && (
            <label className="block space-y-1 sm:col-span-2">
              <span className="label">
                Your cumulative total (USD) — rebid pays the difference
              </span>
              <input
                className="input tabular text-[1.05rem] font-semibold"
                required
                type="number"
                min={MIN_BID_USD}
                step={1}
                value={targetTotalUsd}
                onChange={(e) =>
                  setTargetTotalUsd(Number.parseInt(e.target.value || "0", 10))
                }
              />
              {numberOneTotalUsd != null && numberOneTotalUsd > 0 && (
                <span className="mt-1 block text-[11px] text-[var(--muted)]">
                  #1 sits at {formatUsd(numberOneTotalUsd)}. Beat it or take over.
                </span>
              )}
            </label>
          )}
        </div>

        {error && (
          <div className="border border-[var(--border-strong)] px-3 py-2 text-[12px] text-[var(--muted-2)]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full px-4 py-3 text-[14px]"
        >
          {loading
            ? "Opening Stripe…"
            : kind === "takeover"
              ? `Take #1 — ${formatUsd(takeoverChargeUsd)}`
              : `Lock in bid — from ${formatUsd(MIN_BID_USD)}`}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-[var(--muted)]">
          Whole dollars only. Rank = dollars. No algo.
        </p>
      </div>
    </form>
  );
}

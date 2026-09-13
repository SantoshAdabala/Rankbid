"use client";

import { useMemo, useState } from "react";
import { MIN_BID_USD } from "@/lib/money";

type Kind = "bid" | "takeover";

type Props = {
  takeoverChargeUsd: number;
  takeoverIsFirstBid: boolean;
  takeoverHours: number;
  lockedUntil: string | null;
  currentTotalsHint?: string;
};

export function ClaimForm({
  takeoverChargeUsd,
  takeoverIsFirstBid,
  takeoverHours,
  lockedUntil,
}: Props) {
  const [kind, setKind] = useState<Kind>("bid");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [email, setEmail] = useState("");
  const [targetTotalUsd, setTargetTotalUsd] = useState(MIN_BID_USD);
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

  return (
    <form onSubmit={onSubmit} className="glow-panel space-y-5 rounded-3xl p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Claim your spot</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Whole dollars only. Min ${MIN_BID_USD}. Rebids charge only the difference (server-side).
          Takeover pays 2× current #1 and locks the top for {takeoverHours} hours.
          {takeoverIsFirstBid && (
            <> If there is no #1 yet, takeover is treated as a normal first bid.</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--border)] bg-black/20 p-1">
        <button
          type="button"
          onClick={() => setKind("bid")}
          className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            kind === "bid" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"
          }`}
        >
          Bid / Rebid
        </button>
        <button
          type="button"
          onClick={() => setKind("takeover")}
          disabled={lockActive && !takeoverIsFirstBid}
          className={`rounded-xl px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
            kind === "takeover" ? "bg-[var(--gold)] text-black" : "text-[var(--muted)]"
          }`}
        >
          Takeover #1
        </button>
      </div>

      {kind === "takeover" && (
        <div className="rounded-2xl border border-[rgba(245,197,66,0.3)] bg-[rgba(245,197,66,0.08)] px-4 py-3 text-sm">
          {takeoverIsFirstBid ? (
            <>Board empty — takeover = first bid at ${takeoverChargeUsd}.</>
          ) : lockActive ? (
            <>Takeover currently locked until {new Date(lockedUntil!).toLocaleString()}.</>
          ) : (
            <>
              Charge <strong>${takeoverChargeUsd}</strong> (2× current #1). Locks #1 for{" "}
              {takeoverHours}h. First lock wins.
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-sm text-[var(--muted)]">Product name</span>
          <input
            className="input"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="PixelForge AI"
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-sm text-[var(--muted)]">URL</span>
          <input
            className="input"
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yoursite.com"
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-sm text-[var(--muted)]">Tagline</span>
          <input
            className="input"
            maxLength={160}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="One line. Make it count."
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-[var(--muted)]">Logo URL (optional)</span>
          <input
            className="input"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-[var(--muted)]">Email (receipt + identity)</span>
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
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm text-[var(--muted)]">
              Cumulative total (USD, whole dollars). Rebid = pay only the difference.
            </span>
            <input
              className="input mono"
              required
              type="number"
              min={MIN_BID_USD}
              step={1}
              value={targetTotalUsd}
              onChange={(e) => setTargetTotalUsd(Number.parseInt(e.target.value || "0", 10))}
            />
          </label>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-[rgba(255,107,138,0.35)] bg-[rgba(255,107,138,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full px-5 py-3.5 text-base">
        {loading
          ? "Redirecting to Stripe…"
          : kind === "takeover"
            ? `Takeover — $${takeoverChargeUsd}`
            : `Continue — from $${MIN_BID_USD}`}
      </button>
    </form>
  );
}

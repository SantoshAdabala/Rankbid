export function WhyBid() {
  return (
    <section aria-label="Why bid" className="grid gap-3 sm:grid-cols-3">
      <div className="border border-[var(--border)] px-3.5 py-3">
        <p className="label">Vanity</p>
        <p className="mt-1.5 text-[13px] leading-snug tracking-[-0.02em] text-[var(--muted-2)]">
          Own #1 on the indie status board. Rank is the flex.
        </p>
      </div>
      <div className="border border-[var(--border)] px-3.5 py-3">
        <p className="label">Distribution</p>
        <p className="mt-1.5 text-[13px] leading-snug tracking-[-0.02em] text-[var(--muted-2)]">
          Get featured. Higher rank = more eyes on your link.
        </p>
      </div>
      <div className="border border-[var(--border)] px-3.5 py-3">
        <p className="label">Rules</p>
        <p className="mt-1.5 text-[13px] leading-snug tracking-[-0.02em] text-[var(--muted-2)]">
          Rebid only the difference. Takeover locks #1.
        </p>
      </div>
    </section>
  );
}

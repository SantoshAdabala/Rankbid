export function WhyBid() {
  return (
    <section
      aria-label="Why bid"
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border border-[var(--border)] px-3.5 py-2.5 text-[12px] leading-tight text-[var(--muted)]"
    >
      <span>Rank = dollars</span>
      <span className="text-[var(--border-strong)]" aria-hidden>
        /
      </span>
      <span>Bid from $2</span>
    </section>
  );
}

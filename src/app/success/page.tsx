import Link from "next/link";
import { Header } from "@/components/Header";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-4 pb-20 pt-10 text-center sm:px-6">
        <div className="glow-panel w-full rounded-3xl p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(52,211,153,0.15)] text-2xl text-[var(--ok)]">
            ✓
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Payment received</h1>
          <p className="mt-3 text-[var(--muted)]">
            Stripe checkout completed. Your rank updates when the webhook confirms the session
            (usually seconds). Refresh the board if you do not see it yet.
          </p>
          {params.session_id && (
            <p className="mono mt-4 break-all text-xs text-[var(--muted)]">
              session: {params.session_id}
            </p>
          )}
          <Link href="/" className="btn-primary mt-8 inline-flex px-6 py-3">
            View leaderboard
          </Link>
        </div>
      </main>
    </>
  );
}

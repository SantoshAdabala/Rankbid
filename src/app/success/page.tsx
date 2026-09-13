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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-12 pt-8 sm:px-5">
        <div className="panel p-5">
          <p className="label">Confirmed</p>
          <h1 className="mt-1.5 text-lg font-semibold tracking-[-0.04em]">
            Payment received
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted-2)]">
            Stripe checkout completed. Your rank updates when the webhook confirms the
            session (usually seconds). Refresh the board if you do not see it yet.
          </p>
          {params.session_id && (
            <p className="mt-3 break-all border-t border-[var(--border)] pt-3 text-[11px] tabular text-[var(--muted)]">
              session: {params.session_id}
            </p>
          )}
          <Link
            href="/"
            className="btn-primary mt-5 inline-flex w-full items-center justify-center px-4 py-2.5 text-[13px]"
          >
            View leaderboard
          </Link>
        </div>
      </main>
    </>
  );
}

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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-12 pt-6 sm:px-5">
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="label">Confirmed</p>
            <h1 className="mt-1 text-lg font-semibold tracking-[-0.04em]">
              Bid placed
            </h1>
          </div>
          <div className="px-5 py-5">
            <p className="text-[13px] leading-relaxed text-[var(--muted-2)]">
              Stripe checkout completed. Your rank updates when the webhook
              confirms the session (usually seconds). Refresh the board if you
              do not see it yet.
            </p>
            {params.session_id && (
              <p className="mt-3 break-all border-t border-[var(--border)] pt-3 text-[11px] tabular text-[var(--muted)]">
                session: {params.session_id}
              </p>
            )}
            <Link
              href="/"
              className="btn-primary mt-5 inline-flex w-full items-center justify-center px-4 py-3 text-[14px]"
            >
              View the board
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

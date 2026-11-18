"use client";

import { useParams } from "next/navigation";

export default function CompanyError({ retry }: { error: unknown; retry: () => void }) {
  const { ticker } = useParams<{ ticker: string }>();

  return (
    <>
      <div className="pt-6 pb-5">
        <h1 className="text-4xl font-semibold tracking-tight break-all">{ticker.toUpperCase()}</h1>
        <p className="mt-1 min-h-6 text-ink-2" />
      </div>
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-line bg-surface px-6 py-16 text-ink-2">
        <p>Couldn’t load the financials</p>
        <button
          onClick={retry}
          className="h-9 cursor-pointer rounded-lg bg-ink px-4 text-sm font-medium text-page transition-opacity hover:opacity-85"
        >
          Try again
        </button>
      </div>
    </>
  );
}

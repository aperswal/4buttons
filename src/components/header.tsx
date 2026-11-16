import Link from "next/link";
import { Search } from "./search";

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <svg aria-hidden viewBox="0 0 32 32" className="size-6">
        <rect width="32" height="32" rx="8" className="fill-ink" />
        <path
          d="M8 24v-6a1.5 1.5 0 0 1 3 0v6zM14.5 24V13a1.5 1.5 0 0 1 3 0v11zM21 24V9a1.5 1.5 0 0 1 3 0v15z"
          className="fill-page"
        />
      </svg>
      Fundamentals
    </span>
  );
}

export function Header() {
  return (
    <header className="flex items-center justify-between gap-4 py-3">
      <Link href="/" aria-label="Fundamentals home" className="shrink-0 [&>span]:max-sm:text-[0px]">
        <Logo />
      </Link>
      <div className="w-full max-w-sm">
        <Search />
      </div>
    </header>
  );
}

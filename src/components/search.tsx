"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { type Entry, useRecents } from "@/lib/recents";

const LIMIT = 8;
const TICKER_LIKE = /^[A-Za-z0-9.-]{1,10}$/;

type Indexed = { entry: Entry; ticker: string; name: string };

// One download per visit, shared by every search box.
let download: Promise<Indexed[]> | null = null;

function loadCompanies(): Promise<Indexed[]> {
  download ??= fetch("/api/tickers")
    .then((res) => (res.ok ? (res.json() as Promise<Entry[]>) : Promise.reject(new Error(String(res.status)))))
    .then((entries) =>
      entries.map((entry) => ({ entry, ticker: entry[0].toLowerCase(), name: entry[1].toLowerCase() })),
    )
    .catch((error) => {
      download = null; // retry on the next attempt
      throw error;
    });
  return download;
}

// The list arrives largest-company-first, so keeping its order within a tier ranks by size.
function match(companies: Indexed[], query: string): Entry[] {
  const needle = query.toLowerCase();
  const exact: Entry[] = [];
  const prefix: Entry[] = [];
  const word: Entry[] = [];
  for (const { entry, ticker, name } of companies) {
    if (ticker === needle) exact.push(entry);
    else if (ticker.startsWith(needle) || name.startsWith(needle)) prefix.push(entry);
    else if (name.includes(` ${needle}`)) word.push(entry);
  }
  return [...exact, ...prefix, ...word].slice(0, LIMIT);
}

export function Search({ large = false, autoFocus = false }: { large?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const recents = useRecents();

  const [companies, setCompanies] = useState<Indexed[] | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(autoFocus); // an autofocused box is focused before React can hear it
  const [active, setActive] = useState(0);

  useEffect(() => {
    let current = true;
    loadCompanies().then(
      (loaded) => current && setCompanies(loaded),
      () => current && setCompanies("failed"),
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  // Pages stay mounted, hidden, while you browse elsewhere; refocus when this one is shown again.
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const focusOnSlash = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]");
      if (event.key !== "/" || typing || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", focusOnSlash);
    return () => window.removeEventListener("keydown", focusOnSlash);
  }, []);

  const typed = query.trim();
  // Before the list arrives (or if it never does), a typed ticker still goes straight to its page.
  const typedTicker: Entry[] = TICKER_LIKE.test(typed) ? [[typed.toUpperCase(), ""]] : [];
  const waiting = typed !== "" && companies === "loading";
  const options = !typed
    ? recents
    : companies === "loading"
      ? []
      : companies === "failed"
        ? typedTicker
        : match(companies, typed);
  const showPanel = open && (typed !== "" || recents.length > 0);
  const selected = options[Math.min(active, options.length - 1)];

  function close() {
    setQuery("");
    setOpen(false);
    input.current?.blur();
  }

  function go(ticker: string) {
    close();
    router.push(`/${ticker}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (options.length) {
        const step = event.key === "ArrowDown" ? 1 : options.length - 1;
        setActive((Math.min(active, options.length - 1) + step) % options.length);
      }
    } else if (event.key === "Enter") {
      const target = selected ?? (waiting ? typedTicker[0] : undefined);
      if (target) go(target[0]);
    } else if (event.key === "Escape") {
      if (showPanel) setOpen(false);
      else {
        setQuery("");
        event.currentTarget.blur();
      }
    }
  }

  return (
    <div className="relative w-full">
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 fill-none stroke-ink-3 stroke-[1.75] ${large ? "left-4 size-5" : "left-3 size-4"}`}
      >
        <circle cx="9" cy="9" r="5.5" />
        <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        value={query}
        autoFocus={autoFocus}
        placeholder="Search ticker or company"
        aria-label="Search ticker or company"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && selected ? `${listId}-${selected[0]}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="go"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          if (companies === "failed") {
            setCompanies("loading");
            setAttempt(attempt + 1);
          }
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`w-full border border-line bg-surface text-ink outline-none transition-shadow placeholder:text-ink-3 focus:border-axis focus:ring-4 focus:ring-wash ${
          large ? "h-14 rounded-2xl pr-12 pl-12 text-lg" : "h-10 rounded-xl pr-9 pl-9 text-base sm:text-sm"
        }`}
      />
      {!query && (
        <kbd
          aria-hidden
          className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 font-sans text-xs text-ink-3 sm:block ${large ? "right-4" : "right-2.5"}`}
        >
          /
        </kbd>
      )}

      <div
        id={listId}
        role="listbox"
        hidden={!showPanel}
        onMouseDown={(event) => event.preventDefault() /* keep focus in the input */}
        className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl border border-line bg-surface p-1 shadow-xl shadow-black/5"
      >
        {!typed && <div className="px-3 pt-2 pb-1 text-xs text-ink-3">Recent</div>}
        {waiting &&
          [0, 1, 2].map((i) => (
            <div key={i} className="flex h-10 animate-pulse items-center gap-3 px-3">
              <span className="h-3 w-10 rounded bg-wash" />
              <span className="h-3 w-40 rounded bg-wash" />
            </div>
          ))}
        {options.map(([ticker, name], index) => {
          const isSelected = selected?.[0] === ticker;
          return (
            <Link
              key={ticker}
              href={`/${ticker}`}
              id={`${listId}-${ticker}`}
              role="option"
              aria-selected={isSelected}
              tabIndex={-1}
              prefetch={isSelected ? true : "auto"} // fetch the highlighted company before it is opened
              onMouseMove={() => setActive(index)}
              onClick={close}
              className="flex h-10 items-center gap-3 rounded-lg px-3 aria-selected:bg-wash"
            >
              <span className="w-16 shrink-0 font-mono text-sm font-medium">{ticker}</span>
              <span className="truncate text-sm text-ink-2">{name}</span>
            </Link>
          );
        })}
        {typed && !waiting && options.length === 0 && (
          <div className="flex h-10 items-center px-3 text-sm text-ink-2">No matches</div>
        )}
      </div>
    </div>
  );
}

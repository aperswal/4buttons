"use client";

import { useSyncExternalStore } from "react";

export type Entry = [ticker: string, name: string];

const KEY = "recents";
const LIMIT = 6;
const NONE: Entry[] = [];

let snapshot: Entry[] | null = null;
const listeners = new Set<() => void>();

function read(): Entry[] {
  if (snapshot) return snapshot;
  try {
    snapshot = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    snapshot = NONE;
  }
  return snapshot ?? NONE;
}

function subscribe(listener: () => void) {
  const onStorage = () => {
    snapshot = null;
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Tickers this browser viewed most recently, newest first. */
export const useRecents = () => useSyncExternalStore(subscribe, read, () => NONE);

export function remember(entry: Entry) {
  snapshot = [entry, ...read().filter(([ticker]) => ticker !== entry[0])].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage is unavailable (private mode); recents then last for this visit only.
  }
  listeners.forEach((listener) => listener());
}

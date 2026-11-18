"use client";

import { useEffect } from "react";
import { remember } from "@/lib/recents";

/** Adds the company on screen to this browser's recent searches. */
export function Remember({ ticker, name }: { ticker: string; name: string }) {
  useEffect(() => remember([ticker, name]), [ticker, name]);
  return null;
}

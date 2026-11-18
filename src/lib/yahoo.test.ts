import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { yahooJson } from "./yahoo.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch with one that answers per host, and records the hosts asked. */
function answer(byHost: Record<string, () => Response>): string[] {
  const asked: string[] = [];
  globalThis.fetch = async (input) => {
    const { host } = new URL(String(input));
    asked.push(host);
    return byHost[host]();
  };
  return asked;
}

const ok = () => Response.json({ from: "yahoo" });
const rateLimited = () => new Response("Too Many Requests", { status: 429 });

test("the first host's answer is used when it gives one", async () => {
  const asked = answer({ "query1.finance.yahoo.com": ok });
  assert.deepEqual(await yahooJson("/v8/finance/chart/AAPL", { interval: "1d" }), { from: "yahoo" });
  assert.deepEqual(asked, ["query1.finance.yahoo.com"]);
});

test("the second host is tried when the first is rate-limited", async () => {
  const asked = answer({ "query1.finance.yahoo.com": rateLimited, "query2.finance.yahoo.com": ok });
  assert.deepEqual(await yahooJson("/v8/finance/chart/AAPL", {}), { from: "yahoo" });
  assert.deepEqual(asked, ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]);
});

test("the second host is tried when the first cannot be reached", async () => {
  const asked = answer({
    "query1.finance.yahoo.com": () => {
      throw new Error("connection reset");
    },
    "query2.finance.yahoo.com": ok,
  });
  assert.deepEqual(await yahooJson("/v8/finance/chart/AAPL", {}), { from: "yahoo" });
  assert.deepEqual(asked, ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]);
});

test("null when neither host answers", async () => {
  answer({ "query1.finance.yahoo.com": rateLimited, "query2.finance.yahoo.com": rateLimited });
  assert.equal(await yahooJson("/v8/finance/chart/AAPL", {}), null);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { tidyName } from "./tidy-name.ts";

test("names the SEC lists in capitals are written normally", () => {
  assert.equal(tidyName("NVIDIA CORP"), "Nvidia Corp");
  assert.equal(tidyName("BANK OF AMERICA CORP /DE/"), "Bank of America Corp");
  assert.equal(tidyName("JPMORGAN CHASE & CO"), "JPMorgan Chase & Co");
  assert.equal(tidyName("ASML HOLDING NV"), "ASML Holding NV");
  assert.equal(tidyName("AT&T INC."), "AT&T Inc.");
});

test("registration suffixes are dropped and mixed-case names are left alone", () => {
  assert.equal(tidyName("COSTCO WHOLESALE CORP /NEW"), "Costco Wholesale Corp");
  assert.equal(tidyName("TOYOTA MOTOR CORP/"), "Toyota Motor Corp");
  assert.equal(tidyName("Saputo Inc./ADR"), "Saputo Inc.");
  assert.equal(tidyName("Apple Inc."), "Apple Inc.");
});

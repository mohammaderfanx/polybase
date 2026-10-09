import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { MAX_ATTEMPTS, sign } from "@/lib/webhooks.server";

describe("webhook signing", () => {
  it("matches standard HMAC-SHA256 over `${t}.${body}`", async () => {
    const body = JSON.stringify({ a: 1 });
    const expected = createHmac("sha256", "whsec_test").update(`1700000000.${body}`).digest("hex");
    expect(await sign("whsec_test", 1700000000, body)).toBe(expected);
  });
  it("allows 1 send + 3 retries max", () => {
    expect(MAX_ATTEMPTS).toBe(4);
  });
});

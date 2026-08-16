import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";

import { totpCodeSource } from "./totp-code-source";

const request = {
  accountLabel: "Connor · Chase",
  requestedAt: new Date("2026-08-15T12:00:00Z"),
  senderHints: ["chase"],
};

describe("totpCodeSource", () => {
  it("returns the generated code", async () => {
    const source = totpCodeSource(() => Promise.resolve("  123456 "));
    expect(await source.waitForCode(request)).toEqual(Ok("123456"));
  });

  it("reports an empty code rather than offering it to the bank", async () => {
    const source = totpCodeSource(() => Promise.resolve(""));
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "generated an empty code", source: "totp" }),
    );
  });

  it("reports the failure when a code cannot be generated", async () => {
    const source = totpCodeSource(() =>
      Promise.reject(new Error("system clock is unset")),
    );
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "system clock is unset", source: "totp" }),
    );
  });
});

import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";

import { totpCodeSource } from "./totp-code-source";

const request = {
  accountLabel: "Connor · Chase",
  requestedAt: new Date("2026-08-15T12:00:00Z"),
  senderHints: ["chase"],
};

describe("totpCodeSource", () => {
  it("returns the code the vault generates", async () => {
    const source = totpCodeSource(() => Promise.resolve("  123456 "));
    expect(await source.waitForCode(request)).toEqual(Ok("123456"));
  });

  it("reports no code when the vault item has no TOTP secret", async () => {
    const source = totpCodeSource(() => Promise.resolve(""));
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "vault item has no TOTP secret", source: "totp" }),
    );
  });

  it("reports the failure when the vault cannot be reached", async () => {
    const source = totpCodeSource(() =>
      Promise.reject(new Error("vault is locked")),
    );
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "vault is locked", source: "totp" }),
    );
  });
});

import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";

import { chainCodeSources } from "./chain-code-sources";
import type { CodeSource } from "./code-source";

const request = {
  accountLabel: "Connor · Amex",
  requestedAt: new Date("2026-08-15T12:00:00Z"),
  senderHints: ["american express"],
};

const yields = (name: string, code: string): CodeSource => ({
  name,
  waitForCode: () => Promise.resolve(Ok(code)),
});

const empty = (name: string, reason: string): CodeSource => ({
  name,
  waitForCode: () => Promise.resolve(Err({ reason, source: name })),
});

const explodes = (name: string): CodeSource => ({
  name,
  waitForCode: () =>
    Promise.reject(new Error(`${name} should not have been consulted`)),
});

describe("chainCodeSources", () => {
  it("returns the first source's code without consulting later ones", async () => {
    const chain = chainCodeSources([
      yields("totp", "123456"),
      explodes("imap"),
    ]);
    expect(await chain.waitForCode(request)).toEqual(Ok("123456"));
  });

  it("falls through to the next source when one has no code", async () => {
    const chain = chainCodeSources([
      empty("totp", "no shared secret configured"),
      yields("imap", "654321"),
    ]);
    expect(await chain.waitForCode(request)).toEqual(Ok("654321"));
  });

  it("reports every source's reason when none produce a code", async () => {
    const chain = chainCodeSources([
      empty("totp", "no shared secret configured"),
      empty("imap", "nothing arrived within 120s"),
    ]);
    expect(await chain.waitForCode(request)).toEqual(
      Err({
        reason:
          "totp: no shared secret configured; imap: nothing arrived within 120s",
        source: "totp -> imap",
      }),
    );
  });

  it("fails when there is nothing to try", async () => {
    const chain = chainCodeSources([]);
    expect(await chain.waitForCode(request)).toEqual(
      Err({ reason: "no code sources configured", source: "empty chain" }),
    );
  });

  it("names itself after the sources it wraps", () => {
    expect(
      chainCodeSources([yields("totp", "1"), empty("imap", "x")]).name,
    ).toBe("totp -> imap");
  });
});

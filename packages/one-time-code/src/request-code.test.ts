import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";

import type { CodeRequest, CodeSource } from "./code-source";
import { requestCodeWith } from "./request-code";

const context = {
  accountLabel: "Connor · Amex",
  senderHints: ["americanexpress"],
};

describe("requestCodeWith", () => {
  it("hands back the code the source produced", async () => {
    const source: CodeSource = {
      name: "imap",
      waitForCode: async () => Ok("123456"),
    };
    expect(await requestCodeWith(source, context)()).toBe("123456");
  });

  it("stamps the request with the moment it was asked for", async () => {
    const seen: CodeRequest[] = [];
    const source: CodeSource = {
      name: "imap",
      waitForCode: (request) => {
        seen.push(request);
        return Promise.resolve(Ok("123456"));
      },
    };
    await requestCodeWith(source, {
      ...context,
      now: () => new Date("2026-08-15T12:00:00Z"),
    })();
    expect(seen[0]?.requestedAt).toEqual(new Date("2026-08-15T12:00:00Z"));
    expect(seen[0]?.senderHints).toEqual(["americanexpress"]);
  });

  it("throws with what every source had to say", async () => {
    const source: CodeSource = {
      name: "totp -> imap",
      waitForCode: async () =>
        Err({
          reason: "totp: no secret; imap: nothing arrived within 120s",
          source: "totp -> imap",
        }),
    };
    await expect(requestCodeWith(source, context)()).rejects.toThrow(
      "could not obtain a one-time code for Connor · Amex: totp: no secret; imap: nothing arrived within 120s",
    );
  });
});

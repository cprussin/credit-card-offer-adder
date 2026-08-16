import { describe, expect, it } from "bun:test";
import { None, Some } from "@cprussin/option-result";

import { selectCode } from "./select-code";

const requestedAt = new Date("2026-08-15T12:00:00Z");

const request = {
  accountLabel: "Connor · Amex",
  requestedAt,
  senderHints: ["americanexpress", "american express"],
};

const message = (
  overrides: Partial<{
    from: string;
    receivedAt: Date;
    text: string;
  }> = {},
) => ({
  from: "AmericanExpress@welcome.americanexpress.com",
  receivedAt: new Date("2026-08-15T12:00:30Z"),
  text: "Your American Express one-time verification code is 123456.",
  ...overrides,
});

describe("selectCode", () => {
  it("extracts the code from a message that arrived for this request", () => {
    expect(selectCode([message()], request)).toEqual(Some("123456"));
  });

  it("extracts a code that precedes the keyword", () => {
    const delivered = message({
      text: "98765432 is your Chase identification code.",
    });
    expect(selectCode([delivered], request)).toEqual(Some("98765432"));
  });

  it("ignores a message delivered before the code was requested", () => {
    const delivered = message({
      receivedAt: new Date("2026-08-15T11:50:00Z"),
    });
    expect(selectCode([delivered], request)).toEqual(None());
  });

  it("accepts a message a little older than the request to absorb clock skew", () => {
    const delivered = message({
      receivedAt: new Date("2026-08-15T11:59:30Z"),
    });
    expect(selectCode([delivered], request)).toEqual(Some("123456"));
  });

  it("ignores a message from an unrelated sender", () => {
    const delivered = message({
      from: "no-reply@example.com",
      text: "Your verification code is 999999.",
    });
    expect(selectCode([delivered], request)).toEqual(None());
  });

  it("takes the newest match when the mailbox holds several", () => {
    const older = message({
      receivedAt: new Date("2026-08-15T12:00:10Z"),
      text: "Your American Express code is 111111.",
    });
    const newer = message({
      receivedAt: new Date("2026-08-15T12:00:40Z"),
      text: "Your American Express code is 222222.",
    });
    expect(selectCode([older, newer], request)).toEqual(Some("222222"));
  });

  it("finds nothing when the matching message carries no code", () => {
    const delivered = message({
      text: "Your American Express statement is ready.",
    });
    expect(selectCode([delivered], request)).toEqual(None());
  });

  it("does not mistake a long account number for a code", () => {
    const delivered = message({
      text: "Card ending 1009: your American Express account 371234567890123 was viewed.",
    });
    expect(selectCode([delivered], request)).toEqual(None());
  });
});

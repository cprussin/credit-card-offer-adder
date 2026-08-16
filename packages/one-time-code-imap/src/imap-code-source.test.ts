import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";
import type { DeliveredMessage } from "@offers/one-time-code/select-code";

import { imapCodeSource } from "./imap-code-source";
import type { Mailbox } from "./imap-mailbox";

const requestedAt = new Date("2026-08-15T12:00:00Z");

const request = {
  accountLabel: "Connor · Amex",
  requestedAt,
  senderHints: ["americanexpress"],
};

const codeEmail = (): DeliveredMessage => ({
  from: "AmericanExpress@welcome.americanexpress.com",
  receivedAt: new Date("2026-08-15T12:00:20Z"),
  text: "Your American Express one-time verification code is 123456.",
});

/** A mailbox that only starts carrying the code on the nth poll. */
const mailboxAfter = (
  polls: number,
): Mailbox & { readonly pollCount: () => number } => {
  const state = { polls: 0 };
  return {
    pollCount: () => state.polls,
    recentMessages: () => {
      state.polls += 1;
      return Promise.resolve(state.polls > polls ? [codeEmail()] : []);
    },
  };
};

/** A clock that jumps forward by the requested sleep, so tests never wait. */
const fakeClock = () => {
  const state = { now: requestedAt.getTime() };
  return {
    now: () => new Date(state.now),
    sleep: (ms: number) => {
      state.now += ms;
      return Promise.resolve();
    },
  };
};

describe("imapCodeSource", () => {
  it("returns the code on the first poll that finds it", async () => {
    const mailbox = mailboxAfter(0);
    const source = imapCodeSource({ mailbox, ...fakeClock() });
    expect(await source.waitForCode(request)).toEqual(Ok("123456"));
    expect(mailbox.pollCount()).toBe(1);
  });

  it("keeps polling until the bank's email lands", async () => {
    const mailbox = mailboxAfter(3);
    const source = imapCodeSource({ mailbox, ...fakeClock() });
    expect(await source.waitForCode(request)).toEqual(Ok("123456"));
    expect(mailbox.pollCount()).toBe(4);
  });

  it("gives up once the wait budget is spent", async () => {
    const source = imapCodeSource({
      mailbox: { recentMessages: () => Promise.resolve([]) },
      ...fakeClock(),
      pollIntervalMs: 5000,
      timeoutMs: 20_000,
    });
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "no code arrived within 20s", source: "imap" }),
    );
  });

  it("reports the failure when the mailbox cannot be read", async () => {
    const source = imapCodeSource({
      mailbox: {
        recentMessages: () => Promise.reject(new Error("IMAP login rejected")),
      },
      ...fakeClock(),
    });
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "IMAP login rejected", source: "imap" }),
    );
  });
});

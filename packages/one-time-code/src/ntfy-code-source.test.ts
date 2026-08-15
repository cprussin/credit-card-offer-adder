import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";
import type { NtfyClient, NtfyPublication } from "@offers/ntfy/ntfy-client";
import type { NtfyMessage } from "@offers/ntfy/ntfy-message";

import { ntfyCodeSource } from "./ntfy-code-source";

const request = {
  accountLabel: "Connor · Amex",
  requestedAt: new Date("2026-08-15T12:00:00Z"),
  senderHints: ["american express"],
};

const reply = (message: string): NtfyMessage => ({
  id: message,
  message,
  receivedAt: new Date("2026-08-15T12:00:20Z"),
  title: undefined,
});

const fakeClient = (
  replies: readonly NtfyMessage[],
): NtfyClient & { readonly published: readonly NtfyPublication[] } => {
  const published: NtfyPublication[] = [];
  return {
    publish: (publication) => {
      published.push(publication);
      return Promise.resolve();
    },
    published,
    subscribe: async function* () {
      yield* replies;
    },
  };
};

const topics = { alertTopic: "offers-alerts", replyTopic: "offers-codes" };

describe("ntfyCodeSource", () => {
  it("returns the code someone published to the reply topic", async () => {
    const source = ntfyCodeSource({
      ...topics,
      client: fakeClient([reply("123456")]),
    });
    expect(await source.waitForCode(request)).toEqual(Ok("123456"));
  });

  it("pulls the code out of a chattier reply", async () => {
    const source = ntfyCodeSource({
      ...topics,
      client: fakeClient([reply("code is 998877")]),
    });
    expect(await source.waitForCode(request)).toEqual(Ok("998877"));
  });

  it("asks on the alert topic, naming the account", async () => {
    const client = fakeClient([reply("123456")]);
    await ntfyCodeSource({ ...topics, client }).waitForCode(request);
    expect(client.published).toHaveLength(1);
    expect(client.published[0]?.topic).toBe("offers-alerts");
    expect(client.published[0]?.message).toContain("Connor · Amex");
    expect(client.published[0]?.message).toContain("offers-codes");
  });

  it("reports no code when the reply carries none", async () => {
    const source = ntfyCodeSource({
      ...topics,
      client: fakeClient([reply("what code?")]),
    });
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "no code was published to offers-codes", source: "ntfy" }),
    );
  });

  it("reports the failure when the subscription breaks", async () => {
    const client: NtfyClient = {
      publish: () => Promise.resolve(),
      subscribe: () => {
        throw new Error("connection reset");
      },
    };
    const source = ntfyCodeSource({ ...topics, client });
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "connection reset", source: "ntfy" }),
    );
  });
});

import { describe, expect, it } from "bun:test";

import { ntfyClient } from "./ntfy-client";
import type { NtfyMessage } from "./ntfy-message";

const config = { server: "https://ntfy.example.com", token: undefined };

const recordingFetch = () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  return {
    calls,
    fetchImpl: (url: string, init?: RequestInit) => {
      calls.push({ init, url });
      return Promise.resolve(new Response("", { status: 200 }));
    },
  };
};

const streamingFetch = (chunks: readonly string[]) => async () =>
  new Response(
    new ReadableStream({
      start: (controller) => {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );

const event = (id: string, message: string) =>
  JSON.stringify({
    event: "message",
    id,
    message,
    time: 1_786_000_000,
    topic: "offers-codes",
  });

describe("ntfyClient", () => {
  describe("publish", () => {
    it("posts the message to the topic's URL", async () => {
      const { calls, fetchImpl } = recordingFetch();
      await ntfyClient(config, fetchImpl).publish({
        message: "3 offers added",
        title: "Offer run",
        topic: "offers-alerts",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe("https://ntfy.example.com/offers-alerts");
      expect(calls[0]?.init?.method).toBe("POST");
      expect(calls[0]?.init?.body).toBe("3 offers added");
      expect(new Headers(calls[0]?.init?.headers).get("Title")).toBe(
        "Offer run",
      );
    });

    it("authenticates when a token is configured", async () => {
      const { calls, fetchImpl } = recordingFetch();
      await ntfyClient({ ...config, token: "tk_secret" }, fetchImpl).publish({
        message: "hi",
        title: "t",
        topic: "offers-alerts",
      });
      expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(
        "Bearer tk_secret",
      );
    });

    it("throws when the server rejects the publication", async () => {
      const failingFetch = () =>
        Promise.resolve(new Response("forbidden", { status: 403 }));
      await expect(
        ntfyClient(config, failingFetch).publish({
          message: "hi",
          title: "t",
          topic: "offers-alerts",
        }),
      ).rejects.toThrow("ntfy publish to offers-alerts failed with status 403");
    });
  });

  describe("subscribe", () => {
    it("yields messages whose JSON is split across chunks", async () => {
      const line = event("m1", "123456");
      const client = ntfyClient(
        config,
        streamingFetch([
          line.slice(0, 12),
          `${line.slice(12)}\n${event("m2", "654321")}\n`,
        ]),
      );
      const received: NtfyMessage[] = [];
      for await (const message of client.subscribe("offers-codes", {
        signal: new AbortController().signal,
        since: new Date(1_786_000_000_000),
      })) {
        received.push(message);
      }
      expect(received.map((message) => message.message)).toEqual([
        "123456",
        "654321",
      ]);
    });

    it("throws when the subscription is refused", async () => {
      const failingFetch = () =>
        Promise.resolve(new Response("nope", { status: 502 }));
      const client = ntfyClient(config, failingFetch);
      const drain = async () => {
        for await (const _message of client.subscribe("offers-codes", {
          signal: new AbortController().signal,
          since: new Date(1_786_000_000_000),
        })) {
          throw new Error("should not have yielded");
        }
      };
      await expect(drain()).rejects.toThrow(
        "ntfy subscription to offers-codes failed with status 502",
      );
    });
  });
});

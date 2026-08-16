import { describe, expect, it } from "bun:test";
import { None, Some } from "@cprussin/option-result";

import { parseNtfyLine } from "./ntfy-message";

describe("parseNtfyLine", () => {
  it("parses a message event", () => {
    const line = JSON.stringify({
      event: "message",
      id: "abc123",
      message: "123456",
      time: 1_786_000_000,
      title: "Amex code",
      topic: "offers-codes",
    });
    expect(parseNtfyLine(line)).toEqual(
      Some({
        id: "abc123",
        message: "123456",
        receivedAt: new Date(1_786_000_000_000),
        title: "Amex code",
      }),
    );
  });

  it("parses a message with no title", () => {
    const line = JSON.stringify({
      event: "message",
      id: "abc123",
      message: "123456",
      time: 1_786_000_000,
      topic: "offers-codes",
    });
    expect(parseNtfyLine(line)).toEqual(
      Some({
        id: "abc123",
        message: "123456",
        receivedAt: new Date(1_786_000_000_000),
        title: undefined,
      }),
    );
  });

  it("ignores the stream's open event", () => {
    const line = JSON.stringify({
      event: "open",
      id: "open1",
      time: 1_786_000_000,
      topic: "offers-codes",
    });
    expect(parseNtfyLine(line)).toEqual(None());
  });

  it("ignores keepalives", () => {
    const line = JSON.stringify({
      event: "keepalive",
      id: "ka1",
      time: 1_786_000_000,
      topic: "offers-codes",
    });
    expect(parseNtfyLine(line)).toEqual(None());
  });

  it("throws on a line that is not an ntfy event", () => {
    expect(() => parseNtfyLine("<html>gateway timeout</html>")).toThrow();
  });
});

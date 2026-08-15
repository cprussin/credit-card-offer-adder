import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";

import { promptCodeSource } from "./prompt-code-source";

const request = {
  accountLabel: "Connor · Amex",
  requestedAt: new Date("2026-08-15T12:00:00Z"),
  senderHints: ["american express"],
};

describe("promptCodeSource", () => {
  it("returns the code that was typed", async () => {
    const source = promptCodeSource(() => Promise.resolve(" 123456\n"));
    expect(await source.waitForCode(request)).toEqual(Ok("123456"));
  });

  it("names the account it is asking about", async () => {
    const asked = await new Promise<string>((resolve) => {
      promptCodeSource((prompt) => {
        resolve(prompt);
        return Promise.resolve("123456");
      })
        .waitForCode(request)
        .catch(() => {
          /* the prompt text is what this test is after */
        });
    });
    expect(asked).toContain("Connor · Amex");
  });

  it("reports no code when nothing is typed", async () => {
    const source = promptCodeSource(() => Promise.resolve("\n"));
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "no code was entered", source: "prompt" }),
    );
  });

  it("reports the failure when there is no one to ask", async () => {
    const source = promptCodeSource(() =>
      Promise.reject(new Error("stdin is not a terminal")),
    );
    expect(await source.waitForCode(request)).toEqual(
      Err({ reason: "stdin is not a terminal", source: "prompt" }),
    );
  });
});

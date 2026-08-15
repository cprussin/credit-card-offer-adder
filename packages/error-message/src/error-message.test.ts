import { describe, expect, it } from "bun:test";

import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("uses an Error's message", () => {
    expect(errorMessage(new Error("login form never appeared"))).toBe(
      "login form never appeared",
    );
  });

  it("appends the cause when one is attached", () => {
    const error = new Error("could not add offer", {
      cause: new Error("button was disabled"),
    });
    expect(errorMessage(error)).toBe(
      "could not add offer: button was disabled",
    );
  });

  it("stringifies whatever else was thrown", () => {
    expect(errorMessage("nope")).toBe("nope");
  });
});

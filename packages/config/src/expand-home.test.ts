import { describe, expect, it } from "bun:test";

import { expandHome } from "./expand-home";

describe("expandHome", () => {
  it("expands a leading tilde", () => {
    expect(expandHome("~/.local/state/offer-adder", "/home/connor")).toBe(
      "/home/connor/.local/state/offer-adder",
    );
  });

  it("expands a bare tilde", () => {
    expect(expandHome("~", "/home/connor")).toBe("/home/connor");
  });

  it("leaves an absolute path alone", () => {
    expect(expandHome("/srv/offers", "/home/connor")).toBe("/srv/offers");
  });

  it("leaves a tilde that is part of a name alone", () => {
    expect(expandHome("~backup/state", "/home/connor")).toBe("~backup/state");
  });
});

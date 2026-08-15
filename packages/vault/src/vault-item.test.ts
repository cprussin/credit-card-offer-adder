import { describe, expect, it } from "bun:test";

import { parseVaultItem } from "./vault-item";

describe("parseVaultItem", () => {
  it("reads the username and password out of a login item", () => {
    const item = JSON.stringify({
      id: "3f0c",
      login: { password: "hunter2", username: "connor@example.com" },
      name: "Amex",
      object: "item",
    });
    expect(parseVaultItem(item)).toEqual({
      password: "hunter2",
      username: "connor@example.com",
    });
  });

  it("throws when the item is not a login", () => {
    const item = JSON.stringify({
      id: "3f0c",
      name: "Recovery codes",
      notes: "…",
      object: "item",
    });
    expect(() => parseVaultItem(item)).toThrow();
  });

  it("throws when the login has no password", () => {
    const item = JSON.stringify({
      id: "3f0c",
      login: { username: "connor@example.com" },
      name: "Amex",
      object: "item",
    });
    expect(() => parseVaultItem(item)).toThrow();
  });

  it("throws when the CLI printed something that is not an item", () => {
    expect(() => parseVaultItem("Not found.")).toThrow();
  });
});

import { describe, expect, it } from "bun:test";

import { loadConfig } from "./load-config";

const raw = JSON.stringify({
  accounts: [
    {
      id: "connor-amex",
      issuer: "amex",
      label: "Connor · Amex",
      senderHints: ["americanexpress"],
    },
  ],
  artifactDir: "~/artifacts",
});

describe("loadConfig", () => {
  it("resolves the state directories against the home directory", async () => {
    const config = await loadConfig("/etc/offers.json", {
      home: "/home/connor",
      readFile: async () => raw,
    });
    expect(config.artifactDir).toBe("/home/connor/artifacts");
    expect(config.profileDir).toBe(
      "/home/connor/.local/state/offer-adder/profiles",
    );
  });

  it("says which file it could not make sense of", async () => {
    await expect(
      loadConfig("/etc/offers.json", {
        home: "/home/connor",
        readFile: async () => "{}",
      }),
    ).rejects.toThrow("/etc/offers.json is not a valid offer-adder config");
  });
});

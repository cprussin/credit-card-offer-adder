import { describe, expect, it } from "bun:test";

import { readSecretFile } from "./secret-file";

const deps = (mode: number) => ({
  readFile: () => Promise.resolve("{}"),
  statMode: () => Promise.resolve(mode),
});

describe("readSecretFile", () => {
  it("reads a file only the owner can read", async () => {
    expect(await readSecretFile("/run/creds/offers", deps(0o600))).toBe("{}");
  });

  it("reads a read-only file, which is what systemd hands us", async () => {
    expect(await readSecretFile("/run/creds/offers", deps(0o400))).toBe("{}");
  });

  it("refuses a file the group can read", async () => {
    await expect(
      readSecretFile("/etc/offers.credentials.json", deps(0o640)),
    ).rejects.toThrow(
      "/etc/offers.credentials.json is readable beyond its owner (mode 640)",
    );
  });

  it("refuses a world-readable file", async () => {
    await expect(
      readSecretFile("/etc/offers.credentials.json", deps(0o644)),
    ).rejects.toThrow("mode 644");
  });

  it("names the file when it cannot be read at all", async () => {
    await expect(
      readSecretFile("/run/creds/offers", {
        readFile: () => Promise.reject(new Error("ENOENT")),
        statMode: () => Promise.resolve(0o600),
      }),
    ).rejects.toThrow("could not read the credentials file /run/creds/offers");
  });
});

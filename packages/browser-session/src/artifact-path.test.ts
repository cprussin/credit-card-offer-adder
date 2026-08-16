import { describe, expect, it } from "bun:test";

import { artifactPath } from "./artifact-path";

describe("artifactPath", () => {
  it("files an artifact under the account it came from, stamped with the time", () => {
    expect(
      artifactPath({
        accountId: "connor-amex",
        artifactDir: "/var/lib/offers/artifacts",
        name: "offers-grid.png",
        now: new Date("2026-08-15T03:04:05Z"),
      }),
    ).toBe(
      "/var/lib/offers/artifacts/connor-amex/2026-08-15T03-04-05Z-offers-grid.png",
    );
  });

  it("keeps colons out of the filename so it survives every filesystem", () => {
    const path = artifactPath({
      accountId: "connor-amex",
      artifactDir: "/artifacts",
      name: "dump.html",
      now: new Date("2026-08-15T03:04:05Z"),
    });
    expect(path.split("/").at(-1)).not.toContain(":");
  });
});

import { describe, expect, it } from "bun:test";

import { collectViolations } from "./collect-violations";

const now = new Date("2026-07-08T00:00:00Z");
const day = 86_400_000;

describe("collectViolations", () => {
  it("flags installed dependencies that are too new and lists uninstalled ones as skipped", async () => {
    const versions: Record<string, string> = { fresh: "1.0.0", old: "2.0.0" };
    const dates: Record<string, string> = {
      "fresh@1.0.0": "2026-07-07T00:00:00Z",
      "old@2.0.0": "2026-06-01T00:00:00Z",
    };
    const result = await collectViolations({
      excludes: [],
      fetchPublishedAt: (name, version) =>
        Promise.resolve(new Date(dates[`${name}@${version}`] ?? "")),
      minimumReleaseAgeMs: 7 * day,
      names: ["fresh", "old", "absent"],
      now,
      readResolvedVersion: (name) => Promise.resolve(versions[name]),
    });
    expect(result.skipped).toEqual(["absent"]);
    expect(result.checkedCount).toBe(2);
    expect(result.violations.map((violation) => violation.name)).toEqual([
      "fresh",
    ]);
  });

  it("does not look up a publish date for uninstalled dependencies", async () => {
    const fetched: string[] = [];
    const result = await collectViolations({
      excludes: [],
      fetchPublishedAt: (name) => {
        fetched.push(name);
        return Promise.resolve(now);
      },
      minimumReleaseAgeMs: 7 * day,
      names: ["absent"],
      now,
      readResolvedVersion: () => Promise.resolve(undefined),
    });
    expect(fetched).toEqual([]);
    expect(result.skipped).toEqual(["absent"]);
    expect(result.checkedCount).toBe(0);
  });
});

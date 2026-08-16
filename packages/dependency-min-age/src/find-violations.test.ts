import { describe, expect, it } from "bun:test";

import { findViolations } from "./find-violations";

const now = new Date("2026-07-08T00:00:00Z");
const day = 24 * 60 * 60 * 1000;
const sevenDays = 7 * day;

describe("findViolations", () => {
  it("returns no violations when every dependency is older than the minimum age", () => {
    const violations = findViolations({
      dependencies: [
        {
          name: "old",
          publishedAt: new Date("2026-06-01T00:00:00Z"),
          version: "1.0.0",
        },
      ],
      excludes: [],
      minimumReleaseAgeMs: sevenDays,
      now,
    });
    expect(violations).toEqual([]);
  });

  it("flags a dependency published more recently than the minimum age", () => {
    const publishedAt = new Date("2026-07-06T00:00:00Z");
    const violations = findViolations({
      dependencies: [{ name: "fresh", publishedAt, version: "2.0.0" }],
      excludes: [],
      minimumReleaseAgeMs: sevenDays,
      now,
    });
    expect(violations).toEqual([
      { ageMs: 2 * day, name: "fresh", publishedAt, version: "2.0.0" },
    ]);
  });

  it("treats a dependency exactly at the minimum age as compliant", () => {
    const violations = findViolations({
      dependencies: [
        {
          name: "edge",
          publishedAt: new Date(now.getTime() - sevenDays),
          version: "1.0.0",
        },
      ],
      excludes: [],
      minimumReleaseAgeMs: sevenDays,
      now,
    });
    expect(violations).toEqual([]);
  });

  it("ignores excluded dependencies even when they are too new", () => {
    const violations = findViolations({
      dependencies: [
        { name: "typescript", publishedAt: now, version: "6.0.0" },
      ],
      excludes: ["typescript"],
      minimumReleaseAgeMs: sevenDays,
      now,
    });
    expect(violations).toEqual([]);
  });
});

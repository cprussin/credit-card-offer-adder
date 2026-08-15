import { describe, expect, it } from "bun:test";

import { parseMinimumReleaseAgeConfig } from "./config";

describe("parseMinimumReleaseAgeConfig", () => {
  it("converts the release age from seconds to milliseconds", () => {
    const config = parseMinimumReleaseAgeConfig(
      "[install]\nminimumReleaseAge = 604800\n",
    );
    expect(config.minimumReleaseAgeMs).toBe(604_800_000);
    expect(config.excludes).toEqual([]);
  });

  it("reads the exclude list when present", () => {
    const config = parseMinimumReleaseAgeConfig(
      '[install]\nminimumReleaseAge = 60\nminimumReleaseAgeExcludes = ["typescript", "@types/bun"]\n',
    );
    expect(config.excludes).toEqual(["typescript", "@types/bun"]);
  });
});

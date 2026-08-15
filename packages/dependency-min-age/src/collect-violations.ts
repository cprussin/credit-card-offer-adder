import type { Violation } from "./find-violations";
import { findViolations } from "./find-violations";

export type CollectViolationsInput = {
  readonly names: readonly string[];
  readonly now: Date;
  readonly minimumReleaseAgeMs: number;
  readonly excludes: readonly string[];
  readonly readResolvedVersion: (name: string) => Promise<string | undefined>;
  readonly fetchPublishedAt: (name: string, version: string) => Promise<Date>;
};

export type CollectViolationsResult = {
  readonly violations: readonly Violation[];
  readonly skipped: readonly string[];
  readonly checkedCount: number;
};

/**
 * Resolve every catalog name to its installed version and publish date, then
 * find the ones that violate the minimum release age. Names with no installed
 * version (a catalog entry nothing depends on) are reported as `skipped`
 * rather than looked up. The IO collaborators are injected so this is testable
 * without a filesystem or network.
 */
export const collectViolations = async ({
  names,
  now,
  minimumReleaseAgeMs,
  excludes,
  readResolvedVersion,
  fetchPublishedAt,
}: CollectViolationsInput): Promise<CollectViolationsResult> => {
  const resolved = await Promise.all(
    names.map(async (name) => ({
      name,
      version: await readResolvedVersion(name),
    })),
  );
  const skipped = resolved
    .filter(({ version }) => version === undefined)
    .map(({ name }) => name);
  const installed = resolved.flatMap(({ name, version }) =>
    version === undefined ? [] : [{ name, version }],
  );

  const dependencies = await Promise.all(
    installed.map(async ({ name, version }) => ({
      name,
      publishedAt: await fetchPublishedAt(name, version),
      version,
    })),
  );

  return {
    checkedCount: dependencies.length,
    skipped,
    violations: findViolations({
      dependencies,
      excludes,
      minimumReleaseAgeMs,
      now,
    }),
  };
};

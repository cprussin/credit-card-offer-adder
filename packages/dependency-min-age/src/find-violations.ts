/**
 * Pure core of the minimum-release-age check: given a set of dependencies with
 * known publish dates, return the ones younger than the configured threshold.
 *
 * Bun's `minimumReleaseAge` filter is silently bypassed for versions already
 * present in `bun.lock` (oven-sh/bun#30525), so this recomputes the check
 * against what is actually resolved rather than trusting the installer.
 */

export type DatedDependency = {
  readonly name: string;
  readonly version: string;
  readonly publishedAt: Date;
};

export type Violation = DatedDependency & {
  readonly ageMs: number;
};

export type FindViolationsInput = {
  readonly dependencies: readonly DatedDependency[];
  readonly now: Date;
  readonly minimumReleaseAgeMs: number;
  readonly excludes: readonly string[];
};

export const findViolations = ({
  dependencies,
  now,
  minimumReleaseAgeMs,
  excludes,
}: FindViolationsInput): readonly Violation[] => {
  const excluded = new Set(excludes);
  return dependencies
    .filter((dependency) => !excluded.has(dependency.name))
    .map((dependency) => ({
      ...dependency,
      ageMs: now.getTime() - dependency.publishedAt.getTime(),
    }))
    .filter((dependency) => dependency.ageMs < minimumReleaseAgeMs);
};

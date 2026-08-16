// biome-ignore-all lint/suspicious/noConsole: CI guard reports violations to the console

import { z } from "zod";

import { parseCatalogNames } from "./catalog";
import { collectViolations } from "./collect-violations";
import { parseMinimumReleaseAgeConfig } from "./config";
import { fetchPublishedAt } from "./npm-registry";

/**
 * CI guard for the minimum-release-age policy. Reads the resolved version of
 * every root `catalog` dependency, looks up its npm publish date, and exits
 * non-zero if any version is younger than `minimumReleaseAge` — closing the
 * gap left by bun grandfathering already-locked versions (oven-sh/bun#30525).
 *
 * This checks the dependencies we pin directly (the catalog); transitive
 * versions are filtered by bun itself on a clean resolve.
 */
const main = async (): Promise<void> => {
  const { minimumReleaseAgeMs, excludes } = parseMinimumReleaseAgeConfig(
    await Bun.file("bunfig.toml").text(),
  );
  const names = parseCatalogNames(await Bun.file("package.json").text());

  const { violations, skipped, checkedCount } = await collectViolations({
    excludes,
    fetchPublishedAt: (name, version) => fetchPublishedAt(name, version),
    minimumReleaseAgeMs,
    names,
    now: new Date(),
    readResolvedVersion,
  });

  for (const name of skipped) {
    console.log(`- ${name}: not installed, skipped`);
  }

  if (violations.length > 0) {
    for (const { name, version, ageMs } of violations) {
      console.error(
        `✖ ${name}@${version} was published ${days(ageMs)}d ago, under the ${days(minimumReleaseAgeMs)}d minimum`,
      );
    }
    console.error(
      `\n${violations.length} dependency(ies) violate the minimum release age. Downgrade them to a version published at least ${days(minimumReleaseAgeMs)}d ago.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `✓ all ${checkedCount} catalog dependencies meet the ${days(minimumReleaseAgeMs)}d minimum release age`,
    );
  }
};

const installedPackageSchema = z.object({ version: z.string() });

const readResolvedVersion = async (
  name: string,
): Promise<string | undefined> => {
  const packageJson = Bun.file(`node_modules/${name}/package.json`);
  const installed = await packageJson.exists();
  return installed
    ? installedPackageSchema.parse(await packageJson.json()).version
    : undefined;
};

const days = (ms: number): string => (ms / 86_400_000).toFixed(1);

await main();

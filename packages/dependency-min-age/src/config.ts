import { z } from "zod";

const bunfigSchema = z.object({
  install: z.object({
    minimumReleaseAge: z.number(),
    minimumReleaseAgeExcludes: z.array(z.string()).default([]),
  }),
});

export type MinimumReleaseAgeConfig = {
  readonly minimumReleaseAgeMs: number;
  readonly excludes: readonly string[];
};

/**
 * Parse the `[install]` minimum-release-age settings out of a `bunfig.toml`
 * document. `minimumReleaseAge` is expressed in seconds in bunfig; the result
 * is normalized to milliseconds so it composes with `Date` arithmetic.
 */
export const parseMinimumReleaseAgeConfig = (
  bunfigToml: string,
): MinimumReleaseAgeConfig => {
  const { install } = bunfigSchema.parse(Bun.TOML.parse(bunfigToml));
  return {
    excludes: install.minimumReleaseAgeExcludes,
    minimumReleaseAgeMs: install.minimumReleaseAge * 1000,
  };
};

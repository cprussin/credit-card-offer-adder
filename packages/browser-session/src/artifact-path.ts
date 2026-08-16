import { join } from "node:path";

export type ArtifactPathInput = {
  readonly artifactDir: string;
  readonly accountId: string;
  readonly name: string;
  readonly now: Date;
};

/**
 * Where a failure artifact for one account goes.
 *
 * Grouped by account and stamped with the time, because the question these
 * answer is always "what did this card's page look like when last night's run
 * broke" — and because several runs' worth must not overwrite each other.
 */
export const artifactPath = ({
  artifactDir,
  accountId,
  name,
  now,
}: ArtifactPathInput): string =>
  join(artifactDir, accountId, `${stamp(now)}-${name}`);

const stamp = (now: Date): string =>
  now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-");

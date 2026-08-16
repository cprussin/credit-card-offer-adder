import { z } from "zod";

const registryMetadataSchema = z.object({
  time: z.record(z.string(), z.string()),
});

/**
 * The subset of `fetch` this module needs: a URL in, a `Response` out. Kept
 * minimal so a test can pass a plain stub without reconstructing `fetch`'s
 * full surface (`preconnect`, overloads, etc.).
 */
export type FetchLike = (url: string) => Promise<Response>;

/**
 * Fetch the publish timestamp of a specific package version from the npm
 * registry. `fetchImpl` is injectable so the parsing can be exercised without
 * real network access.
 */
export const fetchPublishedAt = async (
  name: string,
  version: string,
  fetchImpl: FetchLike = fetch,
): Promise<Date> => {
  const response = await fetchImpl(`https://registry.npmjs.org/${name}`);
  if (response.ok) {
    const { time } = registryMetadataSchema.parse(await response.json());
    const publishedAt = time[version];
    if (publishedAt === undefined) {
      throw new Error(
        `npm registry has no publish time for ${name}@${version}`,
      );
    } else {
      return new Date(publishedAt);
    }
  } else {
    throw new Error(
      `npm registry request for ${name} failed with status ${response.status}`,
    );
  }
};

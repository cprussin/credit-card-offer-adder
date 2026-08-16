import { z } from "zod";

const packageJsonSchema = z.object({
  catalog: z.record(z.string(), z.string()),
});

/**
 * Extract the names of every dependency pinned in the root `package.json`
 * `catalog` block — the third-party versions this repo controls directly.
 */
export const parseCatalogNames = (packageJson: string): readonly string[] =>
  Object.keys(packageJsonSchema.parse(JSON.parse(packageJson)).catalog);

import { z } from "zod";
import type { Credentials } from "./credentials";
import { parseCredentials } from "./credentials";
import type { SecretFileDeps } from "./secret-file";
import { readSecretFile } from "./secret-file";

/**
 * Read and validate the credentials document, refusing a file anyone but the
 * owner can read. Failing here costs a run; proceeding with a leaked file costs
 * four bank accounts.
 *
 * Nothing thrown from here may carry the file's contents — not in a message and
 * not on a `cause`, because `errorMessage` flattens the whole chain into the
 * line that goes to the journal and to a phone. That rules out reusing the
 * underlying failures directly: `JSON.parse` quotes the token it choked on, and
 * an unquoted password is exactly such a token. What is reported instead is
 * where the problem is — the path to the offending field — which is what makes
 * it fixable without printing anything.
 */
export const loadCredentials = async (
  path: string,
  deps: SecretFileDeps = {},
): Promise<Credentials> =>
  parseDocument(await readSecretFile(path, deps), path);

const parseDocument = (raw: string, path: string): Credentials => {
  try {
    return parseCredentials(asJson(raw, path));
  } catch (error) {
    throw error instanceof z.ZodError ? invalid(path, fields(error)) : error;
  }
};

const asJson = (raw: string, path: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw invalid(path, "it is not JSON");
  }
};

/** Issue paths only. Zod v4 reports the expected type, never the value. */
const fields = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join(".")} (${issue.message})`)
    .join(", ");

const invalid = (path: string, detail: string): Error =>
  new Error(`${path} is not a valid offer-adder credentials file: ${detail}`);

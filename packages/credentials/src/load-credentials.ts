import type { Credentials } from "./credentials";
import { parseCredentials } from "./credentials";
import type { SecretFileDeps } from "./secret-file";
import { readSecretFile } from "./secret-file";

/**
 * Read and validate the credentials document, refusing a file anyone but the
 * owner can read. Failing here costs a run; proceeding with a leaked file costs
 * four bank accounts.
 */
export const loadCredentials = async (
  path: string,
  deps: SecretFileDeps = {},
): Promise<Credentials> => {
  const raw = await readSecretFile(path, deps);
  try {
    return parseCredentials(JSON.parse(raw));
  } catch (error) {
    throw new Error(`${path} is not a valid offer-adder credentials file`, {
      cause: error,
    });
  }
};

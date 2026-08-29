import { stat } from "node:fs/promises";

import { errorMessage } from "@offers/error-message/error-message";

/** Permission bits outside the owner's. Any of them set is a refusal. */
const BEYOND_OWNER = 0o077;

export type SecretFileDeps = {
  readonly readFile?: (path: string) => Promise<string>;
  readonly statMode?: (path: string) => Promise<number>;
};

/**
 * Read a file that holds credentials, refusing it if anyone but the owner can.
 *
 * This is the guard that makes "keep the bank logins on disk" a defensible
 * trade: a config file is easy to copy into place with the wrong mode, and a
 * world-readable one hands four bank accounts to every user on the box. Failing
 * the run is the right outcome — a silent warning would be read once and never
 * again.
 */
export const readSecretFile = async (
  path: string,
  {
    readFile = defaultReadFile,
    statMode = defaultStatMode,
  }: SecretFileDeps = {},
): Promise<string> => {
  const mode = await statMode(path);
  const excess = mode & BEYOND_OWNER;
  if (excess === 0) {
    try {
      return await readFile(path);
    } catch (error) {
      throw new Error(`could not read the credentials file ${path}`, {
        cause: error,
      });
    }
  } else {
    throw new Error(
      `${path} is readable beyond its owner (mode ${(mode & 0o777).toString(8)}); chmod 600 it`,
    );
  }
};

const defaultReadFile = (path: string): Promise<string> =>
  Bun.file(path).text();

const defaultStatMode = async (path: string): Promise<number> => {
  try {
    return (await stat(path)).mode;
  } catch (error) {
    throw new Error(
      `could not read the credentials file ${path}: ${errorMessage(error)}`,
    );
  }
};

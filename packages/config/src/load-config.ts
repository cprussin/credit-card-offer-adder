import { homedir } from "node:os";
import type { Config } from "./config-schema";
import { parseConfig } from "./config-schema";
import { expandHome } from "./expand-home";

export type LoadConfigDeps = {
  readonly home?: string;
  readonly readFile?: (path: string) => Promise<string>;
};

/**
 * Read and validate the account configuration, with its state directories
 * resolved to absolute paths so nothing downstream has to care where `~` is.
 */
export const loadConfig = async (
  path: string,
  { home = homedir(), readFile = defaultReadFile }: LoadConfigDeps = {},
): Promise<Config> => {
  const raw = await readFile(path);
  try {
    const config = parseConfig(JSON.parse(raw));
    return {
      ...config,
      artifactDir: expandHome(config.artifactDir, home),
      profileDir: expandHome(config.profileDir, home),
    };
  } catch (error) {
    throw new Error(`${path} is not a valid offer-adder config`, {
      cause: error,
    });
  }
};

const defaultReadFile = (path: string): Promise<string> =>
  Bun.file(path).text();

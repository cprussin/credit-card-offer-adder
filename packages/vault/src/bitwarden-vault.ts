import type { CommandResult, RunCommand } from "./run-command";
import { spawnBw } from "./spawn-bw";
import type { Vault } from "./vault";
import { parseVaultItem } from "./vault-item";

/**
 * `bw` reads the master password from this variable rather than argv, so it
 * never shows up in the process table.
 */
const PASSWORD_ENV_VAR = "BW_PASSWORD";

export type BitwardenVaultOptions = {
  /**
   * An already-unlocked session key (`BW_SESSION`). Preferred on a server: the
   * unlock happens once at provisioning time and no master password has to sit
   * in the service's environment.
   */
  readonly session: string | undefined;
  /** Master password, used to unlock when no session was supplied. */
  readonly masterPassword: string | undefined;
  readonly run?: RunCommand;
};

/**
 * The Bitwarden CLI as a `Vault`, which is how this talks to Vaultwarden — the
 * CLI is the same client either way, pointed at a self-hosted server with
 * `bw config server`.
 *
 * The unlock is lazy and memoized: a run that never needs a credential never
 * unlocks, and four accounts in one run share a single unlock.
 */
export const bitwardenVault = ({
  session,
  masterPassword,
  run = spawnBw,
}: BitwardenVaultOptions): Vault => {
  const unlocked = { session };
  const withSession = async (args: readonly string[]): Promise<string> => {
    const key = await sessionKey(unlocked, masterPassword, run);
    return bw([...args, "--session", key], {}, run);
  };
  return {
    credentials: async (itemId) =>
      parseVaultItem(await withSession(["get", "item", itemId])),
    totp: async (itemId) => (await withSession(["get", "totp", itemId])).trim(),
  };
};

const sessionKey = async (
  unlocked: { session: string | undefined },
  masterPassword: string | undefined,
  run: RunCommand,
): Promise<string> => {
  if (unlocked.session === undefined) {
    if (masterPassword === undefined) {
      throw new Error(
        "cannot reach the vault: no BW_SESSION and no master password",
      );
    } else {
      unlocked.session = (
        await bw(
          ["unlock", "--raw", "--passwordenv", PASSWORD_ENV_VAR],
          { [PASSWORD_ENV_VAR]: masterPassword },
          run,
        )
      ).trim();
      return unlocked.session;
    }
  } else {
    return unlocked.session;
  }
};

const bw = async (
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  run: RunCommand,
): Promise<string> => {
  const result = await run(args, env);
  if (result.exitCode === 0) {
    return result.stdout;
  } else {
    throw new Error(failureMessage(args, result));
  }
};

/**
 * Names the subcommand but never its operands: the argv of a failing `unlock`
 * would otherwise be a fine place for a password to end up in a log.
 */
const failureMessage = (
  args: readonly string[],
  result: CommandResult,
): string =>
  `bw ${args.slice(0, 2).join(" ")} failed (exit ${result.exitCode}): ${result.stderr.trim()}`;

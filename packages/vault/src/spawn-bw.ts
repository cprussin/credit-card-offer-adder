import type { RunCommand } from "./run-command";

/**
 * Run the real `bw` binary. Thin glue over `Bun.spawn` with no logic of its
 * own; the interesting behavior is in `./bitwarden-vault`, which takes this as
 * an injected `RunCommand`.
 *
 * The child inherits our environment so `bw`'s own config (`BITWARDENCLI_APPDATA_DIR`,
 * the configured server) applies, plus whatever secret this call needs.
 */
export const spawnBw: RunCommand = async (args, env) => {
  const child = Bun.spawn(["bw", ...args], {
    env: { ...Bun.env, ...env },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stderr, stdout };
};

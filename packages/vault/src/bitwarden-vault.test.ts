import { describe, expect, it } from "bun:test";

import { bitwardenVault } from "./bitwarden-vault";
import type { CommandResult, RunCommand } from "./run-command";

const ok = (stdout: string): CommandResult => ({
  exitCode: 0,
  stderr: "",
  stdout,
});

const loginItem = JSON.stringify({
  login: { password: "hunter2", username: "connor@example.com" },
});

const recordingRun = (
  respond: (args: readonly string[]) => CommandResult,
): RunCommand & {
  readonly calls: readonly {
    args: readonly string[];
    env: Record<string, string>;
  }[];
} => {
  const calls: { args: readonly string[]; env: Record<string, string> }[] = [];
  const run: RunCommand = (args, env) => {
    calls.push({ args, env: { ...env } });
    return Promise.resolve(respond(args));
  };
  return Object.assign(run, { calls });
};

const respondToBw = (args: readonly string[]): CommandResult => {
  switch (args[0]) {
    case "unlock":
      return ok("session-key-abc\n");
    case "get":
      return args[1] === "totp" ? ok("123456\n") : ok(loginItem);
    default:
      throw new Error(`unexpected bw invocation: ${args.join(" ")}`);
  }
};

describe("bitwardenVault", () => {
  it("unlocks with the master password on the environment, never the argv", async () => {
    const run = recordingRun(respondToBw);
    const vault = bitwardenVault({
      masterPassword: "correct horse",
      run,
      session: undefined,
    });
    await vault.credentials("item-1");
    const unlock = run.calls[0];
    expect(unlock?.args).toEqual([
      "unlock",
      "--raw",
      "--passwordenv",
      "BW_PASSWORD",
    ]);
    expect(unlock?.env.BW_PASSWORD).toBe("correct horse");
    expect(unlock?.args.join(" ")).not.toContain("correct horse");
  });

  it("passes the unlocked session to later commands", async () => {
    const run = recordingRun(respondToBw);
    const vault = bitwardenVault({
      masterPassword: "correct horse",
      run,
      session: undefined,
    });
    await vault.credentials("item-1");
    expect(run.calls[1]?.args).toEqual([
      "get",
      "item",
      "item-1",
      "--session",
      "session-key-abc",
    ]);
  });

  it("unlocks once and reuses the session", async () => {
    const run = recordingRun(respondToBw);
    const vault = bitwardenVault({
      masterPassword: "correct horse",
      run,
      session: undefined,
    });
    await vault.credentials("item-1");
    await vault.credentials("item-2");
    const unlocks = run.calls.filter((call) => call.args[0] === "unlock");
    expect(unlocks).toHaveLength(1);
  });

  it("uses a session handed to it rather than unlocking", async () => {
    const run = recordingRun(respondToBw);
    const vault = bitwardenVault({
      masterPassword: undefined,
      run,
      session: "preexisting-session",
    });
    expect(await vault.credentials("item-1")).toEqual({
      password: "hunter2",
      username: "connor@example.com",
    });
    expect(run.calls.every((call) => call.args[0] !== "unlock")).toBe(true);
  });

  it("refuses to run with neither a session nor a master password", async () => {
    const vault = bitwardenVault({
      masterPassword: undefined,
      run: recordingRun(respondToBw),
      session: undefined,
    });
    await expect(vault.credentials("item-1")).rejects.toThrow(
      "no BW_SESSION and no master password",
    );
  });

  it("generates a TOTP for an item", async () => {
    const vault = bitwardenVault({
      masterPassword: undefined,
      run: recordingRun(respondToBw),
      session: "s",
    });
    expect(await vault.totp("item-1")).toBe("123456");
  });

  it("reports what the CLI complained about when it fails", async () => {
    const vault = bitwardenVault({
      masterPassword: undefined,
      run: recordingRun(() => ({
        exitCode: 1,
        stderr: "Not found.",
        stdout: "",
      })),
      session: "s",
    });
    await expect(vault.credentials("missing")).rejects.toThrow(
      "bw get item failed (exit 1): Not found.",
    );
  });

  it("keeps the secrets it was given out of a failure message", async () => {
    const vault = bitwardenVault({
      masterPassword: "correct horse",
      run: recordingRun(() => ({
        exitCode: 1,
        stderr: "Invalid master password.",
        stdout: "",
      })),
      session: undefined,
    });
    await expect(vault.credentials("item-1")).rejects.not.toThrow(
      "correct horse",
    );
  });
});

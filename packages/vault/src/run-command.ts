export type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

/**
 * Runs an external command with an explicit environment.
 *
 * The environment is a parameter rather than something the implementation
 * inherits so a secret can be handed to a child process without ever being
 * visible in `ps` output — see /docs/guidelines/AUTOMATION.md.
 */
export type RunCommand = (
  args: readonly string[],
  env: Readonly<Record<string, string>>,
) => Promise<CommandResult>;

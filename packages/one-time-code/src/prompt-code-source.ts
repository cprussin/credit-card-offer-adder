import { Err, Ok } from "@cprussin/option-result";
import { errorMessage } from "@offers/error-message/error-message";

import type { CodeRequest, CodeSource } from "./code-source";

/** Long enough to walk to a phone, short enough that a cron job still ends. */
const DEFAULT_TIMEOUT_MS = 180_000;

export type AskForCode = (prompt: string) => Promise<string>;

/**
 * The last rung of the ladder: ask whoever is at the terminal.
 *
 * Only useful for an attended run — on a server there is no terminal, the
 * default `ask` fails immediately, and the chain reports that alongside why
 * every automatic source came up empty.
 */
export const promptCodeSource = (ask: AskForCode = askOnStdin): CodeSource => ({
  name: "prompt",
  waitForCode: async (request) => {
    try {
      const typed = (await ask(promptFor(request))).trim();
      return typed.length === 0
        ? Err({ reason: "no code was entered", source: "prompt" })
        : Ok(typed);
    } catch (error) {
      return Err({ reason: errorMessage(error), source: "prompt" });
    }
  },
});

const promptFor = (request: CodeRequest): string =>
  `One-time code for ${request.accountLabel}: `;

const askOnStdin = async (prompt: string): Promise<string> => {
  if (process.stdin.isTTY === true) {
    const { createInterface } = await import("node:readline/promises");
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      return await readline.question(prompt, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } finally {
      readline.close();
    }
  } else {
    throw new Error("stdin is not a terminal");
  }
};

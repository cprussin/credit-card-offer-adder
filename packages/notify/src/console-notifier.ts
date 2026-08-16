// biome-ignore-all lint/suspicious/noConsole: the terminal is this notifier's output device

import type { Notifier } from "./notification";

/**
 * Print the run's outcome. Always wired up alongside any push notifier so an
 * interactive run shows its result, and so a scheduled run leaves the same
 * summary in the service's journal.
 */
export const consoleNotifier: Notifier = {
  send: ({ title, body }) => {
    console.log(title);
    console.log(body);
    return Promise.resolve();
  },
};

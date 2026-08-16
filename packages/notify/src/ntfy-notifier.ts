import type { NtfyClient } from "@offers/ntfy/ntfy-client";

import type { Notifier } from "./notification";

/**
 * Push the run's outcome to a phone. Thin glue over `@offers/ntfy` — the
 * decision about what a run's outcome *says* lives in `./format-run-report`.
 */
export const ntfyNotifier = (client: NtfyClient, topic: string): Notifier => ({
  send: ({ title, body }) => client.publish({ message: body, title, topic }),
});

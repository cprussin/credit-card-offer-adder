import type { Result } from "@cprussin/option-result";

import type { AccountError } from "./account-error";
import type { AccountReport } from "./run-account";

export type AccountOutcome = {
  readonly accountId: string;
  readonly label: string;
  readonly result: Result<AccountReport, AccountError>;
};

/**
 * What one scheduled run produced. Every configured account appears exactly
 * once, whether it worked or not — a run that quietly dropped an account would
 * read as a clean run in the morning notification.
 */
export type RunReport = {
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly accounts: readonly AccountOutcome[];
};

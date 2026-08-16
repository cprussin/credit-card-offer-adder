import type { Result } from "@cprussin/option-result";
import type { Account } from "@offers/config/account";

import type { AccountError } from "./account-error";
import type { AccountReport } from "./run-account";
import type { AccountOutcome, RunReport } from "./run-report";

export type RunAccountsDeps = {
  readonly runOne: (
    account: Account,
  ) => Promise<Result<AccountReport, AccountError>>;
  readonly now?: () => Date;
};

/**
 * Work through every configured account and collect one report.
 *
 * Strictly one at a time. Two sessions against the same issuer at once look
 * like credential stuffing (see /docs/guidelines/AUTOMATION.md), and two
 * accounts waiting on one-time codes simultaneously would race over which
 * message belongs to which login. The whole run is a handful of minutes, so
 * there is nothing to gain from overlapping them.
 */
export const runAccounts = async (
  accounts: readonly Account[],
  { runOne, now = () => new Date() }: RunAccountsDeps,
): Promise<RunReport> => {
  const startedAt = now();
  const outcomes: AccountOutcome[] = [];
  for (const account of accounts) {
    outcomes.push({
      accountId: account.id,
      label: account.label,
      result: await runOne(account),
    });
  }
  return { accounts: outcomes, finishedAt: now(), startedAt };
};

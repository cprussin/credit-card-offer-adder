import { AccountErrorType } from "@offers/offer-run/account-error";
import type { AccountReport } from "@offers/offer-run/run-account";
import type { AccountOutcome, RunReport } from "@offers/offer-run/run-report";

import type { Notification } from "./notification";

/**
 * Turn a run into the notification someone reads on a phone.
 *
 * The title has to carry the whole verdict, because that is all a locked
 * screen shows: how many offers landed, and whether anything needs a human. The
 * body is for the case where it does.
 */
export const formatRunReport = (report: RunReport): Notification => ({
  body: report.accounts.map(accountLine).join("\n"),
  title: title(report),
});

const title = (report: RunReport): string => {
  const added = report.accounts.reduce(
    (total, outcome) => total + addedCount(outcome),
    0,
  );
  const failed = report.accounts.filter((outcome) =>
    outcome.result.isErr(),
  ).length;
  return failed === 0
    ? addedPhrase(added)
    : `${addedPhrase(added)}, ${count(failed, "account")} failed`;
};

const addedCount = (outcome: AccountOutcome): number =>
  outcome.result.match({ Err: () => 0, Ok: (report) => report.added.length });

const addedPhrase = (added: number): string =>
  added === 0 ? "No new offers" : `${count(added, "offer")} added`;

const accountLine = (outcome: AccountOutcome): string =>
  outcome.result.match({
    Err: (error) =>
      `✗ ${outcome.label}: ${errorPhrase(error.type)} - ${error.reason}`,
    Ok: (report) => successLines(outcome.label, report),
  });

const errorPhrase = (type: AccountErrorType): string => {
  switch (type) {
    case AccountErrorType.SignInFailed:
      return "sign-in failed";
    case AccountErrorType.OffersUnavailable:
      return "offers unavailable";
  }
};

const successLines = (label: string, report: AccountReport): string =>
  [
    `✓ ${label}: ${report.added.length} added`,
    ...report.failed.map(
      (failure) => `  ! ${failure.offer.title} - ${failure.reason}`,
    ),
  ].join("\n");

const count = (n: number, noun: string): string =>
  n === 1 ? `1 ${noun}` : `${n} ${noun}s`;

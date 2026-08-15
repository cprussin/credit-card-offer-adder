import type { RunReport } from "@offers/offer-run/run-report";

/**
 * What the process reports to whatever scheduled it.
 *
 * An account that could not be run is a failure worth a red unit in
 * `systemctl status`. Individual offers that would not add are not: a bank
 * routinely declines one tile, and a timer that goes red every night is a timer
 * nobody reads.
 */
export const exitCode = (report: RunReport): number =>
  report.accounts.some((outcome) => outcome.result.isErr()) ? 1 : 0;

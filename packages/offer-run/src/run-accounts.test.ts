import { describe, expect, it } from "bun:test";
import type { Result } from "@cprussin/option-result";
import { Err, Ok } from "@cprussin/option-result";
import { Issuer } from "@offers/offer/issuer";

import { AccountError } from "./account-error";
import type { AccountReport } from "./run-account";
import { runAccounts } from "./run-accounts";

const account = (id: string, issuer = Issuer.Amex) => ({
  codeSources: [],
  id,
  imap: undefined,
  issuer,
  label: `label ${id}`,
  senderHints: ["hint"],
  vaultItem: `vault ${id}`,
});

const emptyReport: AccountReport = { added: [], durationMs: 0, failed: [] };

/** Records how many accounts were mid-run at once. */
const overlapTrackingRun = () => {
  const state = { inFlight: 0, peak: 0 };
  return {
    peak: () => state.peak,
    runOne: async (): Promise<Result<AccountReport, AccountError>> => {
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
      await Promise.resolve();
      state.inFlight -= 1;
      return Ok(emptyReport);
    },
  };
};

describe("runAccounts", () => {
  it("reports an outcome for every account", async () => {
    const report = await runAccounts([account("a"), account("b")], {
      now: () => new Date(0),
      runOne: async () => Ok(emptyReport),
    });
    expect(report.accounts.map((outcome) => outcome.accountId)).toEqual([
      "a",
      "b",
    ]);
    expect(report.accounts[0]?.label).toBe("label a");
  });

  it("never has two accounts signed in at once", async () => {
    const tracker = overlapTrackingRun();
    await runAccounts([account("a"), account("b"), account("c")], {
      now: () => new Date(0),
      runOne: tracker.runOne,
    });
    expect(tracker.peak()).toBe(1);
  });

  it("keeps going after an account fails", async () => {
    const report = await runAccounts([account("a"), account("b")], {
      now: () => new Date(0),
      runOne: async (target) =>
        target.id === "a"
          ? Err(AccountError.SignInFailed("no code arrived"))
          : Ok(emptyReport),
    });
    expect(report.accounts[0]?.result).toEqual(
      Err(AccountError.SignInFailed("no code arrived")),
    );
    expect(report.accounts[1]?.result).toEqual(Ok(emptyReport));
  });

  it("stamps the run's start and finish", async () => {
    const readings = [new Date(1000), new Date(4000)];
    const report = await runAccounts([account("a")], {
      now: () => readings.shift() ?? new Date(9999),
      runOne: async () => Ok(emptyReport),
    });
    expect(report.startedAt).toEqual(new Date(1000));
    expect(report.finishedAt).toEqual(new Date(4000));
  });
});

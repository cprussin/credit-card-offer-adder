import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";
import { AccountError } from "@offers/offer-run/account-error";
import type { AccountOutcome, RunReport } from "@offers/offer-run/run-report";

import { exitCode } from "./exit-code";

const report = (accounts: RunReport["accounts"]): RunReport => ({
  accounts,
  finishedAt: new Date(1000),
  startedAt: new Date(0),
});

const outcomeOk = (accountId: string, failedOffers = 0): AccountOutcome => ({
  accountId,
  label: accountId,
  result: Ok({
    added: [],
    durationMs: 0,
    failed: Array.from({ length: failedOffers }, (_unused, index) => ({
      offer: { id: `${index}`, title: `offer ${index}` },
      reason: "tile never flipped to added",
    })),
  }),
});

describe("exitCode", () => {
  it("succeeds when every account was worked through", () => {
    expect(exitCode(report([outcomeOk("a"), outcomeOk("b")]))).toBe(0);
  });

  it("fails when an account could not be run", () => {
    expect(
      exitCode(
        report([
          outcomeOk("a"),
          {
            accountId: "b",
            label: "b",
            result: Err(AccountError.SignInFailed("no code arrived")),
          },
        ]),
      ),
    ).toBe(1);
  });

  it("succeeds when only individual offers refused to add", () => {
    expect(exitCode(report([outcomeOk("a", 3)]))).toBe(0);
  });
});

import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";
import { AccountError } from "@offers/offer-run/account-error";
import type { AccountOutcome, RunReport } from "@offers/offer-run/run-report";

import { formatRunReport } from "./format-run-report";

const report = (accounts: RunReport["accounts"]): RunReport => ({
  accounts,
  finishedAt: new Date("2026-08-15T03:04:00Z"),
  startedAt: new Date("2026-08-15T03:00:00Z"),
});

const added = (
  accountId: string,
  label: string,
  titles: readonly string[],
): AccountOutcome => ({
  accountId,
  label,
  result: Ok({
    added: titles.map((title) => ({ id: title, title })),
    durationMs: 60_000,
    failed: [],
  }),
});

describe("formatRunReport", () => {
  it("leads with the total added", () => {
    const formatted = formatRunReport(
      report([
        added("connor-amex", "Connor · Amex", ["Sweetgreen 20%", "Delta $50"]),
        added("connor-chase", "Connor · Chase", ["Shell 10%"]),
      ]),
    );
    expect(formatted.title).toBe("3 offers added");
  });

  it("counts a single offer in the singular", () => {
    const formatted = formatRunReport(
      report([added("connor-amex", "Connor · Amex", ["Sweetgreen 20%"])]),
    );
    expect(formatted.title).toBe("1 offer added");
  });

  it("says so when every card was already fully enrolled", () => {
    const formatted = formatRunReport(
      report([added("connor-amex", "Connor · Amex", [])]),
    );
    expect(formatted.title).toBe("No new offers");
  });

  it("puts failed accounts in the title so the push is worth reading", () => {
    const formatted = formatRunReport(
      report([
        added("connor-amex", "Connor · Amex", ["Sweetgreen 20%"]),
        {
          accountId: "connor-chase",
          label: "Connor · Chase",
          result: Err(AccountError.SignInFailed("no code arrived within 120s")),
        },
      ]),
    );
    expect(formatted.title).toBe("1 offer added, 1 account failed");
  });

  it("gives each account a line saying what happened", () => {
    const formatted = formatRunReport(
      report([
        added("connor-amex", "Connor · Amex", ["Sweetgreen 20%"]),
        {
          accountId: "connor-chase",
          label: "Connor · Chase",
          result: Err(AccountError.SignInFailed("no code arrived within 120s")),
        },
      ]),
    );
    expect(formatted.body).toContain("Connor · Amex: 1 added");
    expect(formatted.body).toContain(
      "Connor · Chase: sign-in failed - no code arrived within 120s",
    );
  });

  it("distinguishes a broken offers page from a broken sign-in", () => {
    const formatted = formatRunReport(
      report([
        {
          accountId: "connor-amex",
          label: "Connor · Amex",
          result: Err(
            AccountError.OffersUnavailable("offers grid never rendered"),
          ),
        },
      ]),
    );
    expect(formatted.body).toContain(
      "Connor · Amex: offers unavailable - offers grid never rendered",
    );
  });

  it("names the offers that refused to add", () => {
    const formatted = formatRunReport(
      report([
        {
          accountId: "connor-amex",
          label: "Connor · Amex",
          result: Ok({
            added: [],
            durationMs: 1000,
            failed: [
              {
                offer: { id: "delta", title: "Delta $50" },
                reason: "tile never flipped to added",
              },
            ],
          }),
        },
      ]),
    );
    expect(formatted.body).toContain("Delta $50 - tile never flipped to added");
  });
});

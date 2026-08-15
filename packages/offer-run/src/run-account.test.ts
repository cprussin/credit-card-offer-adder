import { describe, expect, it } from "bun:test";
import { Err, Ok } from "@cprussin/option-result";
import type { OfferSurface } from "@offers/offer/offer-surface";
import type { PendingOffer } from "@offers/offer/pending-offer";

import { AccountError } from "./account-error";
import type { AccountSession } from "./account-session";
import { runAccount } from "./run-account";

const account = {
  codeSources: [],
  id: "connor-amex",
  imap: undefined,
  issuer: 0,
  label: "Connor · Amex",
  senderHints: ["americanexpress"],
  vaultItem: "amex-connor",
};

const offer = (id: string): PendingOffer => ({ id, title: `offer ${id}` });

const surfaceOf = (
  pending: readonly PendingOffer[],
  rejects: ReadonlySet<string> = new Set(),
): OfferSurface => {
  const state = { pending: [...pending] };
  return {
    add: (target) => {
      if (rejects.has(target.id)) {
        return Promise.reject(new Error("tile never flipped to added"));
      } else {
        state.pending = state.pending.filter((each) => each.id !== target.id);
        return Promise.resolve();
      }
    },
    listPendingOffers: () => Promise.resolve(state.pending),
    loadMore: () => Promise.resolve(false),
  };
};

const sessionOf = (
  openOffers: () => Promise<OfferSurface>,
): AccountSession & { readonly closed: () => number } => {
  const state = { closed: 0 };
  return {
    close: () => {
      state.closed += 1;
      return Promise.resolve();
    },
    closed: () => state.closed,
    openOffers,
  };
};

/** A clock that advances a fixed amount every time it is read. */
const tickingClock = (stepMs: number) => {
  const state = { now: 0 };
  return () => {
    const reading = new Date(state.now);
    state.now += stepMs;
    return reading;
  };
};

describe("runAccount", () => {
  it("reports the offers it added", async () => {
    const session = sessionOf(() =>
      Promise.resolve(surfaceOf([offer("a"), offer("b")])),
    );
    const outcome = await runAccount(account, {
      now: tickingClock(0),
      openSession: () => Promise.resolve(session),
    });
    expect(outcome).toEqual(
      Ok({
        added: [offer("a"), offer("b")],
        durationMs: 0,
        failed: [],
      }),
    );
  });

  it("reports offers that would not add, alongside the ones that did", async () => {
    const session = sessionOf(() =>
      Promise.resolve(surfaceOf([offer("a"), offer("b")], new Set(["b"]))),
    );
    const outcome = await runAccount(account, {
      now: tickingClock(0),
      openSession: () => Promise.resolve(session),
    });
    expect(
      outcome.match({
        Err: () => undefined,
        Ok: (report) => report.failed,
      }),
    ).toEqual([{ offer: offer("b"), reason: "tile never flipped to added" }]);
  });

  it("times the account with the injected clock", async () => {
    const session = sessionOf(() => Promise.resolve(surfaceOf([])));
    const outcome = await runAccount(account, {
      now: tickingClock(1500),
      openSession: () => Promise.resolve(session),
    });
    expect(
      outcome.match({
        Err: () => undefined,
        Ok: (report) => report.durationMs,
      }),
    ).toBe(1500);
  });

  it("turns a failed sign-in into an error naming the account's step", async () => {
    const outcome = await runAccount(account, {
      now: tickingClock(0),
      openSession: () =>
        Promise.reject(new Error("no code arrived within 120s")),
    });
    expect(outcome).toEqual(
      Err(AccountError.SignInFailed("no code arrived within 120s")),
    );
  });

  it("turns an unreachable offers page into its own error", async () => {
    const session = sessionOf(() =>
      Promise.reject(new Error("offers grid never rendered")),
    );
    const outcome = await runAccount(account, {
      now: tickingClock(0),
      openSession: () => Promise.resolve(session),
    });
    expect(outcome).toEqual(
      Err(AccountError.OffersUnavailable("offers grid never rendered")),
    );
  });

  it("closes the session after a successful run", async () => {
    const session = sessionOf(() => Promise.resolve(surfaceOf([offer("a")])));
    await runAccount(account, {
      now: tickingClock(0),
      openSession: () => Promise.resolve(session),
    });
    expect(session.closed()).toBe(1);
  });

  it("closes the session when the offers page fails", async () => {
    const session = sessionOf(() =>
      Promise.reject(new Error("offers grid never rendered")),
    );
    await runAccount(account, {
      now: tickingClock(0),
      openSession: () => Promise.resolve(session),
    });
    expect(session.closed()).toBe(1);
  });
});

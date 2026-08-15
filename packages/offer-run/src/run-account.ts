import type { Result } from "@cprussin/option-result";
import { Err, Ok } from "@cprussin/option-result";
import type { Account } from "@offers/config/account";
import { errorMessage } from "@offers/error-message/error-message";
import type { OfferAddFailure } from "@offers/offer/add-offers";
import { addOffers } from "@offers/offer/add-offers";
import type { PendingOffer } from "@offers/offer/pending-offer";

import { AccountError } from "./account-error";
import type { AccountSession, OpenAccountSession } from "./account-session";

export type AccountReport = {
  readonly added: readonly PendingOffer[];
  readonly failed: readonly OfferAddFailure[];
  readonly durationMs: number;
};

export type RunAccountDeps = {
  readonly openSession: OpenAccountSession;
  readonly now?: () => Date;
};

/**
 * Add every available offer to one account's cards.
 *
 * Returns a `Result` rather than throwing because the caller runs three more
 * accounts after this one: a bank that is down, or a code that never arrives,
 * must cost exactly one account. The session is closed on every path — a leaked
 * browser profile lock would break the *next* run too.
 */
export const runAccount = async (
  account: Account,
  { openSession, now = () => new Date() }: RunAccountDeps,
): Promise<Result<AccountReport, AccountError>> => {
  const startedAt = now();
  const opened = await signIn(account, openSession);
  return opened.match<Promise<Result<AccountReport, AccountError>>>({
    Err: (error) => Promise.resolve(Err(error)),
    Ok: async (session) => {
      try {
        return await addEverything(session, startedAt, now);
      } finally {
        await session.close();
      }
    },
  });
};

const signIn = async (
  account: Account,
  openSession: OpenAccountSession,
): Promise<Result<AccountSession, AccountError>> => {
  try {
    return Ok(await openSession(account));
  } catch (error) {
    return Err(AccountError.SignInFailed(errorMessage(error)));
  }
};

const addEverything = async (
  session: AccountSession,
  startedAt: Date,
  now: () => Date,
): Promise<Result<AccountReport, AccountError>> => {
  try {
    const surface = await session.openOffers();
    const { added, failed } = await addOffers({ surface });
    return Ok({
      added,
      durationMs: now().getTime() - startedAt.getTime(),
      failed,
    });
  } catch (error) {
    return Err(AccountError.OffersUnavailable(errorMessage(error)));
  }
};

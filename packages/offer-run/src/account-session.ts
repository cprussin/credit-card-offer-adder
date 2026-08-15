import type { Account } from "@offers/config/account";
import type { OfferSurface } from "@offers/offer/offer-surface";

/**
 * A signed-in browser session for one account.
 *
 * Opening one covers everything that has to go right before an offer can be
 * added — launching the account's browser profile, pulling its credentials from
 * the vault, answering whatever the bank asks for — so `runAccount` can treat
 * all of that as a single step that either works or doesn't. Keeping the
 * Playwright pieces behind this port is what lets the run loop be unit-tested;
 * see /docs/guidelines/AUTOMATION.md.
 */
export type AccountSession = {
  readonly openOffers: () => Promise<OfferSurface>;
  readonly close: () => Promise<void>;
};

export type OpenAccountSession = (account: Account) => Promise<AccountSession>;

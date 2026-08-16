import type { Issuer } from "@offers/offer/issuer";
import type { OfferSurface } from "@offers/offer/offer-surface";
import type { VaultCredentials } from "@offers/vault/vault-item";
import type { Page } from "playwright";

export type SignInInput = {
  readonly page: Page;
  readonly credentials: VaultCredentials;
  /**
   * Obtain a one-time code, stamping the request time itself so a delivery
   * channel can tell this challenge's code from the last one's. Throws when no
   * source can produce one — an adapter has nothing useful to do about that, so
   * it lets the failure travel up to `runAccount`.
   */
  readonly requestCode: () => Promise<string>;
};

/**
 * Everything that is specific to one bank. Two methods because the two halves
 * fail for different reasons and are reported differently: `signIn` failing
 * usually means a code never arrived, while `openOffers` failing means the page
 * changed shape.
 *
 * These are the only modules allowed to hold Playwright types — see
 * /docs/guidelines/AUTOMATION.md.
 */
export type IssuerAdapter = {
  readonly issuer: Issuer;
  readonly signIn: (input: SignInInput) => Promise<void>;
  readonly openOffers: (page: Page) => Promise<OfferSurface>;
};

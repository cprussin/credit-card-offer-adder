import type { PendingOffer } from "./pending-offer";

/**
 * The whole of what the add loop needs from an issuer's offers page. Keeping
 * this port free of Playwright types is what lets the loop be unit-tested with
 * a plain object; see /docs/guidelines/AUTOMATION.md.
 *
 * `add` resolves once the tile has actually flipped to enrolled and throws
 * otherwise — a resolved promise is the loop's evidence that the offer landed.
 * `loadMore` returns whether it revealed more of the grid, so the loop can page
 * a lazily-rendered list in before it decides what is left to do.
 */
export type OfferSurface = {
  readonly listPendingOffers: () => Promise<readonly PendingOffer[]>;
  readonly add: (offer: PendingOffer) => Promise<void>;
  readonly loadMore: () => Promise<boolean>;
};

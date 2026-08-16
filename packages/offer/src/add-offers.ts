import { errorMessage } from "@offers/error-message/error-message";

import type { OfferSurface } from "./offer-surface";
import type { PendingOffer } from "./pending-offer";

/**
 * Issuers re-render the grid after each enrollment, so a pass can uncover
 * tiles the previous one never saw. Five passes is well past what either bank
 * has ever needed and keeps a re-rendering loop from running forever.
 */
const DEFAULT_MAX_PASSES = 5;

/**
 * Amex pages ~20 offers at a time and the largest card we have seen carries a
 * few hundred, so 50 clicks is generous. Exceeding it means the page is
 * looping, not that the customer has that many offers.
 */
const DEFAULT_MAX_LOAD_MORE_CLICKS = 50;

export type OfferAddFailure = {
  readonly offer: PendingOffer;
  readonly reason: string;
};

export type AddOffersReport = {
  readonly added: readonly PendingOffer[];
  readonly failed: readonly OfferAddFailure[];
};

export type AddOffersOptions = {
  readonly surface: OfferSurface;
  readonly maxPasses?: number;
  readonly maxLoadMoreClicks?: number;
};

/**
 * Enroll a card in every offer its surface still lists as pending.
 *
 * One offer refusing to add must not cost us the other twenty on the same
 * card, so a failed enrollment becomes an entry in `failed` rather than a
 * thrown error. A failure the *whole* run can't proceed past — a grid that
 * never finishes paging — still throws.
 */
export const addOffers = async ({
  surface,
  maxPasses = DEFAULT_MAX_PASSES,
  maxLoadMoreClicks = DEFAULT_MAX_LOAD_MORE_CLICKS,
}: AddOffersOptions): Promise<AddOffersReport> => {
  const attempted = new Set<string>();
  const added: PendingOffer[] = [];
  const failed: OfferAddFailure[] = [];
  let foundWork = true;
  for (let pass = 0; pass < maxPasses && foundWork; pass += 1) {
    const pending = await nextPending(surface, attempted, maxLoadMoreClicks);
    for (const offer of pending) {
      attempted.add(offer.id);
      try {
        await surface.add(offer);
        added.push(offer);
      } catch (error) {
        failed.push({ offer, reason: errorMessage(error) });
      }
    }
    foundWork = pending.length > 0;
  }
  return { added, failed };
};

/** Page the grid all the way in, then report what has not been tried yet. */
const nextPending = async (
  surface: OfferSurface,
  attempted: ReadonlySet<string>,
  maxLoadMoreClicks: number,
): Promise<readonly PendingOffer[]> => {
  await loadWholeGrid(surface, maxLoadMoreClicks);
  const pending = await surface.listPendingOffers();
  return pending.filter((offer) => !attempted.has(offer.id));
};

const loadWholeGrid = async (
  surface: OfferSurface,
  maxLoadMoreClicks: number,
): Promise<void> => {
  let clicks = 0;
  let more = await surface.loadMore();
  while (more) {
    clicks += 1;
    if (clicks >= maxLoadMoreClicks) {
      throw new Error(
        `offers grid still reported more results after ${maxLoadMoreClicks} loads`,
      );
    } else {
      more = await surface.loadMore();
    }
  }
};

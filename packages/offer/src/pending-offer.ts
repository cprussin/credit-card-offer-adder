/**
 * An offer a card is not yet enrolled in. `id` is whatever the issuer's page
 * uses to identify the tile — it only has to be stable within a single run so
 * the add loop can tell a re-listed offer from a new one.
 */
export type PendingOffer = {
  readonly id: string;
  readonly title: string;
};

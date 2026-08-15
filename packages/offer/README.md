# @offers/offer

The domain of "add every offer to a card", with no idea what a browser is.

## What it does

`addOffers` takes an [`OfferSurface`](./src/offer-surface.ts) — a three-method
port over an issuer's offers page — and enrolls the card in everything the
surface still lists as pending.

The loop is where all the care is:

- **Pages the grid in first.** Both issuers lazily render offers behind a
  "view more" button, so `loadMore` is exhausted before anything is listed.
  A grid that never stops reporting more results throws rather than spinning.
- **Never re-attempts an offer.** A tile that refuses to add stays on the page
  and would otherwise be retried forever.
- **Re-lists between passes.** Enrolling re-renders the grid and can uncover
  tiles the previous pass never saw, bounded by a pass budget.
- **Isolates per-offer failure.** One offer that will not add becomes an entry
  in `failed`, not an exception that costs the other twenty on the card.

## Usage

```ts
import { addOffers } from "@offers/offer/add-offers";

const { added, failed } = await addOffers({ surface });
```

## Modules

- [`add-offers`](./src/add-offers.ts) — the loop, and the report it produces.
- [`offer-surface`](./src/offer-surface.ts) — the port an issuer adapter
  implements.
- [`pending-offer`](./src/pending-offer.ts) — an offer a card is not yet
  enrolled in.
- [`issuer`](./src/issuer.ts) — the `Issuer` enum.

## Testing

```sh
bun run --filter @offers/offer test:unit
bun run --filter @offers/offer test:types
```

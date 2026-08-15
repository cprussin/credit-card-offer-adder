# @offers/issuer-amex

Amex Offers: signing in, and the offers grid.

## Fixing it when the site changes

Every DOM handle this adapter depends on is in one object — `AMEX` at the top
of [`amex-adapter.ts`](./src/amex-adapter.ts) — so a reskin costs a single edit
in a known place. All but one are the accessible name a customer reads
(`getByRole("button", { name: /add to card/i })`), which survives a restyle in
a way a hashed class name does not. The exception, `offerTile`, is the
documented structural fallback for grouping a tile's controls, since the grid
exposes no accessible container.

Every wait is bounded, and a failure names the step that broke ("Amex offers
grid never rendered") rather than quietly returning nothing, so a site change
shows up as a failed run with a screenshot instead of a run that reports zero
new offers.

## Two-factor

Amex will not accept an authenticator app for most accounts, so its ladder is
expected to land on the mailbox; the adapter picks email delivery when the
challenge offers a choice. Either way it ticks "remember this device" before
submitting the code, which is what keeps the *next* run unattended.

## Testing

This package is DOM glue over a site we cannot run in CI: the decisions it
would otherwise contain live in [`@offers/offer`](../offer/README.md)'s
`addOffers` and [`@offers/offer-run`](../offer-run/README.md), which are unit
tested against the `OfferSurface` port this implements. See
/docs/guidelines/TESTING.md on glue. Verify it by running the app against the
live site.

```sh
bun run --filter @offers/issuer-amex test:types
```

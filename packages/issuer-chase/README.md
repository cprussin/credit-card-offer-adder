# @offers/issuer-chase

Chase Offers: signing in, and the offers grid.

## Fixing it when the site changes

Every DOM handle this adapter depends on is in one object — `CHASE` at the top
of [`chase-adapter.ts`](./src/chase-adapter.ts) — so a reskin costs a single
edit in a known place. Almost all are the accessible name a customer reads
(`getByRole("button", { name: /^add\b/i })`), which survives a restyle in a way
a hashed class name does not. The two exceptions are documented structural
fallbacks: `loginFrame`, because Chase has moved the login form between an
iframe and the page itself more than once, and `offerTile`, because the grid
exposes no accessible tile container.

Every wait is bounded, and a failure names the step that broke ("Chase offers
grid never rendered") rather than quietly returning nothing, so a site change
shows up as a failed run with a screenshot instead of a run that reports zero
new offers.

## Two-factor

Chase can be enrolled in authenticator-app verification, which is why a Chase
account's ladder should start with `totp` — with the secret on the vault item,
even a challenged login needs nobody. Failing that it behaves like Amex: ask
for email delivery, and tick "remember this device" before submitting the code,
which is what keeps the *next* run unattended.

## Testing

This package is DOM glue over a site we cannot run in CI: the decisions it
would otherwise contain live in [`@offers/offer`](../offer/README.md)'s
`addOffers` and [`@offers/offer-run`](../offer-run/README.md), which are unit
tested against the `OfferSurface` port this implements. See
/docs/guidelines/TESTING.md on glue. Verify it by running the app against the
live site.

```sh
bun run --filter @offers/issuer-chase test:types
```

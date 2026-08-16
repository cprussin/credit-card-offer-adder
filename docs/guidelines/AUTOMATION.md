# Browser automation & secrets

Rules for code that drives a bank's website or handles a credential. The
sites we automate are third-party, hostile to scraping, and guard real
money — these rules exist so a DOM change costs us a selector edit rather
than a locked account or a leaked password.

## Keep the DOM at the edge

Playwright types (`Page`, `Locator`, `BrowserContext`) may appear **only** in
adapter modules. Every decision — which offers to add, when to retry, when a
run has failed — lives in a pure module that takes a narrow port and knows
nothing about the browser.

```ts
// correct — the port the decision logic depends on
export type OfferSurface = {
  readonly listPendingOffers: () => Promise<readonly PendingOffer[]>;
  readonly add: (offer: PendingOffer) => Promise<void>;
  readonly loadMore: () => Promise<boolean>;
};
```

The payoff is testability: the loop that adds every offer on a card is
exercised with a plain object, and the Playwright implementation of the port
is thin enough to fall under TESTING.md's "trivial glue" exception. If you
find yourself wanting to unit-test something that holds a `Page`, the seam is
in the wrong place.

## Semantic locators only

Locate elements by the accessible name a human reads — `getByRole`,
`getByLabel`, `getByText`. Never by hashed class names, `nth-child` chains,
or generated `data-*` attributes.

```ts
// wrong — breaks on the next deploy
page.locator("div.offer-tile__cta > button.btn-primary");

// correct — survives a restyle
page.getByRole("button", { name: /add to card/i });
```

Banks reskin constantly but rarely rename the button a customer is told to
click. Where a site genuinely offers no accessible handle, put the fallback
selector in that adapter's selector table with a comment explaining what it
anchors to, so the next breakage is a one-line edit in a known place.

## Never write outside the offers surface

An adapter may authenticate, navigate, read, and click **enrollment**
controls. It must never initiate a transfer, change a setting, open or close
an account, or submit any form that is not the offer-enrollment button.
Assume every run is unattended and every mistake is irreversible.

## Secrets never leave the process

- Every secret comes from `@offers/credentials`, and from nowhere else. Never
  accept a password, TOTP secret, or token from `offers.config.json`, from a
  CLI flag, from an environment variable, or from a literal. `OFFERS_CONFIG`
  and `OFFERS_CREDENTIALS` name *files*; they never carry a value.
- Anything added to the config schema must be safe in `/nix/store`, because
  that is where the NixOS module puts it. If a new field could hold a secret,
  it belongs in the credentials schema instead.
- Never log a password, a session token, a one-time code, or a cookie —
  not at debug level, not "temporarily."
- Diagnostic artifacts (screenshots, HTML dumps) are captured **only** after
  a failure and **only** from the offers surface, never from a login form
  with a filled field. Write them under the run's artifact directory, which
  is git-ignored.
- A `toString`/`JSON.stringify` of a credential-bearing object is a defect.
  Keep secrets in narrowly-scoped values that are passed straight into the
  page, not stored on long-lived objects.

## Be a polite client

- One account at a time. Never run two sessions against the same issuer
  concurrently — parallel logins look like credential stuffing.
- Human-scale pacing between clicks, and a bounded number of add attempts
  per offer. A tight retry loop against a bank is indistinguishable from an
  attack.
- Bound every wait. An unbounded `waitFor` turns a site change into a hung
  scheduled job instead of a failed one you get told about.

## Fail loudly, and say what broke

A site change must surface as a specific error naming the step that failed
("offers grid never rendered"), not as an empty result. Zero offers added
because the page changed and zero offers added because there were none to add
are different outcomes and must be different values — see
[/docs/guidelines/ERRORS.md](/docs/guidelines/ERRORS.md).

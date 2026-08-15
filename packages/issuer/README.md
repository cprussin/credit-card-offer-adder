# @offers/issuer

The `IssuerAdapter` port: everything specific to one bank, and nothing else.

Two methods, because the halves fail for different reasons and are reported
differently — `signIn` failing usually means a code never arrived, while
`openOffers` failing means the page changed shape.

```ts
export type IssuerAdapter = {
  readonly issuer: Issuer;
  readonly signIn: (input: SignInInput) => Promise<void>;
  readonly openOffers: (page: Page) => Promise<OfferSurface>;
};
```

`signIn` receives a `requestCode` callback rather than a code, so the adapter
asks only if the bank actually challenges it — most runs never do.

Implementations: [`@offers/issuer-amex`](../issuer-amex/README.md),
[`@offers/issuer-chase`](../issuer-chase/README.md). These and
[`@offers/browser-session`](../browser-session/README.md) are the only packages
allowed to hold Playwright types; see /docs/guidelines/AUTOMATION.md.

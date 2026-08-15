/**
 * The card issuers we automate. This is the in-memory representation; the
 * config file's `"amex"` / `"chase"` strings are mapped onto it by the codec in
 * `@offers/config/account`.
 */
export enum Issuer {
  Amex,
  Chase,
}

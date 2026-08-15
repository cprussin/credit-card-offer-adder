/**
 * The ways a run can obtain a one-time code, in the order a sensible ladder
 * puts them: `Totp` and `Imap` need no human at all, `Ntfy` costs one tap on a
 * phone, and `Prompt` only works when somebody is watching the terminal.
 *
 * This is the in-memory representation; the config file's `"totp"` / `"imap"`
 * / `"ntfy"` / `"prompt"` strings are mapped onto it by the codec in
 * `@offers/config/account`.
 */
export enum CodeSourceKind {
  Totp,
  Imap,
  Ntfy,
  Prompt,
}

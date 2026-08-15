# Offer automation

Add every available Amex Offer and Chase Offer to four cards — two people,
two issuers — on a schedule, with nobody watching.

## Problem

Both issuers hand out targeted statement-credit offers that are worthless
until you click "Add to Card" on each one. They appear continuously, expire,
and there is no API. Doing it by hand means logging into four accounts,
clearing a 2FA challenge each time, and clicking through a few hundred tiles.

Two things make this hard to automate rather than merely tedious:

1. **The banks require one-time codes.** Both offer SMS, email, and voice
   delivery; Chase also accepts an authenticator app. A run that needs a human
   to read a text message is not unattended.
2. **The pages change.** There is no contract, so any selector is a liability.

## Design

A scheduled process walks the accounts one at a time. Each account gets its
own persistent browser profile, its credentials from Vaultwarden, and a
ladder of one-time-code sources ordered so the automatic ones are tried first.

```
systemd timer
  └─ apps/offer-adder ────────────────────────── wiring only
       ├─ @offers/config          offers.config.json → Account[]
       ├─ @offers/vault           bw CLI → passwords, TOTPs
       ├─ @offers/offer-run       runAccounts → runAccount → addOffers
       │    ├─ @offers/browser-session   per-account persistent Chromium profile
       │    ├─ @offers/issuer-amex  ─┐
       │    ├─ @offers/issuer-chase ─┴─ IssuerAdapter: signIn + openOffers
       │    └─ @offers/offer        addOffers over an OfferSurface port
       ├─ @offers/one-time-code   totp → imap → ntfy → prompt
       └─ @offers/notify          run report → ntfy push + journal
```

### Staying logged in is the whole trick

Both banks stop challenging a browser they recognize. The profile directory —
cookies, local storage, the device token — is therefore the most valuable
state in the system, and it is per account and durable
(`~/.local/state/offer-adder/profiles/<account-id>`). A run that is challenged
checks "remember this device" before submitting the code, so the challenge is
a first-run event rather than a nightly one.

### The code ladder

Configured per account, tried in order, first code wins:

| Source | Human cost | When it applies |
|---|---|---|
| `totp` | none | Chase enrolled in an authenticator app; secret lives in the vault item |
| `imap` | none | The bank delivers to a mailbox we can poll — email delivery, or an SMS forwarded to email |
| `ntfy` | one tap | Bank insists on SMS: push a request, someone publishes the digits back |
| `prompt` | full attention | Attended runs only; fails immediately on a server |

`selectCode` is what keeps this honest: a delivered message counts only if it
arrived after the login asked for a code (with a minute of clock slack) and
matches the account's `senderHints`. Give each account its own mailbox address
and two people at the same issuer can never read each other's codes.

### Ports, so the decisions are testable

Playwright types appear only in `issuer-*` and `browser-session`. Everything
that decides anything sits behind a narrow port and is unit-tested against a
plain object:

| Port | Defined in | Decisions it enables testing |
|---|---|---|
| `OfferSurface` | `@offers/offer/offer-surface` | the add loop: paging, dedup, per-offer failure isolation, pass budget |
| `AccountSession` | `@offers/offer-run/account-session` | error classification, session closing, timing |
| `CodeSource` | `@offers/one-time-code/code-source` | ladder order, fall-through, exhaustion reporting |
| `Vault` | `@offers/vault/vault` | secrets never reach argv; one unlock per run |
| `RunCommand` | `@offers/vault/run-command` | `bw` invocation shape |

### Failure is a value, not an exception

One offer that will not add must not cost the other twenty on the card, and
one account that will not log in must not cost the other three. So
`addOffers` returns per-offer failures in its report, `runAccount` returns
`Result<AccountReport, AccountError>`, and only a run-ending problem — a grid
that never stops paging — throws. Exit code is non-zero when an *account*
failed, not when an individual offer did, so the timer only goes red for
things worth looking at.

## Key decisions

- **Scrape, don't reverse-engineer.** Both issuers have internal JSON APIs, but
  they are unversioned, auth-bound to the page, and their use is further from
  ordinary customer behavior than clicking is. A DOM change costs a selector
  edit; an API change costs a reverse-engineering session.
- **Accessible names over CSS.** `getByRole("button", { name: /add to card/i })`
  survives a reskin; `.btn-primary` does not. Each adapter's selector table is
  a single object at the top of the file.
- **One account at a time.** Concurrency would save a few minutes and buys a
  credential-stuffing signature plus a race between two logins over which code
  in the mailbox is whose.
- **Xvfb over headless.** Headless Chromium is the loudest bot signal
  available, and being fingerprinted means being challenged, which is the one
  thing this design cannot absorb.
- **Bitwarden CLI over the Bitwarden API.** `bw` already speaks to Vaultwarden,
  already handles the unlock, and generates TOTPs. The alternative is
  reimplementing the vault crypto.

## Plan

- [x] domain: `PendingOffer`, `OfferSurface`, `addOffers`
- [x] `@offers/config`: schema, issuer/code-source codecs, ladder defaults
- [x] `@offers/vault`: `bw` wrapper, item parsing, session memoization
- [x] `@offers/one-time-code`: port, chain, `selectCode`, totp/ntfy/prompt sources
- [x] `@offers/one-time-code-imap`: mailbox polling
- [x] `@offers/ntfy`: publish + subscribe
- [x] `@offers/browser-session`: persistent profiles, failure artifacts
- [x] `@offers/issuer-amex`, `@offers/issuer-chase`: sign-in + offers surface
- [x] `@offers/offer-run`: `runAccount`, `runAccounts`, report
- [x] `@offers/notify`: report formatting, ntfy + console delivery
- [x] `apps/offer-adder`: wiring, exit code
- [x] `deploy/`: systemd unit and timer
- [ ] first supervised run against each of the four accounts, tuning each
      adapter's selector table against what the live pages actually render
- [ ] decide whether the Chase accounts can be enrolled in authenticator-app
      verification, which would remove the mailbox from their ladder entirely

## Open questions

- **Does Amex expose an email-delivery radio on every challenge?** The adapter
  selects it when present and otherwise takes whatever Amex defaults to. If a
  given account only ever gets SMS, the fix is an SMS-to-email forwarding rule
  on the phone, which puts it back on the `imap` rung. Recommendation: confirm
  during the first supervised run before adding any per-account special-casing.
- **How stale can a Vaultwarden session get?** `bw unlock` sessions do not
  expire on their own, but a master password change invalidates them and the
  service would start failing every run. Recommendation: leave `BW_PASSWORD`
  out of the unit and accept a manual re-provision, since a password change is
  a once-a-year event and the alternative is a master password on disk.

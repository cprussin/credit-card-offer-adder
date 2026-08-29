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
own persistent browser profile, its own entry in the credentials document, and
a ladder of one-time-code sources ordered so the automatic ones are tried
first.

```
systemd timer  ── LoadCredentialEncrypted ──┐
  └─ apps/offer-adder ────────────────────── wiring only
       ├─ @offers/config          offers.config.json → Account[]   (no secrets)
       ├─ @offers/credentials     $CREDENTIALS_DIRECTORY → logins  (only secrets)
       ├─ @offers/totp            stored secret → RFC 6238 code
       ├─ @offers/offer-run       runAccounts → runAccount → addOffers
       │    ├─ @offers/browser-session   per-account persistent Chromium profile
       │    ├─ @offers/issuer-amex  ─┐
       │    ├─ @offers/issuer-chase ─┴─ IssuerAdapter: signIn + openOffers
       │    └─ @offers/offer        addOffers over an OfferSurface port
       ├─ @offers/one-time-code   totp → imap → ntfy → prompt
       └─ @offers/notify          run report → ntfy push + journal
```

### Two inputs, split by whether they are secret

`offers.config.json` holds account ids, labels, issuers, ladder order, and IMAP
hosts — nothing that needs protecting, so it can be rendered into the
world-readable Nix store and reviewed in a diff. The credentials document holds
the passwords, TOTP secrets, mailbox logins, and ntfy token, keyed by account
id, and nothing else.

That split is what makes the deployment defensible. The secret half is one
small file with one shape, so it can be sealed to the host's TPM and handed to
the service through `LoadCredentialEncrypted` — decrypted at unit start into a
per-unit tmpfs, mode 0400, gone when the run exits, never in the environment.
The service's entire reach is four bank logins and one mailbox.

The earlier design fetched credentials from Vaultwarden through the Bitwarden
CLI. It was rejected because it inverted the blast radius: to avoid keeping four
passwords on disk, it kept either a long-lived vault session or the master
password itself, either of which is the whole vault. Keeping only what the
service actually uses is strictly less to lose.

### Staying logged in is the whole trick

Both banks stop challenging a browser they recognize. The profile directory —
cookies, local storage, the device token — is therefore the most valuable
state in the system, and it is per account and durable — `profileDir`, which
defaults to `~/.local/state/offer-adder/profiles/<account-id>` and which the
NixOS module points at `/var/lib/offer-adder/profiles`. A run that is challenged
checks "remember this device" before submitting the code, so the challenge is
a first-run event rather than a nightly one.

### The code ladder

Configured per account, tried in order, first code wins:

| Source | Human cost | When it applies |
|---|---|---|
| `totp` | none | Chase enrolled in an authenticator app; `@offers/totp` computes the code from the account's stored secret |
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
| `Mailbox` | `@offers/one-time-code-imap/imap-mailbox` | which delivered message is this login's code |
| `SecretFileDeps` | `@offers/credentials/secret-file` | refusing a credentials file readable beyond its owner |

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
- **A dedicated credentials file over a password manager.** See above: the
  smallest secret this service can hold is the four logins it uses, and a vault
  session is strictly larger.
- **systemd credentials over a secret store.** Vault, OpenBao and the
  Kubernetes external-secrets machinery solve rotation and multi-tenant access
  across a fleet. Here there is one host and four credentials, and each of them
  adds a server whose availability becomes a new reason the run fails.
  `LoadCredentialEncrypted` needs no daemon, no agent, and no renewal.
- **Our own TOTP over a library.** Eighty lines of RFC 6238, verified against
  the RFC's own vectors, against a dependency that would see every TOTP secret
  we hold. `@offers/totp` takes the clock as a parameter so the vectors can be
  tested at all.

## Plan

- [x] domain: `PendingOffer`, `OfferSurface`, `addOffers`
- [x] `@offers/config`: schema, issuer/code-source codecs, ladder defaults
- [x] `@offers/credentials`: schema, permission-checked read, systemd credential path
- [x] `@offers/totp`: RFC 6238 codes, `otpauth://` parsing
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
- **What happens to a TPM-sealed credential when the host changes?** A firmware
  update or a disk move can change the PCRs `host+tpm2` binds to, and the unit
  then fails to start with a decryption error rather than a bank error.
  Recommendation: keep the plaintext document in your own password manager —
  where it is one item among many rather than the service's standing
  authority — and re-seal after any firmware change. Re-sealing is one command;
  losing the document is four password resets.

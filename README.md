# credit-card-offer-adder

Adds every available **Amex Offer** and **Chase Offer** to your cards, on a
schedule, without you doing anything.

Both issuers hand out targeted statement-credit offers that are worth nothing
until someone clicks "Add to Card" on each tile. There are a few hundred of
them across four accounts, they turn over constantly, and there is no API.
This runs on a server twice a day and clicks all of them.

## How it stays unattended

The hard part is not the clicking, it's the 2FA. Three things make a run need
nobody:

1. **A persistent browser profile per account.** Both banks stop challenging a
   browser they recognize, and the run ticks "remember this device" when it is
   challenged. After the first supervised run, most runs never see a
   challenge at all.
2. **A ladder of one-time-code sources**, automatic ones first: an
   authenticator-app TOTP computed on the spot, then a mailbox polled over
   IMAP, then a push notification you can answer with one tap, then — only for
   attended runs — a terminal prompt.
3. **A sealed credentials file, and nothing else.** The service holds the four
   bank logins and their TOTP secrets — not a password-manager session, not a
   master password. systemd unseals the file from the TPM at start into a
   tmpfs only this unit can read, and drops it when the run ends.

If every automatic source comes up dry, you get a push notification naming
the account and asking for the digits. If you ignore it, that one account is
skipped and the other three still finish.

## Setup

### 1. Prerequisites

On Nix, everything is in the flake — the app, `xvfb`, and a Chromium matched to
the pinned Playwright:

```sh
nix develop                                    # dev shell
nix run github:cprussin/credit-card-offer-adder  # one pass, using your config
```

Otherwise:

```sh
bun install
bunx playwright install chromium     # or your distro's chromium
```

and, on a server, `xvfb`.

### 2. Write the credentials file

Two files, on purpose: `offers.config.json` holds no secrets and can go
anywhere, and `offers.credentials.json` holds nothing but secrets.

```sh
mkdir -p ~/.config/offer-adder
install -m 600 /dev/null ~/.config/offer-adder/offers.credentials.json
$EDITOR ~/.config/offer-adder/offers.credentials.json
```

See [`offers.credentials.example.json`](./offers.credentials.example.json) for
the shape: a `username`/`password` per account id, plus an optional
`totpSecret`, `imap` login, and `ntfyToken`. The app refuses to read the file
if it is readable by anyone but its owner.

Leave it in the clear for now — step 6 seals it once you know it works.

### 3. Make the codes readable by a machine

This is the step that decides whether the thing actually runs unattended.
Pick per account, best first:

- **Authenticator app (Chase).** If the account can be enrolled in
  authenticator-app verification, do that and put the `otpauth://` URI behind
  its QR code into that account's `totpSecret`. Nothing else is needed — put
  `"totp"` first in that account's `codeSources`.
- **Email delivery.** Set the bank to deliver one-time codes to an address you
  can reach over IMAP, and give **each account its own address** (plus
  addressing like `you+connor-amex@example.com` is enough). Sharing one
  mailbox between two people at the same bank risks a run reading the other's
  code.
- **SMS forwarded to email.** If a bank will only text, forward those texts to
  the same mailbox — an iOS Shortcuts automation or an Android SMS-forwarder
  app — and it lands back on the IMAP rung.
- **ntfy.** The fallback: the run pushes "Connor · Amex needs a code" and waits
  for you to publish the digits back to the reply topic from the ntfy app.

Put each mailbox's IMAP login in that account's `imap` block in the
credentials file; the host, port and folder go in the config file.

### 4. Write the config

```sh
cp offers.config.example.json ~/.config/offer-adder/offers.config.json
$EDITOR ~/.config/offer-adder/offers.config.json
```

The file names accounts, mailboxes, and topics — never a secret. See
[`offers.config.example.json`](./offers.config.example.json) for all four
accounts filled in, and
[`packages/config/README.md`](./packages/config/README.md) for every field.

### 5. First run, supervised

Run it once with a visible browser and watch what happens. This is when the
banks challenge you, when the device gets remembered, and when you find out
whether either site has moved a button since this was written.

```sh
OFFERS_CONFIG=~/.config/offer-adder/offers.config.json \
OFFERS_CREDENTIALS=~/.config/offer-adder/offers.credentials.json \
  bun apps/offer-adder/src/main.ts
```

If an adapter cannot find something, it fails with the step that broke
("Amex offers grid never rendered") and leaves a screenshot and an HTML dump
under `artifactDir`. Each adapter keeps every selector it depends on in one
object at the top of its file, so fixing a reskin is a one-line edit — see
[`packages/issuer-amex`](./packages/issuer-amex/README.md).

### 6. Seal the credentials and schedule it

Now that the run works, get the plaintext off the disk:

```sh
systemd-creds encrypt --user --with-key=tpm2+host --name=offers-credentials \
  ~/.config/offer-adder/offers.credentials.json \
  ~/.config/offer-adder/credentials.cred
shred -u ~/.config/offer-adder/offers.credentials.json
```

systemd decrypts that at unit start into `$CREDENTIALS_DIRECTORY` — a tmpfs
private to the service, mode 0400 — and unmounts it when the run ends, so the
secrets never sit on disk in the clear and never appear in `systemctl show`.
Without a TPM, drop `--with-key=tpm2+host` for host-key-only sealing; without
sealing at all, keep the mode-600 plaintext and set `OFFERS_CREDENTIALS` in the
unit instead. [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) covers the agenix
and sops-nix alternatives.

```sh
mkdir -p ~/.config/systemd/user
cp deploy/offer-adder.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now offer-adder.timer
```

The unit runs Chromium under Xvfb rather than headless, because a headless
browser is the easiest thing for a bank to fingerprint, and being
fingerprinted means being challenged on every run. The timer fires twice a
day at a deliberately odd minute with a random delay.

```sh
systemctl --user list-timers offer-adder.timer   # when's the next run
journalctl --user -u offer-adder.service -n 50   # what happened last time
```

On NixOS, use the flake's module instead:

```nix
inputs.offer-adder.url = "github:cprussin/credit-card-offer-adder";

imports = [inputs.offer-adder.nixosModules.default];
services.offer-adder = {
  enable = true;
  credentialFile = "/var/lib/secrets/offer-adder/credentials.cred";
  settings = { /* the same shape as offers.config.json */ };
};
```

[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) covers that in full, along with
host requirements, secrets handling, upgrading, and what to do when a
scheduled run fails.

## What a run does

1. Loads the config and the credentials.
2. For each account, in order, one at a time:
   - builds its code ladder, which fails the account before a browser is ever
     launched if the credentials cannot supply a rung it asked for,
   - opens that account's persistent browser profile,
   - signs in, answering a challenge from the code ladder if there is one,
   - opens the offers page and adds every tile that still has a button,
     paging the grid until it runs out,
   - closes the browser.
3. Pushes a summary: `3 offers added` or
   `1 offer added, 1 account failed`, with a line per account.

One offer that will not add is recorded and the rest continue. One account
that will not log in is recorded and the other three continue. The process
exits non-zero only when an **account** failed, so a red unit in `systemctl`
always means something worth looking at.

## Packages

| Package | What it does |
|---|---|
| [`apps/offer-adder`](./apps/offer-adder/README.md) | The runnable entry point. Wiring only — no decisions. |
| [`packages/offer`](./packages/offer/README.md) | The domain: `PendingOffer`, the `OfferSurface` port, and `addOffers`. |
| [`packages/offer-run`](./packages/offer-run/README.md) | `runAccount` / `runAccounts` and the run report. |
| [`packages/config`](./packages/config/README.md) | `offers.config.json` schema and parsing. |
| [`packages/credentials`](./packages/credentials/README.md) | The credentials document: where it comes from, and its schema. |
| [`packages/totp`](./packages/totp/README.md) | RFC 6238 codes from a stored secret. |
| [`packages/one-time-code`](./packages/one-time-code/README.md) | The `CodeSource` port, the chain, and the totp/ntfy/prompt sources. |
| [`packages/one-time-code-imap`](./packages/one-time-code-imap/README.md) | Reading a code out of a mailbox. |
| [`packages/ntfy`](./packages/ntfy/README.md) | ntfy publish and subscribe. |
| [`packages/notify`](./packages/notify/README.md) | Turning a run report into a notification. |
| [`packages/browser-session`](./packages/browser-session/README.md) | Persistent per-account Chromium profiles and failure artifacts. |
| [`packages/issuer`](./packages/issuer/README.md) | The `IssuerAdapter` port. |
| [`packages/issuer-amex`](./packages/issuer-amex/README.md) | Amex sign-in and offers grid. |
| [`packages/issuer-chase`](./packages/issuer-chase/README.md) | Chase sign-in and offers grid. |
| [`packages/error-message`](./packages/error-message/README.md) | Flattening a thrown value into one reportable line. |
| [`packages/dependency-min-age`](./packages/dependency-min-age/README.md) | Supply-chain guard on dependency freshness. |

Dependencies flow one way: the app depends on everything, `offer-run` depends
on `offer` and `config`, the `issuer-*` packages depend on `issuer` and
`offer`, and `offer` depends on nothing but `error-message`.

## Development

```sh
node_modules/.bin/turbo test         # types, unit tests, lint, dependency checks
node_modules/.bin/turbo fix          # autofix formatting and lint
nix flake check                      # builds the package, which runs the unit tests
```

Read [`AGENTS.md`](./AGENTS.md) before changing anything — it indexes the
guidelines in [`docs/guidelines/`](./docs/guidelines/), which are binding.
[`docs/guidelines/AUTOMATION.md`](./docs/guidelines/AUTOMATION.md) in
particular covers the rules for anything that touches a bank page or a secret.

## Security notes

- Secrets live in exactly one file, which is separate from the config, sealed
  at rest, and read from a per-unit tmpfs. No secret is ever in the config
  file, in argv, in an environment variable, or in a log line.
- The blast radius is four bank logins and one mailbox — not a password
  manager. A compromise of this host cannot reach anything the service was
  never given.
- Failure artifacts are captured only after a failure and only from the offers
  page, never from a login form. They land in a git-ignored directory.
- Browser profiles hold live bank session cookies. `profileDir` is git-ignored
  and belongs on storage you would be comfortable putting a logged-in laptop
  on.
- The adapters authenticate, navigate, and click enrollment buttons. They
  never submit any other form.

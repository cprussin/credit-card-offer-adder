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
   authenticator-app TOTP straight out of the vault, then a mailbox polled
   over IMAP, then a push notification you can answer with one tap, then —
   only for attended runs — a terminal prompt.
3. **Credentials from Vaultwarden**, via the Bitwarden CLI. Nothing is
   configured with a password; the config file only names vault items.

If every automatic source comes up dry, you get a push notification naming
the account and asking for the digits. If you ignore it, that one account is
skipped and the other three still finish.

## Setup

### 1. Prerequisites

On Nix, everything is in the flake — the app, `bw`, `xvfb`, and a Chromium
matched to the pinned Playwright:

```sh
nix develop                                    # dev shell
nix run github:cprussin/credit-card-offer-adder  # one pass, using your config
```

Otherwise:

```sh
bun install
bunx playwright install chromium     # or your distro's chromium
```

and you need the Bitwarden CLI (`bw`) and, on a server, `xvfb`.

### 2. Point `bw` at your Vaultwarden and log in once

```sh
bw config server https://vault.example.com
bw login                       # or: bw login --apikey, with BW_CLIENTID/BW_CLIENTSECRET
```

The service authenticates with an unlocked session rather than a master
password, so provision one and keep it out of the repo:

```sh
mkdir -p ~/.config/offer-adder
install -m 600 /dev/null ~/.config/offer-adder/env
printf 'BW_SESSION=%s\n' "$(bw unlock --raw)" > ~/.config/offer-adder/env
```

Set `BW_PASSWORD` there instead if you would rather the service be able to
unlock itself; it is one fewer thing to redo, at the cost of a master password
on disk.

### 3. Make the codes readable by a machine

This is the step that decides whether the thing actually runs unattended.
Pick per account, best first:

- **Authenticator app (Chase).** If the account can be enrolled in
  authenticator-app verification, do that and store the TOTP secret on the
  same Bitwarden item as the password. Nothing else is needed — put `"totp"`
  first in that account's `codeSources`.
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

Store each mailbox's IMAP username and password as its own Bitwarden login
item, and name that item in the account's `imap.vaultItem`.

### 4. Write the config

```sh
cp offers.config.example.json ~/.config/offer-adder/offers.config.json
$EDITOR ~/.config/offer-adder/offers.config.json
```

The file names vault items, mailboxes, and topics — never a secret. See
[`offers.config.example.json`](./offers.config.example.json) for all four
accounts filled in, and
[`packages/config/README.md`](./packages/config/README.md) for every field.

### 5. First run, supervised

Run it once with a visible browser and watch what happens. This is when the
banks challenge you, when the device gets remembered, and when you find out
whether either site has moved a button since this was written.

```sh
OFFERS_CONFIG=~/.config/offer-adder/offers.config.json \
  bun apps/offer-adder/src/main.ts
```

If an adapter cannot find something, it fails with the step that broke
("Amex offers grid never rendered") and leaves a screenshot and an HTML dump
under `artifactDir`. Each adapter keeps every selector it depends on in one
object at the top of its file, so fixing a reskin is a one-line edit — see
[`packages/issuer-amex`](./packages/issuer-amex/README.md).

### 6. Schedule it

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
  environmentFile = config.age.secrets.offer-adder-bw-session.path;
  settings = { /* the same shape as offers.config.json */ };
};
```

[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) covers that in full, along with
host requirements, secrets handling, upgrading, and what to do when a
scheduled run fails.

## What a run does

1. Loads the config and unlocks the vault once.
2. For each account, in order, one at a time:
   - opens that account's persistent browser profile,
   - pulls its credentials from the vault,
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
| [`packages/vault`](./packages/vault/README.md) | Bitwarden CLI as a credential source. |
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

- No secret is ever in the config file, in argv, or in a log line. The master
  password reaches `bw` through its environment; failure messages name the
  subcommand but not its operands.
- Failure artifacts are captured only after a failure and only from the offers
  page, never from a login form. They land in a git-ignored directory.
- Browser profiles hold live bank session cookies. `profileDir` is git-ignored
  and belongs on storage you would be comfortable putting a logged-in laptop
  on.
- The adapters authenticate, navigate, and click enrollment buttons. They
  never submit any other form.

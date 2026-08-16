# Deployment

How to get this running on a server so it adds offers on its own.

## What you are actually deploying

A oneshot process and a timer. There is no daemon, no port, no database. One
invocation of `apps/offer-adder/src/main.ts` walks every configured account and
exits.

Two directories are the whole of its state:

| Directory | Contents | If you lose it |
|---|---|---|
| `profileDir` | One Chromium profile per account: cookies, local storage, the device token each bank sets when you tell it to remember the browser. | Every account gets challenged on the next run, and each one needs a code. Recoverable, but it costs you a supervised run. |
| `artifactDir` | Screenshots and HTML dumps written after a failure. | Nothing. Diagnostics only. |

`profileDir` holds live bank sessions. Put it on the same storage you would
trust with a logged-in laptop, and do not sync it anywhere.

## Before any host-specific setup

These are the same on every platform, and none of them can be skipped.

1. **Vaultwarden reachable and `bw` logged in.** `bw config server …` then
   `bw login`. See [README §2](../README.md#2-point-bw-at-your-vaultwarden-and-log-in-once).
2. **Codes readable by a machine.** Per-account mailbox address, or an
   authenticator app for Chase. This is the step that decides whether the
   deploy is actually unattended — [README §3](../README.md#3-make-the-codes-readable-by-a-machine).
3. **A config file**, from `offers.config.example.json`. It names vault items
   and never holds a secret. Field reference:
   [`packages/config/README.md`](../packages/config/README.md).
4. **One supervised run on a machine with a display.** The banks challenge you,
   the devices get remembered, and you find out whether either site has moved a
   button. Do this *before* wiring up a timer — see
   [README §5](../README.md#5-first-run-supervised).

Step 4 is best done on the server itself over X forwarding or VNC, because the
profile that gets trusted is the one on the machine that will do the running.
Copying a profile directory from your laptop mostly works, but the banks
fingerprint more than cookies, so expect one more challenge after a move.

## Host requirements

| Need | Why |
|---|---|
| `bun` ≥ 1.3.11 | The runtime. There is no build step; it runs the TypeScript directly. |
| Chromium | Via Playwright's browser bundle, or a system Chromium Playwright can find. |
| `bitwarden-cli` | `bw` must be on the service's `PATH`. |
| `xvfb` | Only if the host has no display. Prefer this over headless mode — see below. |

Outbound HTTPS to `americanexpress.com`, `chase.com`, your Vaultwarden, your
IMAP host, and your ntfy server. Nothing inbound.

### Do not run headless

`"headless": false` is the default in the config and should stay that way. A
headless Chromium is the easiest thing for a bank to fingerprint, and being
fingerprinted means being challenged on every single run — which is exactly the
thing this design cannot absorb. On a headless host, run the real browser under
a virtual display instead.

## Deploying with plain systemd

The units in [`deploy/`](../deploy/) are user units, which is the simplest
option on a machine you already log into.

```sh
mkdir -p ~/.config/offer-adder ~/.config/systemd/user
cp offers.config.example.json ~/.config/offer-adder/offers.config.json
$EDITOR ~/.config/offer-adder/offers.config.json

install -m 600 /dev/null ~/.config/offer-adder/env
printf 'BW_SESSION=%s\n' "$(bw unlock --raw)" > ~/.config/offer-adder/env

cp deploy/offer-adder.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now offer-adder.timer
```

The unit assumes a checkout at `~/src/credit-card-offer-adder` and `bun` at
`~/.bun/bin/bun`; adjust `WorkingDirectory` and `ExecStart` if yours differ.

User units only run while the user has a session unless lingering is enabled:

```sh
loginctl enable-linger "$USER"
```

Verify:

```sh
systemctl --user list-timers offer-adder.timer
systemctl --user start offer-adder.service    # run it now
journalctl --user -u offer-adder.service -n 50
```

## Deploying on NixOS

This is the better target: the runtime, Chromium, and `bw` all get pinned
together, and the timer is declarative.

### The flake

The repo is a flake, so consuming it is an input plus a module import — nothing
to vendor.

| Output | What it is |
|---|---|
| `packages.<system>.default` | The wrapped app. `nix run github:cprussin/credit-card-offer-adder` runs one pass. |
| `nixosModules.default` | `services.offer-adder`, defined in [`nix/module.nix`](../nix/module.nix). |
| `overlays.default` | Puts `offer-adder` into a package set. |
| `devShells.default` | bun, biome, bun2nix, `bw`, and a Playwright-matched Chromium. |
| `checks.default` | The package, whose check phase runs `bun test`. |

The package derivation is [`nix/offer-adder.nix`](../nix/offer-adder.nix). It
follows the same `bun2nix` + IFD approach as `argo-browser`: every dependency
is fetched as its own content-addressed derivation with a hash read from
`bun.lock`, so there is no node_modules fixed-output hash to keep in sync, and
`bun.generated.nix` is produced at build time rather than committed. Unlike
`argo-browser` there is no build step — bun runs the TypeScript directly — so
the derivation only resolves dependencies offline, runs the unit tests, and
wraps an entry point with `bw`, `xvfb-run`, and a Chromium on its path.

Because it uses IFD, a consumer evaluating this flake needs
`allow-import-from-derivation` (the default) and will build `bun2nix` once.

**Playwright is pinned to nixpkgs' Chromium, exactly.** Playwright will not
launch a browser bundle whose revision does not match the library, so the root
`package.json` catalog pins `playwright` to a bare version — no caret — equal
to `pkgs.playwright-driver.version`. A caret would let `bun update` drift onto
a release whose Chromium revision nixpkgs does not ship, so the two move
together or not at all:

```sh
nix eval --raw nixpkgs#playwright-driver.version   # what to pin the catalog to
```

A mismatch surfaces at the first `launchPersistentContext`, not at startup:

```
Executable doesn't exist at …/playwright-browsers/chromium-1234/chrome-linux64/chrome
```

### The NixOS module

[`nix/module.nix`](../nix/module.nix) defines `services.offer-adder`:

| Option | Default | Notes |
|---|---|---|
| `enable` | `false` | |
| `settings` | — | The `offers.config.json` contents, rendered into the store. Safe there: the schema only ever takes vault item *names*. `profileDir` and `artifactDir` default under `/var/lib/offer-adder`. |
| `environmentFile` | — | Holds `BW_SESSION=…`. Must **not** be a store path. |
| `package` | this flake's | |
| `user` | `offer-adder` | Its state directory holds the browser profiles. |
| `onCalendar` | `*-*-* 03:17,15:17:00` | Plus a 45-minute random delay. |

It creates the user, a `oneshot` service that runs the app under `xvfb-run`,
and a `Persistent` timer.

### Using it

```nix
{
  inputs.offer-adder.url = "github:cprussin/credit-card-offer-adder";

  # in your host configuration:
  imports = [inputs.offer-adder.nixosModules.default];

  services.offer-adder = {
    enable = true;
    environmentFile = config.age.secrets.offer-adder-bw-session.path;
    settings = {
      # profileDir and artifactDir default under /var/lib/offer-adder.
      headless = false;
      ntfy = {
        server = "https://ntfy.example.com";
        alertTopic = "offers-alerts";
        replyTopic = "offers-codes";
        tokenVaultItem = "ntfy access token";
      };
      accounts = [
        {
          id = "connor-amex";
          label = "Connor · Amex";
          issuer = "amex";
          vaultItem = "American Express";
          senderHints = ["americanexpress" "american express"];
          codeSources = ["imap" "ntfy"];
          imap = {
            host = "imap.fastmail.com";
            vaultItem = "offers mailbox — connor";
          };
        }
        # …the other three
      ];
    };
  };
}
```

`settings` becomes a store path, so keep it free of secrets — which the schema
already enforces by only ever taking vault item *names*.

### Secrets on NixOS

`BW_SESSION` must not go through `settings`, `environment`, or any other
route that lands in `/nix/store` — the store is world-readable. Use
[agenix](https://github.com/ryantm/agenix) or
[sops-nix](https://github.com/Mic92/sops-nix) and point `environmentFile` at
the decrypted path:

```nix
age.secrets.offer-adder-bw-session = {
  file = ./secrets/offer-adder-bw-session.age;
  owner = "offer-adder";
};
```

The file's contents are one line:

```
BW_SESSION=<output of bw unlock --raw>
```

Sessions do not expire on their own, but a Vaultwarden master-password change
invalidates them and every run will start failing. Re-encrypt a fresh one when
that happens. Putting `BW_PASSWORD` there instead lets the service unlock
itself and removes that chore, at the cost of a master password on the host.

### Running the first supervised run under Nix

The service user's profile directory is what needs to get trusted, so do the
first run as that user with a display attached:

```sh
sudo -u offer-adder \
  OFFERS_CONFIG=/path/to/offers.config.json \
  BW_SESSION="$(bw unlock --raw)" \
  nix run github:cprussin/credit-card-offer-adder
```

over an X-forwarded SSH session (`ssh -X`), so you can see and answer the
challenges. After that the timer's Xvfb runs reuse the same trusted profile.

### Chromium sandboxing

Playwright's Chromium uses unprivileged user namespaces. NixOS allows these by
default (`security.unprivilegedUsernsClone`); if your host has hardened that
off, Chromium will fail to start. Re-enable it rather than adding
`--no-sandbox` — running a browser against your bank with the sandbox disabled
is not a trade worth making.

## Operating it

```sh
systemctl list-timers offer-adder.timer     # next run
systemctl start offer-adder.service         # run now
journalctl -u offer-adder.service -n 50     # last run's summary
```

Every run prints its summary to the journal, whether or not ntfy is
configured — the same text that goes to your phone.

**Exit codes.** Non-zero means an *account* could not be run: it never signed
in, or its offers page was unusable. Individual offers that refused to add do
not fail the unit, because a bank routinely declines one tile and a timer that
goes red every night is a timer nobody reads.

**When a run fails.** The error names the step ("Amex offers grid never
rendered", "could not obtain a one-time code for Connor · Amex: …"), and
anything that failed on the offers page leaves a screenshot and an HTML dump
under `artifactDir/<account-id>/`. A grid failure almost always means the bank
reskinned; the fix is one edit to the selector table at the top of the
adapter — see
[`packages/issuer-amex/README.md`](../packages/issuer-amex/README.md).

**When a sign-in fails.** Read the reason: it lists every code source and why
each came up empty. "nothing arrived within 120s" against a mailbox usually
means the bank switched that account back to SMS delivery.

**Upgrading.** Nothing to migrate. Pull, `nixos-rebuild switch` (or restart the
user unit), and the next firing uses the new code. The profile directories are
untouched by an upgrade, so no new challenges.

**Moving to a new host.** Copy `profileDir` across and expect one challenge per
account anyway — the banks fingerprint more than cookies. Do not copy
`artifactDir`.

# Deployment

How to get this running on a server so it adds offers on its own.

## What you are actually deploying

A oneshot process and a timer. There is no daemon, no port, no database. One
invocation of `apps/offer-adder/src/main.ts` walks every configured account and
exits.

Two files go in, and two directories are the whole of its state.

| Input | Secret? | Where it can live |
|---|---|---|
| `offers.config.json` | No — account ids, labels, issuers, ladder order, IMAP host and folder. | Anywhere, including `/nix/store`. |
| the credentials document | Yes — bank logins, TOTP secrets, mailbox logins, ntfy token. | Sealed at rest; unsealed into a per-unit tmpfs. Never the store. |

The split is deliberate and is the main security property of the deployment:
everything that can be declarative is, and the one thing that cannot be is
small, single-purpose, and separately protected. See
[secrets](#secrets), below.

The state:

| Directory | Contents | If you lose it |
|---|---|---|
| `profileDir` | One Chromium profile per account: cookies, local storage, the device token each bank sets when you tell it to remember the browser. | Every account gets challenged on the next run, and each one needs a code. Recoverable, but it costs you a supervised run. |
| `artifactDir` | Screenshots and HTML dumps written after a failure. | Nothing. Diagnostics only. |

`profileDir` holds live bank sessions. Put it on the same storage you would
trust with a logged-in laptop, and do not sync it anywhere.

## Before any host-specific setup

These are the same on every platform, and none of them can be skipped.

1. **A credentials document**, from `offers.credentials.example.json`: a
   username and password per account id, plus the TOTP secret and mailbox
   login for the accounts that need them. See
   [README §2](../README.md#2-write-the-credentials-file) and
   [`packages/credentials/README.md`](../packages/credentials/README.md).
2. **Codes readable by a machine.** Per-account mailbox address, or an
   authenticator app for Chase. This is the step that decides whether the
   deploy is actually unattended — [README §3](../README.md#3-make-the-codes-readable-by-a-machine).
3. **A config file**, from `offers.config.example.json`. It holds no secrets.
   Field reference:
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
| `xvfb` | Only if the host has no display. Prefer this over headless mode — see below. |
| systemd ≥ 250 | For `LoadCredentialEncrypted`. Optional but strongly preferred — see [secrets](#secrets). |
| A TPM 2.0 | Optional. Seals the credentials to this machine, so a stolen disk is not a stolen bank login. |

Outbound HTTPS to `americanexpress.com`, `chase.com`, your IMAP host, and your
ntfy server. Nothing inbound.

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

install -m 600 /dev/null ~/.config/offer-adder/offers.credentials.json
$EDITOR ~/.config/offer-adder/offers.credentials.json
systemd-creds encrypt --user --with-key=tpm2+host --name=offers-credentials \
  ~/.config/offer-adder/offers.credentials.json \
  ~/.config/offer-adder/credentials.cred
shred -u ~/.config/offer-adder/offers.credentials.json

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

## Secrets

The service needs four bank logins, their TOTP secrets, one mailbox login, and
optionally an ntfy token. That is the entire secret surface, and it is
deliberately not a password-manager session: a session or master password would
give a compromise of this host everything in the vault, while this gives it
only what the service was always going to use.

The threat this actually defends against is a stolen or backed-up disk, plus
any other local user on the box. It does not defend against root on a running
machine — nothing that has to hand a plaintext password to a browser can.

### The mechanism: systemd credentials

`LoadCredentialEncrypted=offers-credentials:/path/to/credentials.cred` is what
both the shipped unit and the NixOS module use.

```sh
systemd-creds encrypt --with-key=tpm2+host --name=offers-credentials \
  credentials.json /var/lib/secrets/offer-adder/credentials.cred
shred -u credentials.json
```

What that buys, in order of importance:

- **Sealed to the machine.** `tpm2+host` binds the ciphertext to this host's
  TPM. The file is useless on any other machine, so a disk image or a backup
  is not a set of bank logins.
- **Never on disk in the clear.** systemd decrypts at unit start into
  `$CREDENTIALS_DIRECTORY`, a tmpfs mounted for this unit alone, mode 0400,
  owned by the service user, unmounted when the run exits.
- **Not in the process environment.** Unlike `EnvironmentFile`, nothing lands
  in `/proc/<pid>/environ`, in `systemctl show`, or in a crash dump. The app
  reads a file and holds the values in memory.
- **No moving parts.** No agent, no unseal step, no daemon to keep running,
  nothing to renew. `--name` binds the ciphertext to the credential name too,
  so a blob cannot be replayed into a different unit.

`--with-key=host` (no TPM) still keeps the plaintext off the disk and out of
the environment, but the key is a root-readable file rather than sealed
hardware. Drop `+host` from `tpm2+host` only if you need the credential to
survive a reinstall.

### Alternatives, and why not

| Option | Verdict |
|---|---|
| **agenix / sops-nix** | A fine substitute — decrypts to a path, which you point `credentialFile` at. Use it if you already run one, and if your fleet needs the secret to be reproducible from a git-committed ciphertext. It writes plaintext to a persistent `/run` path rather than a per-unit tmpfs, and adds a host key to manage. |
| **Vault / OpenBao, Infisical, ESO** | These solve rotation, audit and multi-tenant access across a cluster. Here there is one host, four credentials, and nothing to rotate on a schedule — they would add a server whose own availability becomes a reason the run fails. |
| **Kubernetes `Secret`** | Base64 in etcd, mounted into a pod. Weaker than the above unless you also run encryption-at-rest and a CSI driver, and this workload is a twice-daily oneshot with a persistent browser profile — a poor fit for a pod either way. |
| **A password manager (the previous design)** | Rejected: it made the service's blast radius the whole vault, and it needed either a long-lived session that breaks on a master-password change or the master password itself on disk. |

The through-line: the ConfigMap/Secret split is the part of the Kubernetes
model worth keeping. The secret *store* is not, at this size.

## Deploying on NixOS

This is the better target: the runtime and Chromium get pinned together, the
timer is declarative, and the non-secret half of the configuration goes in the
store where it belongs.

### The flake

The repo is a flake, so consuming it is an input plus a module import — nothing
to vendor.

| Output | What it is |
|---|---|
| `packages.<system>.default` | The wrapped app. `nix run github:cprussin/credit-card-offer-adder` runs one pass. |
| `nixosModules.default` | `services.offer-adder`, defined in [`nix/module.nix`](../nix/module.nix). |
| `overlays.default` | Puts `offer-adder` into a package set. |
| `devShells.default` | bun, biome, bun2nix, and a Playwright-matched Chromium. |
| `checks.default` | The package, whose check phase runs `bun test`. |

The package derivation is [`nix/offer-adder.nix`](../nix/offer-adder.nix). It
follows the same `bun2nix` + IFD approach as `argo-browser`: every dependency
is fetched as its own content-addressed derivation with a hash read from
`bun.lock`, so there is no node_modules fixed-output hash to keep in sync, and
`bun.generated.nix` is produced at build time rather than committed. Unlike
`argo-browser` there is no build step — bun runs the TypeScript directly — so
the derivation only resolves dependencies offline, runs the unit tests, and
wraps an entry point with `xvfb-run` and a Chromium on its path.

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
| `settings` | — | The `offers.config.json` contents, rendered into the store. Safe there: the schema holds no secrets at all. `profileDir` and `artifactDir` default under `/var/lib/offer-adder`. |
| `credentialFile` | — | The credentials document. Must **not** be a store path; the module asserts it. |
| `sealed` | `true` | Whether `credentialFile` is `systemd-creds` output. `false` when agenix or sops-nix decrypts it for you. |
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
    credentialFile = "/var/lib/secrets/offer-adder/credentials.cred";
    settings = {
      # profileDir and artifactDir default under /var/lib/offer-adder.
      headless = false;
      ntfy = {
        server = "https://ntfy.example.com";
        alertTopic = "offers-alerts";
        replyTopic = "offers-codes";
      };
      accounts = [
        {
          id = "connor-amex";
          label = "Connor · Amex";
          issuer = "amex";
          senderHints = ["americanexpress" "american express"];
          codeSources = ["imap" "ntfy"];
          imap.host = "imap.fastmail.com";
        }
        # …the other three
      ];
    };
  };
}
```

`settings` becomes a store path, which is world-readable — and is fine, because
the schema has no field that can hold a secret. Everything that can is in
`credentialFile`.

### Secrets on NixOS

Seal the credentials on the host itself, since `tpm2` binds to that host's TPM:

```sh
sudo install -d -m 700 /var/lib/secrets/offer-adder
sudo systemd-creds encrypt --with-key=tpm2+host --name=offers-credentials \
  credentials.json /var/lib/secrets/offer-adder/credentials.cred
shred -u credentials.json
```

The result is not a store path, so it survives `nixos-rebuild` untouched and
the module's assertion passes. The module hands it to systemd with
`LoadCredentialEncrypted`; nothing else in the unit references it.

If you would rather the ciphertext be reproducible from git — a fleet, or a
host you rebuild from scratch — use
[agenix](https://github.com/ryantm/agenix) or
[sops-nix](https://github.com/Mic92/sops-nix) and point `credentialFile` at the
decrypted path instead:

```nix
age.secrets.offer-adder-credentials = {
  file = ./secrets/offer-adder-credentials.age;
  owner = "offer-adder";
  mode = "0400";
};

services.offer-adder = {
  credentialFile = config.age.secrets.offer-adder-credentials.path;
  sealed = false;   # agenix already decrypted it; use LoadCredential
};
```

`sealed = false` is required: `LoadCredentialEncrypted` only accepts
`systemd-creds` output, and agenix hands you the plaintext document. systemd
still stages it in the same per-unit tmpfs, so it stays out of the environment
either way — what you give up is the TPM binding, and what you gain is a secret
recoverable without the original machine. Pick based on whether losing the host
should mean re-entering four bank passwords.

### Running the first supervised run under Nix

The service user's profile directory is what needs to get trusted, so do the
first run as that user with a display attached:

```sh
sudo -u offer-adder \
  OFFERS_CONFIG=/path/to/offers.config.json \
  OFFERS_CREDENTIALS=/path/to/offers.credentials.json \
  nix run github:cprussin/credit-card-offer-adder
```

Do that before sealing, while the plaintext document still exists; `shred` it
once the run works.

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

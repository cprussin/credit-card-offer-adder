# @offers/vault

Vaultwarden as this system's only source of secrets, through the Bitwarden CLI.

## What it does

`bitwardenVault` gives you a [`Vault`](./src/vault.ts): passwords and TOTPs by
item name or id. It talks to Vaultwarden the same way it would talk to
Bitwarden — `bw` is the same client either way, pointed at a self-hosted server
with `bw config server`.

The security properties are the point:

- **The master password never reaches argv.** It goes to `bw` through
  `BW_PASSWORD` with `--passwordenv`, so it is not visible in `ps`.
- **A failure message names the subcommand, not its operands** — the argv of a
  failing `unlock` would otherwise be a fine place for a password to leak into
  a log.
- **One unlock per run.** The unlock is lazy and memoized, so four accounts
  share a single one, and a run that never needs a credential never unlocks.

Prefer handing it a `BW_SESSION`: the unlock then happens once at provisioning
time and no master password sits in the service's environment at all.

## Usage

```ts
import { bitwardenVault } from "@offers/vault/bitwarden-vault";

const vault = bitwardenVault({
  masterPassword: Bun.env.BW_PASSWORD,
  session: Bun.env.BW_SESSION,
});

const { username, password } = await vault.credentials("American Express");
const code = await vault.totp("Chase");
```

## Modules

- [`vault`](./src/vault.ts) — the port everything else depends on.
- [`bitwarden-vault`](./src/bitwarden-vault.ts) — the `bw` implementation.
- [`vault-item`](./src/vault-item.ts) — parsing `bw get item` output.
- [`run-command`](./src/run-command.ts) — the injectable command runner.
- [`spawn-bw`](./src/spawn-bw.ts) — the real one.

## Testing

```sh
bun run --filter @offers/vault test:unit
bun run --filter @offers/vault test:types
```

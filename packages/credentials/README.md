# @offers/credentials

Read and validate the credentials document — the one file in this system that
holds secrets.

Everything else is deliberately kept out of it: account ids, labels, issuers,
IMAP hosts and code-source order live in `offers.config.json`, which is
non-secret and can go in the Nix store. This split is the point. It means the
thing you have to protect is small, has one shape, and is the only input that
ever needs sealing.

## The file

```jsonc
{
  "ntfyToken": "tk_…",              // optional; only for protected ntfy topics
  "accounts": {
    "connor-amex": {                 // keyed by the config's account id
      "username": "connor",
      "password": "…",
      "totpSecret": "otpauth://totp/…?secret=JBSWY…",  // optional; bare base32 also works
      "imap": {                      // optional; required if the ladder uses imap
        "user": "offers@example.com",
        "password": "…app-password…"
      }
    }
  }
}
```

An account with no entry here is a hard failure at startup, not a skipped
account — see [`credentials.ts`](./src/credentials.ts).

## How it is delivered

In order of preference:

1. **`$CREDENTIALS_DIRECTORY/offers-credentials`** — systemd's
   `LoadCredentialEncrypted`, with the file sealed by
   `systemd-creds encrypt --with-key=host+tpm2`. The plaintext exists only in a
   per-unit tmpfs, mode 0400, for the life of the run. This is what the NixOS
   module and the shipped unit use.
2. **`$OFFERS_CREDENTIALS`** — a plaintext path, for an attended run on a
   laptop. [`secret-file`](./src/secret-file.ts) refuses to read it if it is
   readable by anyone but its owner, so a stray `chmod 644` fails the run
   rather than quietly widening the blast radius.

The permission check applies to whichever file this package actually opens. On
the systemd path that is the staged copy, which systemd already makes 0400 —
so if another tool decrypts the source file for you (agenix, sops-nix), its
mode is yours to get right; nothing here can see it.

Neither path ever accepts a secret on a command line or in an environment
variable, and nothing in this package logs the values it parses.

## Modules

- [`credentials-path`](./src/credentials-path.ts) — pick between the two above.
- [`secret-file`](./src/secret-file.ts) — read it, refusing loose permissions.
- [`load-credentials`](./src/load-credentials.ts) — read, parse, validate.
- [`credentials`](./src/credentials.ts) — the schema and the per-account
  lookups.

## Testing

```sh
bun run --filter @offers/credentials test:unit
bun run --filter @offers/credentials test:types
```

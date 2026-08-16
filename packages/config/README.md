# @offers/config

Parse and validate `offers.config.json`.

The config file names vault items, mailboxes, and topics. It never contains a
secret — every credential is fetched from the vault at run time.

## The file

```jsonc
{
  "profileDir": "~/.local/state/offer-adder/profiles",  // durable! see below
  "artifactDir": "~/.local/state/offer-adder/artifacts",
  "headless": false,                                    // run under Xvfb instead
  "ntfy": {
    "server": "https://ntfy.example.com",
    "alertTopic": "offers-alerts",   // run summaries and requests for a code
    "replyTopic": "offers-codes",    // where you publish a code back
    "tokenVaultItem": "ntfy access token"   // optional, for a protected topic
  },
  "accounts": [
    {
      "id": "connor-amex",           // names the browser profile directory
      "label": "Connor · Amex",      // shown in notifications
      "issuer": "amex",              // "amex" | "chase"
      "vaultItem": "American Express",
      "senderHints": ["americanexpress"],   // identifies the issuer's messages
      "codeSources": ["imap", "ntfy"],      // optional; see below
      "imap": {
        "host": "imap.fastmail.com",
        "port": 993,                 // default
        "secure": true,              // default
        "folder": "INBOX",           // default
        "vaultItem": "offers mailbox — connor"
      }
    }
  ]
}
```

`profileDir` must survive reboots. It holds the cookies and device tokens that
stop the banks challenging every login, which is the whole basis of running
unattended.

`codeSources` defaults to the automatic sources this account is equipped for:
`["totp", "imap", "ntfy"]` when an `imap` block is present, `["totp", "ntfy"]`
when it is not. `"prompt"` is never in the default, because the default has to
work on a server.

## What it rejects

Loudly, before a browser is ever launched: an unknown issuer, an empty ladder,
a ladder that asks for `imap` with no mailbox configured, duplicate account ids
(they would share a browser profile), or no accounts at all.

## Modules

- [`load-config`](./src/load-config.ts) — read, parse, resolve `~`.
- [`config-schema`](./src/config-schema.ts) — the whole file.
- [`account`](./src/account.ts) — one account, and the wire-string codecs.
- [`code-source-kind`](./src/code-source-kind.ts) — the ladder rungs.
- [`expand-home`](./src/expand-home.ts) — `~` resolution.

## Testing

```sh
bun run --filter @offers/config test:unit
bun run --filter @offers/config test:types
```

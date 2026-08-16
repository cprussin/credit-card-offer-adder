# @offers/one-time-code

Getting the one-time code a bank asks for, preferably without a human.

## What it does

Defines the [`CodeSource`](./src/code-source.ts) port and chains
implementations of it cheapest-first. "I can't get one" is an ordinary
outcome — a `Result`, not an exception — so the chain moves past it.

| Source | Human cost | When it applies |
|---|---|---|
| [`totp`](./src/totp-code-source.ts) | none | the account is enrolled in an authenticator app and its `totpSecret` is in the credentials document |
| `imap` (in [`@offers/one-time-code-imap`](../one-time-code-imap/README.md)) | none | the bank delivers to a mailbox we can poll |
| [`ntfy`](./src/ntfy-code-source.ts) | one tap | the bank insists on SMS: push a request, someone publishes the digits back |
| [`prompt`](./src/prompt-code-source.ts) | full attention | attended runs; fails immediately on a server |

When nothing produces a code, the chain's error names every source and why it
came up empty. That message is the only clue you get about a run that stalled
at 3am.

## Telling this code from the last one

[`selectCode`](./src/select-code.ts) is the pure core the delivery-channel
sources share. A message counts only if it arrived after the login asked for a
code (with a minute of clock slack, since mail servers disagree about the
time) and matches the account's sender hints. Six digits minimum, so a card's
last four is never mistaken for a code.

## Usage

```ts
import { chainCodeSources } from "@offers/one-time-code/chain-code-sources";
import { requestCodeWith } from "@offers/one-time-code/request-code";
import { totpCodeSource } from "@offers/one-time-code/totp-code-source";

const source = chainCodeSources([totpCodeSource(getTotp), mailboxSource]);
const requestCode = requestCodeWith(source, { accountLabel, senderHints });
```

`requestCodeWith` adapts a `CodeSource` into the plain callback an issuer
adapter takes, stamping the request when the bank actually asks rather than
when the run started.

## Testing

```sh
bun run --filter @offers/one-time-code test:unit
bun run --filter @offers/one-time-code test:types
```

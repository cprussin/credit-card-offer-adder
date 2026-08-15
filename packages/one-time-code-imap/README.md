# @offers/one-time-code-imap

Read the bank's one-time code out of a mailbox. This is the source that makes
unattended running possible.

Both issuers can deliver a code to email, and a carrier rule or phone
automation that forwards the SMS to the same mailbox brings the SMS-only case
here too — so in the steady state nobody has to be awake for a run.

## What it does

`imapCodeSource` polls until the code shows up or the budget runs out. Which
message carries the code is
[`@offers/one-time-code/select-code`](../one-time-code/README.md)'s decision;
this package owns the schedule and the IMAP connection.

Each poll is its own login (default every 10s, giving up after two minutes),
which is slower than holding a connection open and much less code to get
wrong. `now` and `sleep` are injected, so the schedule is unit-tested without
real elapsed time.

Give **each account its own mailbox address** — plus addressing is enough.
Two people at the same bank sharing one mailbox is the one situation
`selectCode` cannot disambiguate.

## Usage

```ts
import { imapCodeSource } from "@offers/one-time-code-imap/imap-code-source";
import { imapMailbox } from "@offers/one-time-code-imap/imap-mailbox";

const source = imapCodeSource({
  mailbox: imapMailbox({ host, port, secure, folder, user, password }),
});
```

## Modules

- [`imap-code-source`](./src/imap-code-source.ts) — the polling schedule.
- [`imap-mailbox`](./src/imap-mailbox.ts) — `imapflow` + `mailparser` glue and
  the `Mailbox` port.

`imap-mailbox` is deliberately decision-free glue over two third-party APIs and
is not unit-tested; see /docs/guidelines/TESTING.md.

## Testing

```sh
bun run --filter @offers/one-time-code-imap test:unit
bun run --filter @offers/one-time-code-imap test:types
```

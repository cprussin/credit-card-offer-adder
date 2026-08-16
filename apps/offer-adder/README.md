# @offers/offer-adder

The runnable entry point. One invocation is one complete pass over every
configured account.

```sh
OFFERS_CONFIG=~/.config/offer-adder/offers.config.json bun src/main.ts
```

## What it is

Wiring, and almost nothing else. The run loop is
[`@offers/offer-run`](../../packages/offer-run/README.md), the wording of the
notification is [`@offers/notify`](../../packages/notify/README.md), the code
ladder is [`./src/build-code-source.ts`](./src/build-code-source.ts). This is
where they are handed their real implementations.

## Environment

| Variable | Purpose |
|---|---|
| `OFFERS_CONFIG` | Path to the config file. Defaults to `offers.config.json` in the working directory. |
| `BW_SESSION` | An already-unlocked Bitwarden session. Preferred on a server. |
| `BW_PASSWORD` | Master password, used to unlock when there is no session. |

## Exit code

Non-zero when an **account** could not be run. Individual offers that refused
to add do not fail the process — a bank routinely declines one tile, and a
timer that goes red every night is a timer nobody reads.

## Testing

```sh
bun run --filter @offers/offer-adder test:unit
bun run --filter @offers/offer-adder test:types
```

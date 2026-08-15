# @offers/ntfy

An [ntfy](https://ntfy.sh) client: publish, and subscribe to a topic's stream.

ntfy is how an unattended run reaches a phone. It pushes each run's outcome,
and when a bank insists on a code no automatic source can supply, it is also
the channel someone answers on by publishing the digits back to a topic.

## What it does

- `publish` posts a titled message to a topic, with a bearer token when the
  topic is protected. A rejection from the server throws.
- `subscribe` streams a topic as an async iterable, reassembling
  newline-delimited JSON across chunk boundaries and skipping the connection
  bookkeeping (`open`, keepalives). A line that is not an ntfy event at all —
  an HTML error page from a proxy — throws, because treating it as "no
  messages" would turn a broken server into an eternal wait.

A generator rather than a callback: the caller waits on a live connection for
as long as it takes someone to type a code, and must be able to stop consuming
the moment one arrives.

## Usage

```ts
import { ntfyClient } from "@offers/ntfy/ntfy-client";

const client = ntfyClient({ server: "https://ntfy.example.com", token });
await client.publish({ topic: "offers-alerts", title: "Offer run", message: "3 offers added" });

for await (const message of client.subscribe("offers-codes", { since, signal })) {
  // …
}
```

## Testing

```sh
bun run --filter @offers/ntfy test:unit
bun run --filter @offers/ntfy test:types
```

# @offers/notify

Turn a run report into the notification someone reads on a phone.

## What it does

`formatRunReport` writes the whole verdict into the **title**, because that is
all a locked screen shows:

```
3 offers added
1 offer added, 1 account failed
No new offers
```

The body is for when it matters — a line per account, naming what broke and
which offers refused to add:

```
✓ Connor · Amex: 1 added
  ! Delta $50 - tile never flipped to added
✗ Connor · Chase: sign-in failed - no code arrived within 120s
```

Delivery is a [`Notifier`](./src/notification.ts): `consoleNotifier` (always
on, so a scheduled run leaves the summary in its journal) and `ntfyNotifier`
(when ntfy is configured).

## Testing

```sh
bun run --filter @offers/notify test:unit
bun run --filter @offers/notify test:types
```

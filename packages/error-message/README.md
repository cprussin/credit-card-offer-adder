# @offers/error-message

Flatten a thrown value into the one line that goes in a run report.

Every failure this system reports ends up on a phone notification, so the
chain of `cause`s matters: Playwright's "timeout exceeded" is useless without
the "could not add offer" that wraps it.

```ts
import { errorMessage } from "@offers/error-message/error-message";

errorMessage(new Error("could not add offer", { cause: new Error("disabled") }));
// "could not add offer: disabled"
```

## Testing

```sh
bun run --filter @offers/error-message test:unit
```

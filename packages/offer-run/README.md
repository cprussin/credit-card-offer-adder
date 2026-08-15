# @offers/offer-run

The run loop: turn a list of configured accounts into one report.

## What it does

`runAccounts` walks the accounts **strictly one at a time** and collects an
outcome for every one of them. Serial is deliberate — two sessions against the
same issuer at once look like credential stuffing, and two logins waiting on
one-time codes simultaneously would race over which message is whose.

`runAccount` does one account: open a session, add every offer, close the
session on every path. It returns `Result<AccountReport, AccountError>` rather
than throwing, because the caller has three more accounts to get through.
`AccountError` distinguishes the two failures that matter in a 6am
notification:

| Variant | Usually means |
|---|---|
| `SignInFailed` | a code never arrived — worth acting on |
| `OffersUnavailable` | the bank changed its page — the adapter needs a fix |

## Usage

```ts
import { runAccount } from "@offers/offer-run/run-account";
import { runAccounts } from "@offers/offer-run/run-accounts";

const report = await runAccounts(config.accounts, {
  runOne: (account) => runAccount(account, { openSession }),
});
```

## Modules

- [`run-accounts`](./src/run-accounts.ts) — every account, serially.
- [`run-account`](./src/run-account.ts) — one account, end to end.
- [`account-session`](./src/account-session.ts) — the port that hides the
  browser, the vault, and the sign-in behind one step.
- [`account-error`](./src/account-error.ts) — why an account produced nothing.
- [`run-report`](./src/run-report.ts) — what one run produced.

## Testing

```sh
bun run --filter @offers/offer-run test:unit
bun run --filter @offers/offer-run test:types
```

# @offers/browser-session

One persistent Chromium profile per account, and the artifacts left behind
when a run fails.

## Why the profile matters

The profile directory — cookies, local storage, the device token a bank sets
when you tell it to remember the browser — is the most valuable state in this
system. It is why a code is needed on the first run and rarely again, and it
is why the whole thing can run unattended. So it lives under `profileDir` on
durable storage, one directory per account. Sharing one directory would log
the accounts out of each other on every run and guarantee a challenge every
time.

The launch settings are chosen against fingerprinting: a real desktop
viewport, and `--disable-blink-features=AutomationControlled`, since Chromium
otherwise advertises that it is automated. Prefer `headless: false` under
Xvfb; headless Chromium is the loudest bot signal available.

## Failure artifacts

`captureFailure` writes a full-page screenshot and the page's HTML under
`artifactDir/<account-id>/<timestamp>-<name>`. It is called only after a
failure and only from the offers page — never from a login form with a
password in it. `artifactDir` is git-ignored.

## Usage

```ts
import { openBrowserSession } from "@offers/browser-session/browser-session";

const session = await openBrowserSession({
  accountId: "connor-amex",
  artifactDir,
  headless: false,
  profileDir,
});
```

## Testing

```sh
bun run --filter @offers/browser-session test:unit
bun run --filter @offers/browser-session test:types
```

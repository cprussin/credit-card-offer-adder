# @offers/totp

Generate a TOTP code from a secret, with no dependencies.

Chase lets you enrol an authenticator app, and a code this service can compute
itself is the only rung of the ladder that needs neither a mailbox round trip
nor a phone. That makes it the difference between a run that finishes in two
minutes and one that waits on SMS.

Implemented here rather than pulled in because it is about eighty lines of
well-specified arithmetic — RFC 6238 over RFC 4226's dynamic truncation, with
RFC 4648 base32 decoding — and because a dependency that sees every TOTP secret
we hold is a dependency worth not having. The RFC 6238 test vectors (all three
algorithms, all six timestamps) are in
[`generate-totp.test.ts`](./src/generate-totp.test.ts).

## Usage

```ts
import { generateTotp } from "@offers/totp/generate-totp";
import { parseOtpauth } from "@offers/totp/parse-otpauth";

// Accepts a full otpauth:// URI — what a bank's QR code encodes — or the bare
// base32 secret shown next to it.
const parameters = parseOtpauth(
  "otpauth://totp/Chase:connor?secret=JBSWY3DPEHPK3PXP&issuer=Chase",
);
generateTotp(parameters, new Date()); // six digits, valid for this 30s window
```

`parseOtpauth` defaults to SHA1 / 6 digits / 30 seconds, which is what every
bank uses, and throws on anything it cannot honour — an `otpauth://hotp/` URI,
a missing or non-base32 secret, a non-numeric `digits`, an algorithm outside
SHA1/SHA256/SHA512. It validates eagerly, at startup, because a secret that
only fails when a code is needed leaves the ladder silently one rung shorter.
The clock is a parameter rather than read internally so the vectors can be
tested at all.

Nothing thrown from this package quotes its input. The input is a bank
credential, and every failure here reaches the run report — which goes to the
journal and to a phone. That is also why `new URL` is caught rather than
allowed to propagate: it reports failure by quoting the whole URI.

## Modules

- [`generate-totp`](./src/generate-totp.ts) — the code itself.
- [`parse-otpauth`](./src/parse-otpauth.ts) — `otpauth://` URI or bare secret.
- [`base32`](./src/base32.ts) — RFC 4648 decoding, shared by both.

## Testing

```sh
bun run --filter @offers/totp test:unit
bun run --filter @offers/totp test:types
```

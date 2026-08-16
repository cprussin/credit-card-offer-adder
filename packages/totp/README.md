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
a missing secret, an algorithm outside SHA1/SHA256/SHA512. The clock is a
parameter rather than read internally so the vectors can be tested at all.

## Modules

- [`generate-totp`](./src/generate-totp.ts) — the code, and base32 decoding.
- [`parse-otpauth`](./src/parse-otpauth.ts) — `otpauth://` URI or bare secret.

## Testing

```sh
bun run --filter @offers/totp test:unit
bun run --filter @offers/totp test:types
```

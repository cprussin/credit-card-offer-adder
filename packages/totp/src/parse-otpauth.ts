import { decodeBase32 } from "./base32";
import type { TotpAlgorithm, TotpParameters } from "./generate-totp";

/** RFC 6238 defaults, and what every bank we have seen actually uses. */
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_ALGORITHM: TotpAlgorithm = "SHA1";

/** Lookup rather than a cast: the configured string is external data. */
const ALGORITHMS: Record<string, TotpAlgorithm> = {
  SHA1: "SHA1",
  SHA256: "SHA256",
  SHA512: "SHA512",
};

/**
 * Read a configured TOTP secret, in either form a bank hands out: the full
 * `otpauth://` URI behind its QR code, or the bare base32 string printed next
 * to it. Anything unparseable throws rather than silently producing codes that
 * will never work.
 *
 * Two rules hold for every failure below, because the configured string *is* a
 * bank credential and everything thrown here reaches the run report — which
 * goes to the journal and to a phone:
 *
 * 1. No message may quote its input. That includes messages we do not write:
 *    `new URL` puts the whole string it rejected into its own message, so it is
 *    caught rather than allowed to propagate.
 * 2. Everything that can be checked is checked here, at startup, rather than at
 *    the challenge. A secret that only fails when a code is needed leaves the
 *    ladder silently one rung shorter — the run falls through to the mailbox and
 *    waits, twice a day, forever.
 */
export const parseOtpauth = (configured: string): TotpParameters => {
  const trimmed = configured.trim();
  const parameters = trimmed.toLowerCase().startsWith("otpauth://")
    ? fromUri(asUrl(trimmed))
    : {
        algorithm: DEFAULT_ALGORITHM,
        digits: DEFAULT_DIGITS,
        periodSeconds: DEFAULT_PERIOD_SECONDS,
        secret: trimmed,
      };
  // Decoded and discarded: proving the secret is usable now is the whole point,
  // and the bytes themselves are not wanted until there is a code to generate.
  decodeBase32(parameters.secret);
  return parameters;
};

/** `new URL` reports failure by quoting the entire URI, secret included. */
const asUrl = (uri: string): URL => {
  try {
    return new URL(uri);
  } catch {
    throw new Error("otpauth URI is not a valid URI");
  }
};

const fromUri = (uri: URL): TotpParameters => {
  const kind = uri.host.toLowerCase();
  if (kind === "totp") {
    const secret = uri.searchParams.get("secret");
    if (secret === null) {
      throw new Error("otpauth URI has no secret");
    } else {
      return {
        algorithm: algorithmOf(uri.searchParams.get("algorithm")),
        digits: numberOf(uri.searchParams.get("digits"), "digits", {
          fallback: DEFAULT_DIGITS,
        }),
        periodSeconds: numberOf(uri.searchParams.get("period"), "period", {
          fallback: DEFAULT_PERIOD_SECONDS,
        }),
        secret,
      };
    }
  } else {
    throw new Error(
      `otpauth URI is ${kind}, but only totp can be generated on a clock`,
    );
  }
};

const algorithmOf = (configured: string | null): TotpAlgorithm => {
  if (configured === null) {
    return DEFAULT_ALGORITHM;
  } else {
    const found = ALGORITHMS[configured.toUpperCase()];
    if (found === undefined) {
      throw new Error(`unsupported TOTP algorithm: ${configured}`);
    } else {
      return found;
    }
  }
};

/**
 * Safe to quote in the message: these are the parameters beside the secret, not
 * the secret. A `digits` of `NaN` would otherwise reach the bank's form as the
 * literal code "NaN", and a `period` of zero divides by zero.
 */
const numberOf = (
  configured: string | null,
  field: string,
  { fallback }: { readonly fallback: number },
): number => {
  if (configured === null) {
    return fallback;
  } else {
    const parsed = Number.parseInt(configured, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    } else {
      throw new Error(
        `otpauth URI has a ${field} that is not a number: ${configured}`,
      );
    }
  }
};

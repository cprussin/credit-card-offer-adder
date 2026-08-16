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
 */
export const parseOtpauth = (configured: string): TotpParameters => {
  const trimmed = configured.trim();
  return trimmed.toLowerCase().startsWith("otpauth://")
    ? fromUri(new URL(trimmed))
    : {
        algorithm: DEFAULT_ALGORITHM,
        digits: DEFAULT_DIGITS,
        periodSeconds: DEFAULT_PERIOD_SECONDS,
        secret: trimmed,
      };
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
        digits: numberOf(uri.searchParams.get("digits"), DEFAULT_DIGITS),
        periodSeconds: numberOf(
          uri.searchParams.get("period"),
          DEFAULT_PERIOD_SECONDS,
        ),
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

const numberOf = (configured: string | null, fallback: number): number =>
  configured === null ? fallback : Number.parseInt(configured, 10);

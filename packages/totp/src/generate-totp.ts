import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4226 §5.3: the last nibble of the digest selects the offset. */
const DYNAMIC_TRUNCATION_MASK = 0x7f_ff_ff_ff;

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type TotpParameters = {
  /** Base32 shared secret. Case and separating spaces are ignored. */
  readonly secret: string;
  readonly digits: number;
  readonly periodSeconds: number;
  readonly algorithm: TotpAlgorithm;
};

/**
 * A time-based one-time password (RFC 6238).
 *
 * Implemented here rather than shelled out to a password manager so the only
 * secret this service needs on disk is the four bank logins — not a key to
 * everything else. `now` is a parameter so the reference vectors are testable.
 */
export const generateTotp = (
  { secret, digits, periodSeconds, algorithm }: TotpParameters,
  now: Date,
): string => {
  const counter = Math.floor(now.getTime() / 1000 / periodSeconds);
  const digest = createHmac(algorithm.toLowerCase(), decodeBase32(secret))
    .update(counterBlock(counter))
    .digest();
  return truncate(digest, digits);
};

/** RFC 4226 §5.2: the counter is an 8-byte big-endian block. */
const counterBlock = (counter: number): Buffer => {
  const block = Buffer.alloc(8);
  block.writeBigUInt64BE(BigInt(counter));
  return block;
};

const truncate = (digest: Buffer, digits: number): string => {
  const last = digest.at(-1);
  if (last === undefined) {
    throw new Error("HMAC produced an empty digest");
  } else {
    const offset = last & 0x0f;
    const binary = digest.readUInt32BE(offset) & DYNAMIC_TRUNCATION_MASK;
    return (binary % 10 ** digits).toString().padStart(digits, "0");
  }
};

/**
 * RFC 4648 base32. Authenticator secrets are commonly shown in lowercase and
 * broken into space-separated groups, and the padding is optional, so all three
 * are normalized away before decoding.
 */
const decodeBase32 = (secret: string): Buffer => {
  const normalized = secret
    .replaceAll(/[\s-]/g, "")
    .replace(/=+$/, "")
    .toUpperCase();
  const bits = [...normalized].map((character) => {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value === -1) {
      throw new Error("TOTP secret is not valid base32");
    } else {
      return value.toString(2).padStart(5, "0");
    }
  });
  return packBits(bits.join(""));
};

const packBits = (bits: string): Buffer => {
  const wholeBytes = Math.floor(bits.length / 8);
  const bytes = Array.from({ length: wholeBytes }, (_unused, index) =>
    Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
  );
  if (bytes.length === 0) {
    throw new Error("TOTP secret is not valid base32");
  } else {
    return Buffer.from(bytes);
  }
};

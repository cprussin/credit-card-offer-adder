const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Five bits per character, so this is the shortest input worth a byte. */
const BITS_PER_CHARACTER = 5;
const BITS_PER_BYTE = 8;

/**
 * RFC 4648 base32. Authenticator secrets are commonly shown in lowercase and
 * broken into space- or dash-separated groups, and the padding is optional, so
 * all three are normalized away before decoding.
 *
 * Nothing thrown from here may quote its input: the input is a TOTP secret, and
 * every failure in this package ends up in a run report, which goes to the
 * journal and to a phone.
 */
export const decodeBase32 = (secret: string): Buffer => {
  const normalized = secret
    .replaceAll(/[\s-]/g, "")
    .replace(/=+$/, "")
    .toUpperCase();
  const bits = [...normalized].map((character) => {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value === -1) {
      throw new Error("TOTP secret is not valid base32");
    } else {
      return value.toString(2).padStart(BITS_PER_CHARACTER, "0");
    }
  });
  return packBits(bits.join(""));
};

/**
 * RFC 4648 §6: a base32 string need not encode a whole number of bytes, and the
 * trailing bits that do not fill one are padding rather than data. Taking whole
 * bytes from the front and dropping the remainder is what makes the SHA256 and
 * SHA512 reference vectors — 52 and 103 characters, neither a multiple of 8 —
 * come out right.
 */
const packBits = (bits: string): Buffer => {
  const wholeBytes = Math.floor(bits.length / BITS_PER_BYTE);
  if (wholeBytes === 0) {
    throw new Error("TOTP secret is too short to be a key");
  } else {
    return Buffer.from(
      Array.from({ length: wholeBytes }, (_unused, index) =>
        Number.parseInt(
          bits.slice(index * BITS_PER_BYTE, (index + 1) * BITS_PER_BYTE),
          2,
        ),
      ),
    );
  }
};

import { describe, expect, it } from "bun:test";

import { decodeBase32 } from "./base32";

describe("decodeBase32", () => {
  it("decodes to the bytes the secret stands for", () => {
    expect(decodeBase32("GEZDGNBVGY3TQOJQ").toString("ascii")).toBe(
      "1234567890",
    );
  });

  it("ignores the case, grouping and padding a site prints it with", () => {
    expect(decodeBase32("gezd-gnbv gy3t qojq==").toString("ascii")).toBe(
      "1234567890",
    );
  });

  it("drops the trailing bits that do not fill a byte", () => {
    // 52 characters is 260 bits: 32 whole bytes and 4 bits of padding. Keeping
    // those 4 bits would shift every byte and produce plausible wrong codes,
    // which is what the SHA256 reference vector catches.
    expect(
      decodeBase32("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA"),
    ).toHaveLength(32);
  });

  it("rejects a character outside the alphabet", () => {
    // 0 and O are the classic transcription error, and 0 is not in RFC 4648's
    // alphabet precisely to avoid it.
    expect(() => decodeBase32("JBSWY3DPEHPK3PX0")).toThrow(
      "TOTP secret is not valid base32",
    );
  });

  it("rejects a secret too short to make even one byte", () => {
    expect(() => decodeBase32("A")).toThrow("TOTP secret is too short");
  });

  it("says nothing about the secret it rejected", () => {
    const secret = "NBSWY3DPEHPK3PXP!";
    try {
      decodeBase32(secret);
      throw new Error("expected decodeBase32 to throw");
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain(
        "NBSWY3DP",
      );
    }
  });
});

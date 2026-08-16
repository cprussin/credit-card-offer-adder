import { describe, expect, it } from "bun:test";

import { parseOtpauth } from "./parse-otpauth";

describe("parseOtpauth", () => {
  it("reads the secret out of an otpauth URI", () => {
    expect(
      parseOtpauth("otpauth://totp/Chase:connor?secret=JBSWY3DPEHPK3PXP"),
    ).toEqual({
      algorithm: "SHA1",
      digits: 6,
      periodSeconds: 30,
      secret: "JBSWY3DPEHPK3PXP",
    });
  });

  it("honours explicit digits, period and algorithm", () => {
    expect(
      parseOtpauth(
        "otpauth://totp/Bank:me?secret=JBSWY3DPEHPK3PXP&digits=8&period=60&algorithm=SHA256",
      ),
    ).toEqual({
      algorithm: "SHA256",
      digits: 8,
      periodSeconds: 60,
      secret: "JBSWY3DPEHPK3PXP",
    });
  });

  it("accepts a bare base32 secret, which is what most sites print", () => {
    expect(parseOtpauth("jbsw y3dp ehpk 3pxp")).toEqual({
      algorithm: "SHA1",
      digits: 6,
      periodSeconds: 30,
      secret: "jbsw y3dp ehpk 3pxp",
    });
  });

  it("rejects a counter-based HOTP URI, which cannot be generated on a clock", () => {
    expect(() =>
      parseOtpauth("otpauth://hotp/Bank:me?secret=JBSWY3DPEHPK3PXP&counter=1"),
    ).toThrow("otpauth URI is hotp, but only totp can be generated");
  });

  it("rejects an otpauth URI with no secret", () => {
    expect(() => parseOtpauth("otpauth://totp/Bank:me?digits=6")).toThrow(
      "otpauth URI has no secret",
    );
  });

  it("rejects an algorithm we cannot compute", () => {
    expect(() =>
      parseOtpauth(
        "otpauth://totp/Bank:me?secret=JBSWY3DPEHPK3PXP&algorithm=MD5",
      ),
    ).toThrow("unsupported TOTP algorithm: MD5");
  });

  it("rejects a secret that is not base32, before a run can start", () => {
    // One character transcribed wrong — 0 for O — in an otherwise real secret.
    expect(() => parseOtpauth("JBSWY3DPEHPK3PX0")).toThrow(
      "TOTP secret is not valid base32",
    );
  });

  it("rejects digits that are not a number", () => {
    expect(() =>
      parseOtpauth("otpauth://totp/Bank:me?secret=JBSWY3DPEHPK3PXP&digits=six"),
    ).toThrow("otpauth URI has a digits that is not a number: six");
  });

  it("rejects a period that is not a positive number", () => {
    expect(() =>
      parseOtpauth("otpauth://totp/Bank:me?secret=JBSWY3DPEHPK3PXP&period=0"),
    ).toThrow("otpauth URI has a period that is not a number: 0");
  });

  describe("never puts the secret in the failure", () => {
    // Everything thrown here reaches a push notification and the journal by
    // way of `errorMessage`, and the configured string IS the secret. A
    // message that quotes its input hands a bank credential to ntfy.
    const SECRET = "NBSWY3DPEHPK3PXPNBSWY3DP";

    const messageOf = (configured: string): string => {
      try {
        parseOtpauth(configured);
        throw new Error("expected parseOtpauth to throw");
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    it("when the URI will not parse at all", () => {
      // A backslash in the authority: what a mis-exported QR code looks like.
      expect(messageOf(`otpauth://totp\\Bank?secret=${SECRET}`)).not.toContain(
        SECRET,
      );
    });

    it("when the URI parses but the secret is not base32", () => {
      expect(messageOf(`otpauth://totp/Bank?secret=${SECRET}!!`)).not.toContain(
        SECRET,
      );
    });

    it("when a bare secret is not base32", () => {
      expect(messageOf(`${SECRET}!!`)).not.toContain(SECRET);
    });
  });
});

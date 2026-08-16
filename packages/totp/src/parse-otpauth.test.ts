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
});

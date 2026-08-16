import { describe, expect, it } from "bun:test";

import { generateTotp } from "./generate-totp";

/**
 * RFC 6238 Appendix B. The reference secret is the ASCII string
 * "12345678901234567890", which is this in base32.
 */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

const rfcVector = (unixSeconds: number) =>
  generateTotp(
    { algorithm: "SHA1", digits: 8, periodSeconds: 30, secret: RFC_SECRET },
    new Date(unixSeconds * 1000),
  );

describe("generateTotp", () => {
  describe("RFC 6238 reference vectors", () => {
    it("matches at T=59", () => {
      expect(rfcVector(59)).toBe("94287082");
    });

    it("matches at T=1111111109, the step boundary", () => {
      expect(rfcVector(1_111_111_109)).toBe("07081804");
    });

    it("matches one second later, in the next step", () => {
      expect(rfcVector(1_111_111_111)).toBe("14050471");
    });

    it("matches at T=1234567890", () => {
      expect(rfcVector(1_234_567_890)).toBe("89005924");
    });

    it("matches at T=2000000000", () => {
      expect(rfcVector(2_000_000_000)).toBe("69279037");
    });

    it("matches past the 32-bit boundary at T=20000000000", () => {
      expect(rfcVector(20_000_000_000)).toBe("65353130");
    });
  });

  it("truncates to six digits, which is what the banks ask for", () => {
    const code = generateTotp(
      { algorithm: "SHA1", digits: 6, periodSeconds: 30, secret: RFC_SECRET },
      new Date(59_000),
    );
    expect(code).toBe("287082");
  });

  it("pads a short code to the full width", () => {
    // T=1111111109 yields 07081804 at eight digits, so the six-digit form
    // keeps its leading zero rather than becoming 81804.
    const code = generateTotp(
      { algorithm: "SHA1", digits: 6, periodSeconds: 30, secret: RFC_SECRET },
      new Date(1_111_111_109_000),
    );
    expect(code).toBe("081804");
  });

  it("holds the same code for the whole period", () => {
    const options = {
      algorithm: "SHA1" as const,
      digits: 6,
      periodSeconds: 30,
      secret: RFC_SECRET,
    };
    expect(generateTotp(options, new Date(60_000))).toBe(
      generateTotp(options, new Date(89_000)),
    );
  });

  it("accepts a lowercase, space-separated secret as written on a bank's page", () => {
    const spaced = "gezd gnbv gy3t qojq gezd gnbv gy3t qojq";
    expect(
      generateTotp(
        { algorithm: "SHA1", digits: 8, periodSeconds: 30, secret: spaced },
        new Date(59_000),
      ),
    ).toBe("94287082");
  });

  it("rejects a secret that is not base32", () => {
    expect(() =>
      generateTotp(
        { algorithm: "SHA1", digits: 6, periodSeconds: 30, secret: "not-b32!" },
        new Date(59_000),
      ),
    ).toThrow("TOTP secret is not valid base32");
  });
});

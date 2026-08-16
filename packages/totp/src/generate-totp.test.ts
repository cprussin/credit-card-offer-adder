import { describe, expect, it } from "bun:test";

import type { TotpAlgorithm } from "./generate-totp";
import { generateTotp } from "./generate-totp";

/**
 * RFC 6238 Appendix B. Each algorithm uses a different reference secret — the
 * ASCII digits "123456789012..." repeated to the digest's block size — which
 * is what makes these vectors worth having: SHA256 and SHA512 exercise base32
 * inputs whose bit count is not a multiple of eight, where a decoder that
 * mishandles the trailing partial group produces plausible but wrong codes.
 */
const RFC_SECRETS = {
  SHA1: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  SHA256: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA",
  SHA512:
    "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA",
} as const;

const RFC_SECRET = RFC_SECRETS.SHA1;

const rfcVector = (unixSeconds: number, algorithm: TotpAlgorithm = "SHA1") =>
  generateTotp(
    {
      algorithm,
      digits: 8,
      periodSeconds: 30,
      secret: RFC_SECRETS[algorithm],
    },
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

  describe("RFC 6238 reference vectors, SHA256", () => {
    it("matches at T=59", () => {
      expect(rfcVector(59, "SHA256")).toBe("46119246");
    });

    it("matches at T=1111111109, the step boundary", () => {
      expect(rfcVector(1_111_111_109, "SHA256")).toBe("68084774");
    });

    it("matches one second later, in the next step", () => {
      expect(rfcVector(1_111_111_111, "SHA256")).toBe("67062674");
    });

    it("matches at T=1234567890", () => {
      expect(rfcVector(1_234_567_890, "SHA256")).toBe("91819424");
    });

    it("matches at T=2000000000", () => {
      expect(rfcVector(2_000_000_000, "SHA256")).toBe("90698825");
    });

    it("matches past the 32-bit boundary at T=20000000000", () => {
      expect(rfcVector(20_000_000_000, "SHA256")).toBe("77737706");
    });
  });

  describe("RFC 6238 reference vectors, SHA512", () => {
    it("matches at T=59", () => {
      expect(rfcVector(59, "SHA512")).toBe("90693936");
    });

    it("matches at T=1111111109, the step boundary", () => {
      expect(rfcVector(1_111_111_109, "SHA512")).toBe("25091201");
    });

    it("matches one second later, in the next step", () => {
      expect(rfcVector(1_111_111_111, "SHA512")).toBe("99943326");
    });

    it("matches at T=1234567890", () => {
      expect(rfcVector(1_234_567_890, "SHA512")).toBe("93441116");
    });

    it("matches at T=2000000000", () => {
      expect(rfcVector(2_000_000_000, "SHA512")).toBe("38618901");
    });

    it("matches past the 32-bit boundary at T=20000000000", () => {
      expect(rfcVector(20_000_000_000, "SHA512")).toBe("47863826");
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
});

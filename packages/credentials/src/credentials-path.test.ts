import { describe, expect, it } from "bun:test";

import { credentialsPath } from "./credentials-path";

describe("credentialsPath", () => {
  it("prefers the credential systemd unsealed for this unit", () => {
    expect(
      credentialsPath({
        configured: "/etc/offers.credentials.json",
        systemdCredentialsDir: "/run/credentials/offer-adder.service",
      }),
    ).toBe("/run/credentials/offer-adder.service/offers-credentials");
  });

  it("falls back to the configured path when systemd passed nothing", () => {
    expect(
      credentialsPath({
        configured: "/etc/offers.credentials.json",
        systemdCredentialsDir: undefined,
      }),
    ).toBe("/etc/offers.credentials.json");
  });

  it("refuses to guess when neither is available", () => {
    expect(() =>
      credentialsPath({
        configured: undefined,
        systemdCredentialsDir: undefined,
      }),
    ).toThrow(
      "no credentials file: set OFFERS_CREDENTIALS or run under systemd with LoadCredentialEncrypted",
    );
  });
});

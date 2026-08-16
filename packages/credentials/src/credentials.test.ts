import { describe, expect, it } from "bun:test";

import {
  credentialsFor,
  imapCredentialsFor,
  parseCredentials,
  totpSecretFor,
} from "./credentials";

const raw = {
  accounts: {
    "connor-amex": {
      imap: { password: "mailbox-pw", user: "offers@example.com" },
      password: "hunter2",
      totpSecret: "otpauth://totp/Amex?secret=JBSWY3DPEHPK3PXP",
      username: "connor",
    },
  },
  ntfyToken: "tk_secret",
};

describe("parseCredentials", () => {
  it("reads a login, and only the login", () => {
    // What an issuer adapter receives. The TOTP secret and the mailbox password
    // are not part of it: they belong to the code ladder, and nothing that
    // drives a bank page has a use for them.
    const credentials = parseCredentials(raw);
    expect(credentialsFor(credentials, "connor-amex")).toEqual({
      password: "hunter2",
      username: "connor",
    });
  });

  it("keeps the mailbox login beside the bank login", () => {
    expect(imapCredentialsFor(parseCredentials(raw), "connor-amex")).toEqual({
      password: "mailbox-pw",
      user: "offers@example.com",
    });
  });

  it("leaves the TOTP secret undefined when the account has none", () => {
    const credentials = parseCredentials({
      accounts: { "connor-amex": { password: "p", username: "u" } },
    });
    expect(totpSecretFor(credentials, "connor-amex")).toBeUndefined();
  });

  it("rejects an empty password rather than typing it into a bank", () => {
    expect(() =>
      parseCredentials({
        accounts: { "connor-amex": { password: "", username: "u" } },
      }),
    ).toThrow();
  });

  it("rejects a file that is not a credentials document", () => {
    expect(() => parseCredentials({ vaultItem: "Amex" })).toThrow();
  });
});

describe("credentialsFor", () => {
  it("names the account when the credentials file has no entry for it", () => {
    expect(() => credentialsFor(parseCredentials(raw), "spouse-chase")).toThrow(
      'no credentials for account "spouse-chase"',
    );
  });
});

describe("imapCredentialsFor", () => {
  it("names the account when it has a mailbox configured but no mailbox login", () => {
    const credentials = parseCredentials({
      accounts: { "connor-amex": { password: "p", username: "u" } },
    });
    expect(() => imapCredentialsFor(credentials, "connor-amex")).toThrow(
      'account "connor-amex" reads codes from a mailbox but has no imap credentials',
    );
  });
});

describe("totpSecretFor", () => {
  it("reads the secret for an account enrolled in an authenticator app", () => {
    expect(totpSecretFor(parseCredentials(raw), "connor-amex")).toBe(
      "otpauth://totp/Amex?secret=JBSWY3DPEHPK3PXP",
    );
  });

  it("names the account when it has no entry at all", () => {
    expect(() => totpSecretFor(parseCredentials(raw), "spouse-chase")).toThrow(
      'no credentials for account "spouse-chase"',
    );
  });
});

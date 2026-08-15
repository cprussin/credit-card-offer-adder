import { describe, expect, it } from "bun:test";
import { Issuer } from "@offers/offer/issuer";

import { CodeSourceKind } from "./code-source-kind";
import { parseConfig } from "./config-schema";

const amexAccount = {
  id: "connor-amex",
  imap: {
    folder: "INBOX",
    host: "imap.example.com",
    port: 993,
    secure: true,
    vaultItem: "mailbox-connor",
  },
  issuer: "amex",
  label: "Connor · Amex",
  senderHints: ["americanexpress"],
  vaultItem: "amex-connor",
};

const config = (accounts: readonly unknown[]) => ({ accounts });

describe("parseConfig", () => {
  it("maps the issuer string onto the in-memory enum", () => {
    const parsed = parseConfig(config([amexAccount]));
    expect(parsed.accounts[0]?.issuer).toBe(Issuer.Amex);
  });

  it("defaults the code-source ladder to automatic sources first", () => {
    const parsed = parseConfig(config([amexAccount]));
    expect(parsed.accounts[0]?.codeSources).toEqual([
      CodeSourceKind.Totp,
      CodeSourceKind.Imap,
      CodeSourceKind.Ntfy,
    ]);
  });

  it("leaves imap out of the default ladder when there is no mailbox", () => {
    const { imap: _imap, ...withoutMailbox } = amexAccount;
    const parsed = parseConfig(config([withoutMailbox]));
    expect(parsed.accounts[0]?.codeSources).toEqual([
      CodeSourceKind.Totp,
      CodeSourceKind.Ntfy,
    ]);
  });

  it("maps a configured ladder onto the enum, in order", () => {
    const parsed = parseConfig(
      config([{ ...amexAccount, codeSources: ["imap", "prompt"] }]),
    );
    expect(parsed.accounts[0]?.codeSources).toEqual([
      CodeSourceKind.Imap,
      CodeSourceKind.Prompt,
    ]);
  });

  it("rejects an issuer we have no adapter for", () => {
    expect(() =>
      parseConfig(config([{ ...amexAccount, issuer: "citi" }])),
    ).toThrow();
  });

  it("rejects an empty ladder, which could never log in", () => {
    expect(() =>
      parseConfig(config([{ ...amexAccount, codeSources: [] }])),
    ).toThrow();
  });

  it("rejects an imap ladder with no mailbox to read", () => {
    const { imap: _imap, ...withoutMailbox } = amexAccount;
    expect(() =>
      parseConfig(config([{ ...withoutMailbox, codeSources: ["imap"] }])),
    ).toThrow("codeSources includes imap but no imap block is configured");
  });

  it("accepts a ladder with no imap and no mailbox", () => {
    const { imap: _imap, ...withoutMailbox } = amexAccount;
    const parsed = parseConfig(
      config([{ ...withoutMailbox, codeSources: ["totp"] }]),
    );
    expect(parsed.accounts[0]?.imap).toBeUndefined();
  });

  it("rejects duplicate account ids, which would share a browser profile", () => {
    expect(() =>
      parseConfig(config([amexAccount, { ...amexAccount, label: "Other" }])),
    ).toThrow("duplicate account id: connor-amex");
  });

  it("rejects a config with no accounts", () => {
    expect(() => parseConfig(config([]))).toThrow();
  });

  it("keeps ntfy topics when they are configured", () => {
    const parsed = parseConfig({
      ...config([amexAccount]),
      ntfy: {
        alertTopic: "offers-alerts",
        replyTopic: "offers-codes",
        server: "https://ntfy.example.com",
      },
    });
    expect(parsed.ntfy?.replyTopic).toBe("offers-codes");
  });
});

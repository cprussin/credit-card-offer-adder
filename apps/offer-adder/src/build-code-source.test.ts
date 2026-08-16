import { describe, expect, it } from "bun:test";
import { CodeSourceKind } from "@offers/config/code-source-kind";
import { parseCredentials } from "@offers/credentials/credentials";
import type { NtfyClient } from "@offers/ntfy/ntfy-client";
import type { ImapCredentials } from "@offers/one-time-code-imap/imap-mailbox";

import { buildCodeSource } from "./build-code-source";

const account = {
  codeSources: [CodeSourceKind.Totp, CodeSourceKind.Imap, CodeSourceKind.Ntfy],
  id: "connor-amex",
  imap: {
    folder: "INBOX",
    host: "imap.example.com",
    port: 993,
    secure: true,
  },
  issuer: 0,
  label: "Connor · Amex",
  senderHints: ["americanexpress"],
};

const credentials = parseCredentials({
  accounts: {
    "connor-amex": {
      imap: { password: "mailbox-pw", user: "offers@example.com" },
      password: "hunter2",
      totpSecret: "JBSWY3DPEHPK3PXP",
      username: "connor",
    },
  },
});

const ntfy = {
  alertTopic: "offers-alerts",
  client: {} as NtfyClient,
  replyTopic: "offers-codes",
};

const neverUsedMailbox = () => ({ recentMessages: () => Promise.resolve([]) });

describe("buildCodeSource", () => {
  it("chains the sources in the order the account configured", () => {
    const source = buildCodeSource(account, {
      credentials,
      makeMailbox: neverUsedMailbox,
      ntfy,
    });
    expect(source.name).toBe("totp -> imap -> ntfy");
  });

  it("opens the mailbox with the credentials document's login, not the config", () => {
    const opened: ImapCredentials[] = [];
    buildCodeSource(
      { ...account, codeSources: [CodeSourceKind.Imap] },
      {
        credentials,
        makeMailbox: (used) => {
          opened.push(used);
          return neverUsedMailbox();
        },
        ntfy,
      },
    );
    expect(opened[0]).toEqual({
      folder: "INBOX",
      host: "imap.example.com",
      password: "mailbox-pw",
      port: 993,
      secure: true,
      user: "offers@example.com",
    });
  });

  it("generates a six-digit code from the account's own TOTP secret", async () => {
    const source = buildCodeSource(
      { ...account, codeSources: [CodeSourceKind.Totp] },
      { credentials, makeMailbox: neverUsedMailbox, ntfy },
    );
    const code = await source.waitForCode({
      accountLabel: "Connor · Amex",
      requestedAt: new Date(),
      senderHints: ["americanexpress"],
    });
    expect(code.match({ Err: () => "", Ok: (value) => value })).toMatch(
      /^\d{6}$/,
    );
  });

  it("refuses to build a totp source for an account with no secret", () => {
    const withoutSecret = parseCredentials({
      accounts: { "connor-amex": { password: "p", username: "u" } },
    });
    expect(() =>
      buildCodeSource(
        { ...account, codeSources: [CodeSourceKind.Totp] },
        { credentials: withoutSecret, makeMailbox: neverUsedMailbox, ntfy },
      ),
    ).toThrow(
      'account "connor-amex" asks for totp codes but has no totpSecret',
    );
  });

  it("refuses to build a totp source from a malformed secret", () => {
    // A secret that only fails when a code is needed leaves the ladder one rung
    // shorter for good: the run falls through to the mailbox and waits, twice a
    // day, forever. One character wrong — 0 for O — is enough.
    const malformed = parseCredentials({
      accounts: {
        "connor-amex": {
          password: "p",
          totpSecret: "JBSWY3DPEHPK3PX0",
          username: "u",
        },
      },
    });
    expect(() =>
      buildCodeSource(
        { ...account, codeSources: [CodeSourceKind.Totp] },
        { credentials: malformed, makeMailbox: neverUsedMailbox, ntfy },
      ),
    ).toThrow("TOTP secret is not valid base32");
  });

  it("refuses to build an ntfy source with no topics configured", () => {
    expect(() =>
      buildCodeSource(
        { ...account, codeSources: [CodeSourceKind.Ntfy] },
        { credentials, makeMailbox: neverUsedMailbox, ntfy: undefined },
      ),
    ).toThrow(
      'account "connor-amex" asks for ntfy codes but no ntfy block is configured',
    );
  });

  it("includes the terminal prompt when the account asks for it", () => {
    const source = buildCodeSource(
      { ...account, codeSources: [CodeSourceKind.Prompt] },
      { credentials, makeMailbox: neverUsedMailbox, ntfy: undefined },
    );
    expect(source.name).toBe("prompt");
  });
});

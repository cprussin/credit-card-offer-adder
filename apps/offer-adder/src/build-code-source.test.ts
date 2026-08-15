import { describe, expect, it } from "bun:test";
import { CodeSourceKind } from "@offers/config/code-source-kind";
import type { NtfyClient } from "@offers/ntfy/ntfy-client";
import type { ImapCredentials } from "@offers/one-time-code-imap/imap-mailbox";
import type { Vault } from "@offers/vault/vault";

import { buildCodeSource } from "./build-code-source";

const account = {
  codeSources: [CodeSourceKind.Totp, CodeSourceKind.Imap, CodeSourceKind.Ntfy],
  id: "connor-amex",
  imap: {
    folder: "INBOX",
    host: "imap.example.com",
    port: 993,
    secure: true,
    vaultItem: "mailbox-connor",
  },
  issuer: 0,
  label: "Connor · Amex",
  senderHints: ["americanexpress"],
  vaultItem: "amex-connor",
};

const vault: Vault = {
  credentials: async (itemId) => ({
    password: `password for ${itemId}`,
    username: `user for ${itemId}`,
  }),
  totp: async () => "123456",
};

const ntfy = {
  alertTopic: "offers-alerts",
  client: {} as NtfyClient,
  replyTopic: "offers-codes",
};

const neverUsedMailbox = () => ({ recentMessages: async () => [] });

describe("buildCodeSource", () => {
  it("chains the sources in the order the account configured", async () => {
    const source = await buildCodeSource(account, {
      makeMailbox: neverUsedMailbox,
      ntfy,
      vault,
    });
    expect(source.name).toBe("totp -> imap -> ntfy");
  });

  it("opens the mailbox with credentials from the vault, not the config", async () => {
    const opened: ImapCredentials[] = [];
    await buildCodeSource(
      { ...account, codeSources: [CodeSourceKind.Imap] },
      {
        makeMailbox: (credentials) => {
          opened.push(credentials);
          return neverUsedMailbox();
        },
        ntfy,
        vault,
      },
    );
    expect(opened[0]).toEqual({
      folder: "INBOX",
      host: "imap.example.com",
      password: "password for mailbox-connor",
      port: 993,
      secure: true,
      user: "user for mailbox-connor",
    });
  });

  it("refuses to build an ntfy source with no topics configured", async () => {
    await expect(
      buildCodeSource(
        { ...account, codeSources: [CodeSourceKind.Ntfy] },
        { makeMailbox: neverUsedMailbox, ntfy: undefined, vault },
      ),
    ).rejects.toThrow(
      'account "connor-amex" asks for ntfy codes but no ntfy block is configured',
    );
  });

  it("includes the terminal prompt when the account asks for it", async () => {
    const source = await buildCodeSource(
      { ...account, codeSources: [CodeSourceKind.Prompt] },
      { makeMailbox: neverUsedMailbox, ntfy: undefined, vault },
    );
    expect(source.name).toBe("prompt");
  });
});

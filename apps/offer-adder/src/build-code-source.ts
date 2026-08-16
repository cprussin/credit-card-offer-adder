import type { Account } from "@offers/config/account";
import { CodeSourceKind } from "@offers/config/code-source-kind";
import type { NtfyClient } from "@offers/ntfy/ntfy-client";
import { chainCodeSources } from "@offers/one-time-code/chain-code-sources";
import type { CodeSource } from "@offers/one-time-code/code-source";
import { ntfyCodeSource } from "@offers/one-time-code/ntfy-code-source";
import { promptCodeSource } from "@offers/one-time-code/prompt-code-source";
import { totpCodeSource } from "@offers/one-time-code/totp-code-source";
import { imapCodeSource } from "@offers/one-time-code-imap/imap-code-source";
import type {
  ImapCredentials,
  Mailbox,
} from "@offers/one-time-code-imap/imap-mailbox";
import { imapMailbox } from "@offers/one-time-code-imap/imap-mailbox";
import type { Vault } from "@offers/vault/vault";

export type NtfyTopics = {
  readonly client: NtfyClient;
  readonly alertTopic: string;
  readonly replyTopic: string;
};

export type BuildCodeSourceDeps = {
  readonly vault: Vault;
  readonly ntfy: NtfyTopics | undefined;
  readonly makeMailbox?: (credentials: ImapCredentials) => Mailbox;
};

/**
 * Assemble one account's code ladder from its configuration.
 *
 * The order is the account's, not ours — a Chase card enrolled in an
 * authenticator app wants `totp` first and may never need anything else, while
 * an Amex card goes straight to the mailbox. A kind the run cannot actually
 * build (ntfy with no topics) is a configuration error and fails here, before
 * a browser is ever launched, rather than silently shortening the ladder.
 */
export const buildCodeSource = async (
  account: Account,
  deps: BuildCodeSourceDeps,
): Promise<CodeSource> => {
  const sources: CodeSource[] = [];
  for (const kind of account.codeSources) {
    sources.push(await sourceFor(kind, account, deps));
  }
  return chainCodeSources(sources);
};

const sourceFor = async (
  kind: CodeSourceKind,
  account: Account,
  { vault, ntfy, makeMailbox = imapMailbox }: BuildCodeSourceDeps,
): Promise<CodeSource> => {
  switch (kind) {
    case CodeSourceKind.Totp:
      return totpCodeSource(() => vault.totp(account.vaultItem));
    case CodeSourceKind.Imap:
      return imapCodeSource({
        mailbox: makeMailbox(await mailboxCredentials(account, vault)),
      });
    case CodeSourceKind.Ntfy:
      return ntfyCodeSource({ ...requireNtfy(account, ntfy) });
    case CodeSourceKind.Prompt:
      return promptCodeSource();
  }
};

const mailboxCredentials = async (
  account: Account,
  vault: Vault,
): Promise<ImapCredentials> => {
  const imap = account.imap;
  if (imap === undefined) {
    throw new Error(
      `account "${account.id}" asks for imap codes but no imap block is configured`,
    );
  } else {
    const { username, password } = await vault.credentials(imap.vaultItem);
    return {
      folder: imap.folder,
      host: imap.host,
      password,
      port: imap.port,
      secure: imap.secure,
      user: username,
    };
  }
};

const requireNtfy = (
  account: Account,
  ntfy: NtfyTopics | undefined,
): NtfyTopics => {
  if (ntfy === undefined) {
    throw new Error(
      `account "${account.id}" asks for ntfy codes but no ntfy block is configured`,
    );
  } else {
    return ntfy;
  }
};

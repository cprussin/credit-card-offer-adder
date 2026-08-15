import type { DeliveredMessage } from "@offers/one-time-code/select-code";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type Mailbox = {
  /** Everything delivered at or after `since`, newest-first order not required. */
  readonly recentMessages: (
    since: Date,
  ) => Promise<readonly DeliveredMessage[]>;
};

export type ImapCredentials = {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly password: string;
  /** IMAP folder to search, usually `"INBOX"`. */
  readonly folder: string;
};

/**
 * Read a mailbox over IMAP. Thin glue over `imapflow` and `mailparser` with no
 * decisions of its own — which message carries the code is
 * `@offers/one-time-code/select-code`'s job, and when to stop looking is
 * `./imap-code-source`'s. Per /docs/guidelines/TESTING.md this layer is left
 * to integration use rather than unit-tested against a fake IMAP server.
 *
 * Each call opens and closes its own connection. A polling loop lasts a couple
 * of minutes at most, so a handful of logins costs less than owning a
 * long-lived connection's reconnect logic.
 */
export const imapMailbox = (credentials: ImapCredentials): Mailbox => ({
  recentMessages: async (since) => {
    const client = new ImapFlow({
      auth: { pass: credentials.password, user: credentials.user },
      host: credentials.host,
      // imapflow logs the IMAP dialogue, which includes the code itself.
      logger: false,
      port: credentials.port,
      secure: credentials.secure,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock(credentials.folder);
      try {
        return await readSince(client, since);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  },
});

const readSince = async (
  client: ImapFlow,
  since: Date,
): Promise<readonly DeliveredMessage[]> => {
  const messages: DeliveredMessage[] = [];
  for await (const message of client.fetch({ since }, { source: true })) {
    messages.push(await toDelivered(message.source, since));
  }
  return messages;
};

const toDelivered = async (
  source: Buffer | undefined,
  since: Date,
): Promise<DeliveredMessage> => {
  if (source === undefined) {
    throw new Error("IMAP returned a message with no source to parse");
  } else {
    const parsed = await simpleParser(source);
    return {
      from: parsed.from?.text ?? "",
      // A message with no Date header is one we just fetched, so `since` is a
      // closer truth than the epoch and keeps it inside the freshness window.
      receivedAt: parsed.date ?? since,
      text: `${parsed.subject ?? ""}\n${parsed.text ?? ""}`,
    };
  }
};

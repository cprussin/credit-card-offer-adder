import { z } from "zod";

/**
 * The mailbox login, kept beside the bank login it serves rather than in one
 * shared block, so two people at the same issuer never share an inbox — see
 * `@offers/one-time-code/select-code` for why that matters.
 */
const imapCredentialsSchema = z.object({
  password: z.string().min(1),
  user: z.string().min(1),
});

const accountCredentialsSchema = z.object({
  imap: imapCredentialsSchema.optional(),
  password: z.string().min(1),
  /**
   * An `otpauth://` URI or a bare base32 secret. Present only for accounts
   * enrolled in authenticator-app verification.
   */
  totpSecret: z.string().min(1).optional(),
  username: z.string().min(1),
});

const credentialsSchema = z.object({
  /** Keyed by the account `id` in the config file. */
  accounts: z.record(z.string(), accountCredentialsSchema),
  ntfyToken: z.string().min(1).optional(),
});

export type ImapCredentials = z.infer<typeof imapCredentialsSchema>;
export type AccountCredentials = Omit<
  z.infer<typeof accountCredentialsSchema>,
  "imap"
>;
export type Credentials = z.infer<typeof credentialsSchema>;

/**
 * Parse the credentials document — the only file in this system that holds a
 * secret. It is deliberately separate from `offers.config.json`: the config is
 * rendered into the world-readable Nix store, and this is not.
 */
export const parseCredentials = (raw: unknown): Credentials =>
  credentialsSchema.parse(raw);

export const credentialsFor = (
  credentials: Credentials,
  accountId: string,
): AccountCredentials => {
  const found = credentials.accounts[accountId];
  if (found === undefined) {
    throw new Error(`no credentials for account "${accountId}"`);
  } else {
    const { imap: _imap, ...login } = found;
    return login;
  }
};

export const imapCredentialsFor = (
  credentials: Credentials,
  accountId: string,
): ImapCredentials => {
  const found = credentials.accounts[accountId];
  if (found?.imap === undefined) {
    throw new Error(
      `account "${accountId}" reads codes from a mailbox but has no imap credentials`,
    );
  } else {
    return found.imap;
  }
};

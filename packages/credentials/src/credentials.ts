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
/**
 * What an issuer adapter is given: the login it types into the page, and
 * nothing else. The TOTP secret and the mailbox password serve the code ladder,
 * which the adapter reaches through `requestCode` — handing them to something
 * that drives a bank page would widen their exposure for no purpose.
 */
export type AccountCredentials = Omit<
  z.infer<typeof accountCredentialsSchema>,
  "imap" | "totpSecret"
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
    const { imap: _imap, totpSecret: _totpSecret, ...login } = found;
    return login;
  }
};

/**
 * The account's authenticator-app secret, if it has one. Separate from
 * `credentialsFor` so the secret reaches the code ladder and nothing else; an
 * account with no entry at all is a different mistake from one that simply is
 * not enrolled, and is reported as such.
 */
export const totpSecretFor = (
  credentials: Credentials,
  accountId: string,
): string | undefined => {
  const found = credentials.accounts[accountId];
  if (found === undefined) {
    throw new Error(`no credentials for account "${accountId}"`);
  } else {
    return found.totpSecret;
  }
};

export const imapCredentialsFor = (
  credentials: Credentials,
  accountId: string,
): ImapCredentials => {
  const found = credentials.accounts[accountId];
  if (found === undefined) {
    throw new Error(`no credentials for account "${accountId}"`);
  } else if (found.imap === undefined) {
    throw new Error(
      `account "${accountId}" reads codes from a mailbox but has no imap credentials`,
    );
  } else {
    return found.imap;
  }
};

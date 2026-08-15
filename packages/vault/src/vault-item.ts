import { z } from "zod";

/**
 * The slice of `bw get item` we use. Everything else the CLI prints — folder,
 * revision date, custom fields — is deliberately not parsed: the less of a
 * credential we pull into the process, the less there is to leak.
 */
const itemSchema = z.object({
  login: z.object({
    password: z.string(),
    username: z.string(),
  }),
});

export type VaultCredentials = {
  readonly username: string;
  readonly password: string;
};

/**
 * Parse a `bw get item` payload. Throws on anything else the CLI might print —
 * a "Not found." line, a secure note with no login — because a run that
 * proceeds without credentials would just hand the bank an empty form.
 */
export const parseVaultItem = (raw: string): VaultCredentials => {
  const { login } = itemSchema.parse(JSON.parse(raw));
  return { password: login.password, username: login.username };
};

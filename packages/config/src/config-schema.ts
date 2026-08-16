import { z } from "zod";

import { accountSchema } from "./account";

const ntfySchema = z.object({
  /** Topic the run's outcome — and any request for a code — is pushed to. */
  alertTopic: z.string().min(1),
  /** Topic a person publishes a code back to. */
  replyTopic: z.string().min(1),
  server: z.url().default("https://ntfy.sh"),
});

const configSchema = z
  .object({
    accounts: z.array(accountSchema).min(1),
    /**
     * Where failure screenshots and page dumps are written. These can contain
     * account details, so it defaults under the state directory rather than
     * anywhere shared.
     */
    artifactDir: z.string().default("~/.local/state/offer-adder/artifacts"),
    /**
     * Headless Chromium is easier for a bank to fingerprint, so the default is
     * a real browser — run the service under Xvfb rather than turning this on.
     */
    headless: z.boolean().default(false),
    ntfy: ntfySchema.optional(),
    /**
     * Where each account's browser profile lives. Keeping these between runs is
     * what makes a bank stop asking for a code on every login, so this must be
     * durable storage, not a tmpdir.
     */
    profileDir: z.string().default("~/.local/state/offer-adder/profiles"),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    for (const id of ids(config.accounts)) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate account id: ${id}`,
        });
      } else {
        seen.add(id);
      }
    }
  });

export type Config = z.infer<typeof configSchema>;

/**
 * Parse the account configuration. Throws on anything malformed — a run that
 * silently skipped a misconfigured account would look like a successful run
 * that had nothing to do.
 */
export const parseConfig = (raw: unknown): Config => configSchema.parse(raw);

const ids = (accounts: Config["accounts"]): readonly string[] =>
  accounts.map((account) => account.id);

import { Issuer } from "@offers/offer/issuer";
import { z } from "zod";

import { CodeSourceKind } from "./code-source-kind";

/**
 * Wire string to memory enum. The config file is a contract with the person
 * editing it, so it keeps readable strings; everything past this boundary
 * switches on the enum. See /docs/guidelines/DISCRIMINATED_UNIONS.md.
 */
const ISSUERS = {
  amex: Issuer.Amex,
  chase: Issuer.Chase,
} as const;

const issuerSchema = z
  .enum(["amex", "chase"])
  .transform((wire) => ISSUERS[wire]);

const CODE_SOURCE_KINDS = {
  imap: CodeSourceKind.Imap,
  ntfy: CodeSourceKind.Ntfy,
  prompt: CodeSourceKind.Prompt,
  totp: CodeSourceKind.Totp,
} as const;

const codeSourceKindSchema = z
  .enum(["totp", "imap", "ntfy", "prompt"])
  .transform((wire) => CODE_SOURCE_KINDS[wire]);

/**
 * Automatic sources first, and only the ones this account is equipped for.
 * `Prompt` is never in the default because the default has to work on a
 * server, where there is nobody to ask.
 */
const defaultCodeSources = (hasMailbox: boolean): readonly CodeSourceKind[] =>
  hasMailbox
    ? [CodeSourceKind.Totp, CodeSourceKind.Imap, CodeSourceKind.Ntfy]
    : [CodeSourceKind.Totp, CodeSourceKind.Ntfy];

/**
 * Where a bank's one-time code is delivered. Only the non-secret half lives
 * here; the mailbox login is in the credentials document, keyed by account id.
 *
 * It belongs to the account rather than the run because two people banking at
 * the same issuer must not read each other's codes — give each account its own
 * address (plus addressing is enough) and the ambiguity never arises.
 */
const imapSchema = z.object({
  folder: z.string().default("INBOX"),
  host: z.string(),
  port: z.number().int().positive().default(993),
  secure: z.boolean().default(true),
});

export const accountSchema = z
  .object({
    codeSources: z.array(codeSourceKindSchema).min(1).optional(),
    /** Stable slug; names this account's browser profile directory. */
    id: z.string().min(1),
    imap: imapSchema.optional(),
    issuer: issuerSchema,
    /** Shown in notifications, e.g. `"Connor · Amex"`. */
    label: z.string().min(1),
    /** Fragments identifying the issuer in a delivered message. */
    senderHints: z.array(z.string().min(1)).min(1),
  })
  .transform((account) => ({
    ...account,
    codeSources:
      account.codeSources ?? defaultCodeSources(account.imap !== undefined),
  }))
  .refine(
    (account) =>
      !account.codeSources.includes(CodeSourceKind.Imap) ||
      account.imap !== undefined,
    { message: "codeSources includes imap but no imap block is configured" },
  );

export type Account = z.infer<typeof accountSchema>;

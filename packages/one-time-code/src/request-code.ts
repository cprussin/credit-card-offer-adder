import type { CodeSource } from "./code-source";

export type CodeRequestContext = {
  readonly accountLabel: string;
  readonly senderHints: readonly string[];
  readonly now?: () => Date;
};

/**
 * Adapt a `CodeSource` into the plain "give me a code" callback an issuer
 * adapter takes.
 *
 * The stamp happens when the bank actually asks, not when the run started, so
 * a delivery channel can reject the code the *previous* account's login
 * triggered a minute earlier. No code is a failure the adapter cannot act on,
 * so this throws rather than returning a `Result` the adapter would only have
 * to re-throw.
 */
export const requestCodeWith =
  (
    source: CodeSource,
    { accountLabel, senderHints, now = () => new Date() }: CodeRequestContext,
  ): (() => Promise<string>) =>
  async () => {
    const attempt = await source.waitForCode({
      accountLabel,
      requestedAt: now(),
      senderHints,
    });
    return attempt.match({
      Err: (failure) => {
        throw new Error(
          `could not obtain a one-time code for ${accountLabel}: ${failure.reason}`,
        );
      },
      Ok: (code) => code,
    });
  };

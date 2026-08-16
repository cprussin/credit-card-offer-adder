/**
 * Flatten a thrown value into the one line that goes in a run report.
 *
 * Everything the automation reports about a failure ends up on a phone
 * notification, so the chain of `cause`s matters — Playwright's "timeout
 * exceeded" is useless without the "could not add offer" that wraps it.
 */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? withCause(error) : String(error);

const withCause = (error: Error): string =>
  error.cause === undefined
    ? error.message
    : `${error.message}: ${errorMessage(error.cause)}`;

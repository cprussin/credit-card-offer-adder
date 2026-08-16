import type { Result } from "@cprussin/option-result";

/**
 * Everything a source needs to recognize the code it is looking for. Codes are
 * short-lived and look alike, so a source must be able to reject one that
 * belongs to an earlier attempt (`requestedAt`) or to the other spouse's
 * account at the same bank (`senderHints`).
 */
export type CodeRequest = {
  /** Human-readable account, e.g. `"Connor · Amex"`. Shown when we have to ask. */
  readonly accountLabel: string;
  /** Instant the login asked for a code. Anything older belongs to a past attempt. */
  readonly requestedAt: Date;
  /** Lowercase fragments that identify the sender, e.g. `["american express"]`. */
  readonly senderHints: readonly string[];
};

export type CodeUnavailable = {
  readonly source: string;
  readonly reason: string;
};

/**
 * One way of obtaining a one-time code. Sources are ordered cheapest-and-most-
 * automatic first (see `@offers/one-time-code/chain-code-sources`), so
 * "I can't get one" is an ordinary outcome the chain moves past rather than a
 * thrown error.
 */
export type CodeSource = {
  readonly name: string;
  readonly waitForCode: (
    request: CodeRequest,
  ) => Promise<Result<string, CodeUnavailable>>;
};

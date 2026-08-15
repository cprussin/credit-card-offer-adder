import type { Result } from "@cprussin/option-result";
import { Err, Ok } from "@cprussin/option-result";
import { errorMessage } from "@offers/error-message/error-message";
import type {
  CodeRequest,
  CodeSource,
  CodeUnavailable,
} from "@offers/one-time-code/code-source";
import { selectCode } from "@offers/one-time-code/select-code";

import type { Mailbox } from "./imap-mailbox";

/**
 * Both banks deliver within seconds. Each poll is its own IMAP login, so a
 * slower cadence keeps a two-minute wait from looking like a login attack.
 */
const DEFAULT_POLL_INTERVAL_MS = 10_000;

/** Past two minutes the code is closer to expiring than to arriving. */
const DEFAULT_TIMEOUT_MS = 120_000;

export type ImapCodeSourceOptions = {
  readonly mailbox: Mailbox;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
};

/**
 * The source that makes unattended running possible: read the code out of a
 * mailbox the bank delivers to.
 *
 * Both issuers can send a one-time code to email, and a carrier or phone rule
 * that forwards the SMS to the same mailbox brings the SMS-only case here too —
 * so in the steady state nobody has to be awake for a run.
 *
 * `now` and `sleep` are injected so the polling schedule is testable without
 * real elapsed time.
 */
export const imapCodeSource = ({
  mailbox,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
  sleep = defaultSleep,
}: ImapCodeSourceOptions): CodeSource => ({
  name: "imap",
  waitForCode: async (request) => {
    try {
      return await pollUntilFound(
        mailbox,
        request,
        { now, pollIntervalMs, sleep },
        now().getTime() + timeoutMs,
        timeoutMs,
      );
    } catch (error) {
      return Err({ reason: errorMessage(error), source: "imap" });
    }
  },
});

type PollSchedule = {
  readonly pollIntervalMs: number;
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
};

const pollUntilFound = async (
  mailbox: Mailbox,
  request: CodeRequest,
  schedule: PollSchedule,
  deadlineMs: number,
  timeoutMs: number,
): Promise<Result<string, CodeUnavailable>> => {
  const delivered = await mailbox.recentMessages(request.requestedAt);
  const code = selectCode(delivered, request);
  return code.match<Promise<Result<string, CodeUnavailable>>>({
    None: async () => {
      await schedule.sleep(schedule.pollIntervalMs);
      return schedule.now().getTime() >= deadlineMs
        ? Err({
            reason: `no code arrived within ${Math.round(timeoutMs / 1000)}s`,
            source: "imap",
          })
        : pollUntilFound(mailbox, request, schedule, deadlineMs, timeoutMs);
    },
    Some: (value) => Promise.resolve(Ok(value)),
  });
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

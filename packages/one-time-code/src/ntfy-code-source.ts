import type { Result } from "@cprussin/option-result";
import { Err, Ok } from "@cprussin/option-result";
import { errorMessage } from "@offers/error-message/error-message";
import type { NtfyClient } from "@offers/ntfy/ntfy-client";

import type { CodeRequest, CodeSource, CodeUnavailable } from "./code-source";

/**
 * How long an unattended run waits for a person to answer before giving up on
 * the account and moving to the next one. Bank codes expire in around ten
 * minutes; waiting longer would just burn the code.
 */
const DEFAULT_TIMEOUT_MS = 300_000;

/** The reply topic carries nothing but codes, so a bare digit run is enough. */
const CODE_PATTERN = /\b(\d{4,8})\b/;

export type NtfyCodeSourceOptions = {
  readonly client: NtfyClient;
  /** Topic the request for a code is pushed to. */
  readonly alertTopic: string;
  /** Topic the answer is expected on. */
  readonly replyTopic: string;
  readonly timeoutMs?: number;
};

/**
 * Ask a phone for the code a bank would only send by SMS.
 *
 * This is the bridge between "fully unattended" and "the bank refuses to
 * deliver a code anywhere we can read": the run pushes a notification and waits
 * for someone to publish the digits back to the reply topic, which the ntfy app
 * can do from the notification itself. It is still one tap of manual work, so
 * it belongs after the mailbox in a chain, never before it.
 */
export const ntfyCodeSource = ({
  client,
  alertTopic,
  replyTopic,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: NtfyCodeSourceOptions): CodeSource => ({
  name: "ntfy",
  waitForCode: async (request) => {
    try {
      await client.publish({
        message: requestMessage(request, replyTopic),
        title: "Bank code needed",
        topic: alertTopic,
      });
      return await firstPublishedCode(client, replyTopic, request, timeoutMs);
    } catch (error) {
      return Err({ reason: errorMessage(error), source: "ntfy" });
    }
  },
});

const requestMessage = (request: CodeRequest, replyTopic: string): string =>
  `${request.accountLabel} needs a one-time code. Reply with the digits on the "${replyTopic}" topic.`;

const firstPublishedCode = async (
  client: NtfyClient,
  replyTopic: string,
  request: CodeRequest,
  timeoutMs: number,
): Promise<Result<string, CodeUnavailable>> => {
  const subscription = client.subscribe(replyTopic, {
    signal: AbortSignal.timeout(timeoutMs),
    since: request.requestedAt,
  });
  for await (const published of subscription) {
    const code = CODE_PATTERN.exec(published.message)?.[1];
    if (code !== undefined) {
      return Ok(code);
    }
  }
  return Err({
    reason: `no code was published to ${replyTopic}`,
    source: "ntfy",
  });
};

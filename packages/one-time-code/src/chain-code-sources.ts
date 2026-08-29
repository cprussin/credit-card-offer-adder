import type { Result } from "@cprussin/option-result";
import { Err, Ok } from "@cprussin/option-result";

import type { CodeRequest, CodeSource, CodeUnavailable } from "./code-source";

/**
 * Try each source in turn and take the first code anyone produces.
 *
 * Order is the whole point: put the sources that need no human first (a TOTP
 * secret we hold, a mailbox we can poll) and the ones that interrupt
 * someone last, so an unattended run only reaches a person when the automatic
 * paths are genuinely exhausted. When nobody produces a code the failure names
 * every source and why it came up empty — that message is the only clue we get
 * about a run that stalled at 3am.
 */
export const chainCodeSources = (
  sources: readonly CodeSource[],
): CodeSource => ({
  name: chainName(sources),
  waitForCode: (request) => firstAvailable(sources, request, []),
});

const chainName = (sources: readonly CodeSource[]): string =>
  sources.length === 0
    ? "empty chain"
    : sources.map((source) => source.name).join(" -> ");

const firstAvailable = async (
  sources: readonly CodeSource[],
  request: CodeRequest,
  failures: readonly CodeUnavailable[],
): Promise<Result<string, CodeUnavailable>> => {
  const [next, ...rest] = sources;
  if (next === undefined) {
    return Err(exhausted(failures));
  } else {
    const attempt = await next.waitForCode(request);
    return attempt.match<Promise<Result<string, CodeUnavailable>>>({
      Err: (failure) => firstAvailable(rest, request, [...failures, failure]),
      Ok: (code) => Promise.resolve(Ok(code)),
    });
  }
};

const exhausted = (failures: readonly CodeUnavailable[]): CodeUnavailable =>
  failures.length === 0
    ? { reason: "no code sources configured", source: "empty chain" }
    : {
        reason: failures
          .map((failure) => `${failure.source}: ${failure.reason}`)
          .join("; "),
        source: failures.map((failure) => failure.source).join(" -> "),
      };

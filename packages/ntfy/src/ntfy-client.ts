import type { NtfyMessage } from "./ntfy-message";
import { parseNtfyLine } from "./ntfy-message";

export type NtfyConfig = {
  /** Base URL of the ntfy server, e.g. `https://ntfy.sh`. */
  readonly server: string;
  /** Access token for a protected topic, or `undefined` for an open one. */
  readonly token: string | undefined;
};

export type NtfyPublication = {
  readonly topic: string;
  readonly title: string;
  readonly message: string;
};

export type NtfySubscription = {
  /** Only deliver messages published at or after this instant. */
  readonly since: Date;
  readonly signal: AbortSignal;
};

/**
 * The subset of `fetch` this module needs. Kept minimal so a test can pass a
 * plain stub without reconstructing `fetch`'s full surface.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type NtfyClient = {
  readonly publish: (publication: NtfyPublication) => Promise<void>;
  readonly subscribe: (
    topic: string,
    subscription: NtfySubscription,
  ) => AsyncIterable<NtfyMessage>;
};

/**
 * ntfy is how an unattended run reaches a phone: it pushes the run's outcome,
 * and — when a bank insists on a code no automatic source can supply — it is
 * also the channel someone answers on by publishing the code back to a topic.
 */
export const ntfyClient = (
  config: NtfyConfig,
  fetchImpl: FetchLike = fetch,
): NtfyClient => ({
  publish: async ({ topic, title, message }) => {
    const response = await fetchImpl(`${config.server}/${topic}`, {
      body: message,
      headers: { ...authHeader(config), Title: title },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `ntfy publish to ${topic} failed with status ${response.status}`,
      );
    }
  },
  subscribe: (topic, subscription) =>
    streamMessages(config, fetchImpl, topic, subscription),
});

const authHeader = (config: NtfyConfig): Record<string, string> =>
  config.token === undefined ? {} : { Authorization: `Bearer ${config.token}` };

/**
 * A generator rather than a callback or an array: the caller waits on a live
 * connection for as long as it takes someone to type a code, and must be able
 * to stop consuming the moment one arrives.
 */
const streamMessages = async function* (
  config: NtfyConfig,
  fetchImpl: FetchLike,
  topic: string,
  { since, signal }: NtfySubscription,
): AsyncIterable<NtfyMessage> {
  const seconds = Math.floor(since.getTime() / 1000);
  const response = await fetchImpl(
    `${config.server}/${topic}/json?since=${seconds}`,
    { headers: authHeader(config), signal },
  );
  if (response.ok) {
    for await (const line of readLines(response)) {
      const message = parseNtfyLine(line);
      const delivered = message.match({
        None: () => [],
        Some: (value) => [value],
      });
      yield* delivered;
    }
  } else {
    throw new Error(
      `ntfy subscription to ${topic} failed with status ${response.status}`,
    );
  }
};

/** Reassemble newline-delimited records from a chunked byte stream. */
const readLines = async function* (response: Response): AsyncIterable<string> {
  const body = response.body;
  if (body === null) {
    throw new Error("ntfy subscription returned no body");
  } else {
    const decoder = new TextDecoder();
    let buffered = "";
    for await (const chunk of body) {
      buffered += decoder.decode(chunk, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      yield* lines.filter((line) => line.trim().length > 0);
    }
    if (buffered.trim().length > 0) {
      yield buffered;
    }
  }
};

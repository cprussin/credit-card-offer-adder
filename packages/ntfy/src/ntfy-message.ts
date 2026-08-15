import type { Option } from "@cprussin/option-result";
import { None, Some } from "@cprussin/option-result";
import { z } from "zod";

/**
 * ntfy's JSON stream interleaves the messages we care about with connection
 * bookkeeping. `time` is unix seconds.
 */
const eventSchema = z.object({
  event: z.enum(["open", "keepalive", "message", "poll_request"]),
  id: z.string(),
  message: z.string().optional(),
  time: z.number(),
  title: z.string().optional(),
});

export type NtfyMessage = {
  readonly id: string;
  readonly message: string;
  readonly receivedAt: Date;
  readonly title: string | undefined;
};

/**
 * Parse one line of ntfy's newline-delimited JSON stream. `None` means the line
 * was connection bookkeeping (an `open` or a keepalive), not a message. A line
 * that is not an ntfy event at all — an HTML error page from a proxy, say —
 * throws, because silently treating it as "no messages" would turn a broken
 * server into an eternal wait.
 */
export const parseNtfyLine = (line: string): Option<NtfyMessage> => {
  const event = eventSchema.parse(JSON.parse(line));
  return event.event === "message" && event.message !== undefined
    ? Some({
        id: event.id,
        message: event.message,
        receivedAt: new Date(event.time * 1000),
        title: event.title,
      })
    : None();
};

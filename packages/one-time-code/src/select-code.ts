import type { Option } from "@cprussin/option-result";
import { None, Some } from "@cprussin/option-result";

import type { CodeRequest } from "./code-source";

/**
 * Mail servers and phones disagree with us about the time by a few seconds.
 * A minute of slack is far shorter than a code's lifetime, so it cannot let a
 * previous attempt's code through.
 */
const CLOCK_SKEW_MS = 60_000;

/**
 * Ordered from most to least specific. Both banks put the digits next to the
 * word "code", and requiring six digits keeps a card's last four ("card ending
 * 1009") from being mistaken for one.
 */
const CODE_PATTERNS = [
  /\b(\d{6,8})\b\s+is\s+your\b/i,
  /\b(?:code|passcode|pin|otp)\b\D{0,40}?\b(\d{6,8})\b/i,
];

/** A message that might be carrying a code — an email, an SMS, a push reply. */
export type DeliveredMessage = {
  readonly from: string;
  readonly receivedAt: Date;
  readonly text: string;
};

/**
 * Pick the code for `request` out of whatever a delivery channel is holding.
 *
 * Pure so the tricky part — telling this login's code from the one the last run
 * triggered, or from the code the other account at the same bank just got — is
 * unit-testable without a mailbox.
 */
export const selectCode = (
  messages: readonly DeliveredMessage[],
  request: CodeRequest,
): Option<string> => {
  const earliest = request.requestedAt.getTime() - CLOCK_SKEW_MS;
  const codes = messages
    .filter((message) => message.receivedAt.getTime() >= earliest)
    .filter((message) => isFromExpectedSender(message, request.senderHints))
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .flatMap((message) => extractCode(message.text));
  const newest = codes[0];
  return newest === undefined ? None() : Some(newest);
};

const isFromExpectedSender = (
  message: DeliveredMessage,
  senderHints: readonly string[],
): boolean => {
  const haystack = `${message.from}\n${message.text}`.toLowerCase();
  return senderHints.some((hint) => haystack.includes(hint.toLowerCase()));
};

const extractCode = (text: string): readonly string[] =>
  CODE_PATTERNS.flatMap((pattern) => {
    const match = pattern.exec(text);
    const code = match?.[1];
    return code === undefined ? [] : [code];
  }).slice(0, 1);

# `@cprussin/option-result`

`Result<T, E>` and `Option<T>` from `@cprussin/option-result` are the
project's vocabulary for "this can fail" and "this might be absent." They make
failure paths visible at the type level instead of hiding them in thrown
values or sentinel `undefined`s. This is the companion doc to
[code offensively](/docs/guidelines/ERRORS.md) — load both when you design or modify a
fallible API, a parser, or a tool.

## When to return `Result<T, E>`

Return `Result` when a function's failure mode is part of its contract —
something the caller is expected to handle, not an unrecoverable bug:

- **Operations that cross a process / network boundary**, where a thrown
  error can't propagate cleanly (remote tool calls, transport failures).
- **Parsers and deserializers** that can fail on bad input.
- **Expected, recoverable outcomes** the caller must decide about.

The canonical example is the run path. `runAccount`
([`@offers/offer-run/run-account`](../../packages/offer-run/README.md))
returns `Result<AccountReport, AccountError>`: it never throws, it resolves
`Ok(report)` or `Err(AccountError.LoginFailed(…))`,
`Err(AccountError.TwoFactorUnavailable(…))`, or
`Err(AccountError.SurfaceUnavailable(…))`. The run loop branches on the
outcome so one broken account still lets the other three finish.

The point is to force the call site to choose between `Ok` and `Err` with a
`.match`, `.map`, `.mapErr`, etc., so failure handling can't be silently
forgotten.

## When NOT to return `Result`

- **Programmer errors / invariant violations** — keep throwing. A `Result`
  is for paths the caller is meant to recover from; an assertion failure or a
  "this should be unreachable" is not. See
  [code offensively](/docs/guidelines/ERRORS.md).
- **Internal helpers whose only failure is a bug** — don't wrap pure logic in
  `Result` just to be defensive.

## When to use `Option<T>`

Prefer `Option<T>` over `T | undefined` when the absence is meaningful and the
caller should be forced to handle both cases. For idiomatic-TS
"missing-optional-parameter" situations, plain `undefined` is still fine (see
[/docs/guidelines/CONTROL_FLOW.md](/docs/guidelines/CONTROL_FLOW.md#null-vs-undefined)).

## Working with `Result`

The exported shape is small. Common patterns:

```ts
import { Err, Ok, type Result } from "@cprussin/option-result";

// constructors
const ok = Ok(value);
const err = Err(OfferError.AddRejected("button never settled"));

// branch on the variant (returns whatever the arms return)
result.match({
  Ok: (value) => render(value),
  Err: (error) => renderError(error),
});

// transform the Ok / the Err, leaving the other side untouched
result.map((value) => transform(value));
result.mapErr((error) => AccountError.Timeout(durationMs));

// chain Result-returning work, short-circuiting on the first Err
result.andThen((value) => anotherFallibleStep(value));
await result.andThenAsync(async (value) => anotherFallibleStep(value));

// pull the Ok out, with a fallback for the Err
const value = result.unwrapOr(fallback);
```

Use `isOk()` / `isErr()` for boolean checks (e.g. in `expect` assertions).
The `.match` form is for when you need a value out of both arms; the
`andThen` / `map` chain is preferable when the work is a pipeline.

Construct results with `Ok` / `Err` — never hand-roll a `{ ok: true, … }`
object. Tests assert on outcomes the same way: build the expected
`Ok(value)` / `Err(error)` and compare, or branch with `.match` / `isOk()`.

## Domain error unions

An `E` that crosses a real boundary is a tagged union with a factory object,
not a bare `Error`. `OfferError` (`@offers/offer/offer-error`) and the run
loop's `AccountError` (`@offers/offer-run/account-error`) are the examples:
each variant has a `type` discriminant and a factory
(`OfferError.AddRejected`, `OfferError.AlreadyAdded`,
`AccountError.LoginFailed`, `AccountError.Timeout`, …).

- When the error crosses the wire — a persisted run report, a payload sent
  to a notifier — back the union with a Zod schema so it parses at the
  boundary per
  [/docs/guidelines/DATA.md](/docs/guidelines/DATA.md). Variants that never leave the process
  don't need a schema.
- Branch on the error with a `switch` on `error.type` and **no `default`
  arm**, so adding a variant is a compile error until every consumer handles
  it (see [/docs/guidelines/CONTROL_FLOW.md](/docs/guidelines/CONTROL_FLOW.md#prefer-switch-over-ifelse-if-chains)).

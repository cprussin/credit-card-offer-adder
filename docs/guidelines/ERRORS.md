# Errors & failure handling

How failures are surfaced, propagated, and handled. The governing principle
is **code offensively**: assume nothing, fail loudly. See also
[/docs/guidelines/DATA.md](/docs/guidelines/DATA.md) for parsing external data at the boundary.

## Code offensively

**Code offensively** (a.k.a. *offensive programming* / *fail-fast*) — assume
nothing, blow up loudly when assumptions break.

**Hard rule — PR blocker.** Defensive guards and silent failure are not
allowed. Fail loudly: loud failures are debuggable, silent ones rot the
system.

- **Throw on unexpected conditions.** If the invariants say it can't happen,
  throw. An unreachable branch is a bug; treat it like one.
- **No catch-and-swallow.** If you `catch`, you must (a) re-throw (optionally
  wrapped with context), (b) convert to a `Result<T, E>` from
  `@cprussin/option-result` the caller is forced to handle (see
  [/docs/guidelines/OPTION_RESULT.md](/docs/guidelines/OPTION_RESULT.md)), or (c) log **and** take a
  real recovery action — an action that restores the system to a valid state
  distinct from the error
  (e.g. retry the operation, fall back to a cached value the caller
  explicitly opted into, roll back a partial write). "Log and return
  `undefined`/a fallback" is NOT recovery — it's catch-and-swallow with a log
  line on top. Empty `catch` blocks, or `catch` arms that return a fallback
  to hide the failure, are forbidden.
- **No defensive checks for impossible conditions.** Don't add
  `if (x === undefined) return;` guards on values the type system already
  guarantees. If the type allows the bad case, fix the type — don't paper
  over it at every call site.
- **No silent fallbacks.** Returning `undefined`, `null`, `[]`, `0`, or a
  "sensible default" in place of an error is silent failure. Throw, or return
  a `Result<T, E>` the caller is forced to handle (see
  [Result types](#result-types) below and
  [/docs/guidelines/OPTION_RESULT.md](/docs/guidelines/OPTION_RESULT.md)).
- **Validate at boundaries, trust internally.** External data is parsed once
  at the edge (see [/docs/guidelines/DATA.md](/docs/guidelines/DATA.md)). Internal callers do not
  re-validate what the type system already proves.

```ts
// wrong — catch and swallow
try {
  return parseVaultItem(raw);
} catch {
  return undefined;
}

// correct — at the call site (producer throws and we can't change it)
try {
  return parseVaultItem(raw);
} catch (error) {
  throw new Error(`failed to parse vault item ${id}`, { cause: error });
}

// wrong — defensive guard on a non-nullable parameter
const greet = (user: User) => {
  if (user === undefined) {
    return;
  } else {
    return user.name;
  }
};

// wrong — silent fallback that hides a failed lookup
const adapter = adapters.get(issuer) ?? createNoopAdapter();

// correct — fail loudly on the invariant violation
const lookupAdapter = (issuer: Issuer): IssuerAdapter => {
  const entry = adapters.get(issuer);
  if (entry === undefined) {
    throw new Error(`no adapter registered for issuer: ${issuer}`);
  } else {
    return entry;
  }
};
```

### `async`/`await` and `try`/`catch`

An `await` inside `try { ... } catch (e) { ... }` is governed by this rule
the same way a synchronous `throw` is: the `catch` arm must re-throw (with
context), convert the failure to a domain result, or take a real recovery
action. Awaiting in a `try` does not buy the catch arm any extra license to
swallow.

```ts
// wrong — async catch-and-swallow
const loadCredentials = async (id: ItemId): Promise<Credentials | undefined> => {
  try {
    return await fetchVaultItem(id);
  } catch {
    return undefined;
  }
};

// correct — re-throw with context
const loadCredentials = async (id: ItemId): Promise<Credentials> => {
  try {
    return await fetchVaultItem(id);
  } catch (error) {
    throw new Error(`failed to load vault item ${id}`, { cause: error });
  }
};
```

### Forbidden

- `try { ... } catch { return <fallback> }` — converting an exception into a
  silent default.
- `catch (e) {}` or `catch { /* ignore */ }` — empty catches of any form.
- `if (x === undefined) return;` on parameters the type system already says
  cannot be `undefined`/`null`/`false`.
- `?? <fallback>` or `|| <fallback>` used to paper over a *failure* (as
  opposed to a genuinely optional value with a meaningful default — see
  "Allowed" below).
- Returning sentinel values (`-1`, `""`, `NaN`, boolean success flags) to
  signal "didn't work". Throw or return a `Result`.

### Allowed: defaults for genuinely-optional values

`?? defaultValue` and `|| defaultValue` are fine when the absent value is a
*legitimate optional configuration* with a meaningful default — React prop
defaults, theme fallbacks, optional config. The rule applies only when the
absent value indicates a *failure*.

```ts
// OK — optional prop with a default
const Button = ({ label = "Submit" }: Props) => <button>{label}</button>;

// OK — optional config with a default
const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

// wrong — papering over a failed lookup
const adapter = adapters.get(issuer) ?? createNoopAdapter();
```

## Result types

When a function's failure mode is part of its contract — something the caller
is expected to handle, not an unrecoverable bug — return a `Result<T, E>` from
`@cprussin/option-result` the caller must branch on, rather than throwing or
returning a sentinel. The full rules for when (and how) to reach for `Result`
/ `Option` live in [/docs/guidelines/OPTION_RESULT.md](/docs/guidelines/OPTION_RESULT.md).

The canonical example is the issuer path: `addOffers` returns
`Result<OfferAdded, OfferError>` per offer from
[`@offers/offer-run/add-offers`](../../packages/offer-run/README.md). One
offer that refuses to add must not abort the other twenty on the same card,
so the failure is a value the caller branches on rather than an exception
that unwinds the run.

Keep throwing for **programmer errors / invariant violations** — an
assertion failure or a "this should be unreachable" is a bug, not a contract.
Don't wrap pure internal logic in a `Result` just to be defensive.

## Promise error handling

Fire-and-forget rejections are a form of catch-and-swallow; this is the
concrete shape of "code offensively" for promises.

**Never `void promise()`.** Discarding with `void` turns any rejection into
an unhandled rejection at runtime with no developer-visible signal. Attach
`.catch` instead — almost always log the error.

```ts
// correct — log the error
closeSession().catch((error: unknown) => {
  // biome-ignore lint/suspicious/noConsole: surfacing background failure
  console.error("Failed to close browser session", error);
});

// only when you genuinely do not care:
closeSession().catch(() => {
  /* no-op */
});
```

If you `await` the promise or pass an `onRejected` to `.then`, no separate
`.catch` is needed.

### Forbidden

- `void somePromise()` for any reason. There is no exception — the no-op
  `.catch(() => {})` form is the way to fire-and-forget.
- Omitting the `.catch` on fire-and-forget promises ("the caller will handle
  it" — they won't; this is a fire-and-forget by definition).
- Swallowing the error silently when an empty `.catch` is not warranted. If
  you have any reason to care that the promise rejected, log it.

Biome's `noConsole` rule will fire on the `console.error`; add
`// biome-ignore lint/suspicious/noConsole: <reason>` immediately above it
with a real reason.

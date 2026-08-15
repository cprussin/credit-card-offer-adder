# AGENTS

Index of context files for this TypeScript monorepo (`apps/*`,
`packages/*`). Each entry is tagged with an authority level so its weight is
unambiguous.

## Authority levels

- **ALWAYS** — load and read in full before any work. No exceptions for size,
  urgency, familiarity, or "trivial" edits. Skipping an ALWAYS doc is a
  protocol violation, not a judgment call.
- **IF TOUCHED** — required when your change touches the topic. The decision
  is "does my change touch the topic," not "do I feel like reading this." If
  touched, load in full.
- **REFERENCE** — look up as needed during the work; not a prerequisite to
  start.

If a doc's own wording disagrees with these labels, the labels here win —
update the doc.

## Post-edit audit (non-negotiable)

After finishing edits — and before declaring a change done or opening a
PR — re-load the guideline docs that apply to what you just changed and walk
the actual diff against each rule. This is a protocol step, not a judgment
call. A change shipped without this audit is unacceptable, regardless of
size, urgency, or familiarity. "Lint and tests passed" is not a substitute:
many style rules are not lint-enforced.

**This audit runs on EVERY code change, not just the first.** It is not
enough to check compliance once when opening the PR. Every later change —
addressing review feedback, fixing CI, a follow-up tweak, a one-line
amendment — requires you to re-review which guidelines are appropriate for
*that* change and re-check *that* change against them. Which docs are in
scope can shift as the diff grows: a follow-up edit may touch a topic the
original change did not, pulling a new **IF TOUCHED** doc into scope. Redo
the "which docs apply" determination from scratch for each change; do not
assume the earlier audit still covers you.

To decide *which* docs apply, re-read the authority labels below with your
diff in hand:

- Every **ALWAYS** doc is in scope.
- Every **IF TOUCHED** doc whose topic your change actually touches is in
  scope. Be honest about "touched": if you added or modified any `if`/`else`,
  you touched control flow; if you added a parameter for testability, you
  touched testing's dependency-injection rules; if you read a bank page, you
  touched the automation rules; etc.
- Any per-package addenda (`{package}/docs/AGENTS.md`) for packages you
  modified are in scope.

Walk each rule in scope against your actual diff. Memory is not a substitute
for re-reading.

## PR description requirement

Every PR description MUST include an explicit "Guidelines audited" line
listing the docs reviewed and confirming the change complies. Example:

> **Guidelines audited:** `docs/guidelines/CONTROL_FLOW.md`,
> `docs/guidelines/ERRORS.md`, `docs/guidelines/TESTING.md`. Change complies
> with all rules.

If a rule deserves a note (intentional deviation, ambiguous case, etc.), call
it out below the line. A PR without this line is incomplete.

## ALWAYS (every change, no exceptions)

These apply to every TS file you write or modify — bug fixes, one-line
changes, refactors, and "trivial" edits included.

| Doc | Covers |
|---|---|
| [/docs/guidelines/TESTING.md](/docs/guidelines/TESTING.md) | **TDD is mandatory.** Failing test first, then the minimum production code to make it pass. Parsimonious coverage, unit over integration, dependency injection over mocking, never widen exports for tests, warnings are failures. |
| [/docs/guidelines/ERRORS.md](/docs/guidelines/ERRORS.md) | **Code offensively** (PR-blocker): no defensive guards, no catch-and-swallow, no silent fallbacks; throw or return a `Result`. Promise error handling (never `void promise()`). |
| [/docs/guidelines/CONTROL_FLOW.md](/docs/guidelines/CONTROL_FLOW.md) | `undefined` over `null`, explicit `undefined` checks, curly braces always, explicit control flow, ternaries, no unnecessary `let`, `switch` over `if`/`else if`. |
| [/docs/guidelines/FUNCTIONS.md](/docs/guidelines/FUNCTIONS.md) | Functional/immutable/declarative defaults, arrow syntax, docstrings, manual loops over generators. |
| [/docs/guidelines/FILES.md](/docs/guidelines/FILES.md) | File/directory organization: top-to-bottom reading order, import from defining modules, no grab-bag names, prefer module-scoped functions. |

## IF TOUCHED (load when your change touches the topic)

| Doc | Load when |
|---|---|
| [/docs/guidelines/AUTOMATION.md](/docs/guidelines/AUTOMATION.md) | You drive a bank page, handle a secret, or touch the browser session. Ports-and-adapters split, semantic locators only, secrets never logged, read-only outside the offers surface. |
| [/docs/guidelines/DATA.md](/docs/guidelines/DATA.md) | You read external data — CLI output, IMAP messages, `JSON.parse`, config files, env vars. Never `as`-cast; parse with Zod. Versioning rules for contracts that cross deploy units. |
| [/docs/guidelines/DISCRIMINATED_UNIONS.md](/docs/guidelines/DISCRIMINATED_UNIONS.md) | You define or modify a discriminated union. Enum discriminant + PascalCase constructor object + type derived via `ReturnType`; the memory format always uses enums; map to wire strings in an explicit serializer/deserializer (Zod codec) at the boundary. |
| [/docs/guidelines/OPTION_RESULT.md](/docs/guidelines/OPTION_RESULT.md) | You design or modify a fallible API or a parser. When to return `Result<T, E>` / `Option<T>` from `@cprussin/option-result` instead of throwing or returning `undefined`, and how to work with them. |
| [/docs/guidelines/DESIGN_DOCS.md](/docs/guidelines/DESIGN_DOCS.md) | You author or modify a design doc in /docs/architecture/. Be concise and direct: lead with the answer, show don't describe, decisions not musings, cut filler and RFC ceremony. |

## REFERENCE

| Doc | Covers |
|---|---|
| [/docs/guidelines/WORKSPACE.md](/docs/guidelines/WORKSPACE.md) | Tools (bun, turbo, biome), workspace layout, package READMEs, dependency policy, and the required-checks workflow you run before a PR. |
| [/docs/DEPLOYMENT.md](/docs/DEPLOYMENT.md) | Getting a run onto a server: host requirements, the systemd units in `/deploy`, the NixOS flake and module, secrets handling, and what to do when a scheduled run fails. Not a guideline — it imposes no rules. |

## Architecture & design docs

These live in [`/docs/architecture/`](/docs/architecture/) and are **not**
guidelines — they carry no authority level and impose no rules. They describe
how a part of the system is (or will be) built. Read the relevant one when
working in its area; it is context, not compliance.

| Doc | Covers |
|---|---|
| [/docs/architecture/OFFER_AUTOMATION.md](/docs/architecture/OFFER_AUTOMATION.md) | End-to-end design: how a scheduled run turns four configured accounts into added offers — the credential path through Vaultwarden, the persistent browser profile that keeps 2FA rare, the one-time-code ladder that resolves the codes we still get asked for, the issuer adapter port, and the run report. |

## Per-package addenda

When working on any package in `/apps/` or `/packages/`, you MUST check for
and load package-specific agent instructions in `{package}/docs/AGENTS.md`,
if such a file exists. These hold rules specific to the package and augment —
never weaken — the root docs. On conflict, package rules win. They are
addenda-only: they do not relist root rules; assume you have already loaded
them.

DO NOT proceed with any changes until the relevant files are loaded and
understood.

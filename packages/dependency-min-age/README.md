# @offers/dependency-min-age

CI guard that enforces the repo's **minimum release age** policy for
third-party dependencies.

The root `bunfig.toml` sets Bun's `minimumReleaseAge`, so a clean
`bun install` refuses npm versions published within the window (supply-chain
hardening — a freshly-published malicious version can't be pulled in before
the community has time to flag it). But Bun **silently grandfathers versions
already present in `bun.lock`** ([oven-sh/bun#30525]), so a too-new version
that lands in the lockfile via a manual bump is never re-checked. This package
closes that gap.

## What it checks

For every dependency pinned in the root `package.json` `catalog` block, the
check reads the **resolved** version (from `node_modules`), looks up its npm
publish date, and fails if that version is younger than `minimumReleaseAge`.
Names listed in `minimumReleaseAgeExcludes` are skipped, as are catalog entries
that aren't installed.

Only the catalog (the versions we pin directly) is checked; transitive
versions are filtered by Bun itself on a clean resolve.

## Running

From the repo root, as part of the test suite:

```sh
bun run turbo test        # includes //#test:dependency-min-age
```

Or directly:

```sh
bun packages/dependency-min-age/src/check.ts
```

It exits non-zero and lists the offending `name@version` (with age vs. the
threshold) when a pinned version is too new. The fix is to downgrade the
catalog entry to the newest version published at least `minimumReleaseAge`
ago.

## Modules

- [`find-violations`](./src/find-violations.ts) — pure core: given dated
  dependencies + the threshold, return the ones that are too new.
- [`config`](./src/config.ts) — parse `minimumReleaseAge` /
  `minimumReleaseAgeExcludes` out of `bunfig.toml`.
- [`catalog`](./src/catalog.ts) — read the catalog dependency names from
  `package.json`.
- [`npm-registry`](./src/npm-registry.ts) — look up a version's publish date.
- [`check`](./src/check.ts) — the CLI wiring the above against the real repo.

## Testing

```sh
bun run --filter @offers/dependency-min-age test:unit
bun run --filter @offers/dependency-min-age test:types
```

[oven-sh/bun#30525]: https://github.com/oven-sh/bun/issues/30525

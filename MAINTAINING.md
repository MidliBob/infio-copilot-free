# Maintaining Infio Copilot Free

Internal guide for maintainers: repository layout, builds, releases, catalog
submission and the roadmap. Users want features/install? See
[README.md](README.md).

## Project identity

| What | Value |
|---|---|
| Plugin id | `infio-copilot-free` (must equal the plugin folder name) |
| Display name | Infio Copilot Free |
| Author | MidliBob |
| Repository | github.com/MidliBob/infio-copilot-free |
| License | MIT (lineage: Infio Copilot © Felix.D ← Smart Composer © Heesu Suh) |
| Current version | see `manifest.json` / `package.json` / `versions.json` |

Identity strings in code:

- UI css classes and view types use the `icf-` prefix (`icf-chat-view`, …).
- The settings tab id and plugin-folder lookups use the manifest id.
- The PGlite database intentionally keeps the legacy storage name `infio-db`
  (data continuity for upgraders). Do not rename it without a migration plan.
- The Infio *cloud provider* integration (api.infio.app, `infioProvider`,
  `INFIO_BASE_URL`, `use-infio.ts`, the built-in MCP server, the Pro
  modal) was removed in phase 0.1 - the upstream service is dead. New
  installs default to Ollama (chat/insight/apply) and LocalProvider
  (embeddings); stored Infio selections are remapped by the 0.6 settings
  migration.
- `Infio*` identifiers that remain (`InfioSettings`, `parseInfioSettings`,
  `InfioPlugin`, the `infio-db` storage name) are historical type/brand
  names, not service references - keep them for data continuity.

## Build

Requirements: Node 20 (`.nvmrc`), pnpm 12 (matches CI and the release
workflow; `pnpm-workspace.yaml` carries the pnpm 12 settings).

```bash
pnpm install
pnpm build               # tsc -noEmit -skipLibCheck + esbuild production -> main.js
pnpm copy-pglite-assets  # node_modules/@electric-sql/pglite/dist -> pglite-assets/
pnpm test
```

Notes:

- `tsc` needs a lot of heap on small machines:
  `NODE_OPTIONS=--max-old-space-size=6144 pnpm build`.
- PGlite assets are NOT bundled into main.js (that would add ~19 MB and blow
  up esbuild's memory). They ship as separate files and are read at runtime
  from the plugin folder; CDN mirrors (jsDelivr → npmmirror → unpkg) are the
  fallback. When bumping `@electric-sql/pglite`, update the version in three
  places: `package.json`, `PGLITE_CDN_BASES` in `src/pgworker/pglite.worker.ts`
  and `PGLITE_VERSION` in `scripts/copy-pglite-assets.mjs`.
- Locales live in `src/lang/locale/*.ts` and are compiled into the bundle
  (no runtime locale files).
- `scripts/mcp-stdio-unref-patch.js` is a build-time vendor patch wired into
  `esbuild.config.mjs`: MCP SDK 1.30.0 closes stdio transports with an
  unguarded `setTimeout(...).unref()`, which throws in the Obsidian renderer
  (DOM `setTimeout` returns a number), aborting the child-process kill
  sequence and orphaning processes on every restart. The plugin rewrites the
  unguarded call sites in the bundled `client/stdio.js` to a typeof-guarded
  helper and prints a build warning if a future SDK changes the call shape.
  Once the SDK guards the call itself the plugin no-ops and can be deleted.
  Regression suite: `scripts/mcp-stdio-unref-patch.test.js`.
- `pnpm test` output must stay free of `● Console` blocks. Suites that exercise
  an error path on purpose (bad HTTP status, unreachable YaCy peer, corrupt
  stored settings, ...) mock the logging facade with
  `jest.mock('<relative path>/logger')` - the manual mock lives in
  `src/utils/__mocks__/logger.ts` - and then assert on
  `jest.mocked(logger).error/warn/info`. A diagnostic that is printed instead of
  asserted on is a diagnostic nobody checks.

## Release checklist

1. Update `CHANGELOG.yaml` (sections `features` / `fixes` / `improvements` /
   `other`; the generator `.github/scripts/get-changelog.js` renders them into
   the release notes).
2. Bump the version in `manifest.json`, `package.json`, `versions.json`
   (`npm run version` syncs manifest+package from versions.json conventions —
   or edit all three by hand and keep them equal).
3. Commit, then tag and push:

   ```bash
   git tag 1.0.1
   git push origin 1.0.1
   ```

4. The `release.yml` workflow (tag push) builds on GitHub, runs tests and
   publishes a release with: plugin zip, `main.js`, `manifest.json`,
   `styles.css`, `pglite-assets/postgres.wasm|postgres.data|vector.tar.gz`.
   The workflow also supports manual runs: Actions → *Release Obsidian
   plugin* → *Run workflow* → enter an existing tag.
5. GitHub Actions on forks start disabled — after any new fork of this repo,
   enable them once (Actions tab → enable workflows).

## Community plugins catalog submission

Planned. Requirements and steps:

1. Public repository with releases and a readable README (done).
2. No telemetry / analytics / self-update (done — removed in 0.8.7 revival).
3. `manifest.json` fields complete; `id` unique across the catalog
   (`infio-copilot-free` verified free at 2026-09).
4. Open a PR adding an entry to `community-plugins.json` in
   `obsidianmd/obsidian-releases` (branch per their CONTRIBUTING, one plugin
   per PR). Expect a review round; keep the plugin policy-clean afterwards.
5. After listing, Obsidian's own updater delivers releases to users; keep
   `versions.json` in sync so minAppVersion mapping stays correct.

## CI

- `ci.yml` runs on pull requests into `master` **and on pushes to `master`**:
  type-check, ESLint ratchet, CSS ratchet, jest tests.
- Lint gate = **ratchet** (`pnpm run lint:ratchet`,
  `scripts/lint-ratchet.mjs`): the pre-existing upstream style debt is frozen
  in `eslint-baseline.json` (per file, per rule; error severity only, with the
  three disabled `no-unsafe-*` rules force-tracked), and any *new* violation
  fails CI. `pnpm run lint` still shows the raw ESLint picture (it is red
  until the debt is burned down — that is expected).
- Burning down the debt: fix violations in a file/module, then shrink the
  baseline in the same commit: `node scripts/lint-ratchet.mjs --update`
  (the script prints the improvements it saw and reminds you). When a rule
  reaches zero across the baseline, enable it in `.eslintrc.js` and delete it
  from the forced list in `scripts/lint-ratchet.mjs`.
- CSS gate = the same **ratchet** pattern (`pnpm run lint:css:ratchet`,
  `scripts/stylelint-ratchet.mjs`, since 1.7.0): the rule set lives in
  `.stylelintrc.json` — correctness rules (invalid hex, duplicate selectors,
  empty blocks, unknown units/properties/pseudo-classes/at-rules, calc
  spacing, duplicate properties with fallback tolerance, …) plus
  `declaration-no-important`, the phase-3 target. The pre-existing debt is
  frozen in `stylelint-baseline.json` (per file, per rule; 316 violations in
  `styles.css` at the freeze: 311 `!important`, 4 `no-duplicate-selectors`,
  1 `block-no-empty` — every other enabled rule is at zero). New violations
  fail CI; burn-downs shrink the baseline in the same commit
  (`node scripts/stylelint-ratchet.mjs --update`). `pnpm run lint:css` shows
  the raw stylelint picture with line numbers (red until the debt burns
  down — that is expected). Note: the stylelint CLI prints its report to
  stderr when run through `pnpm exec`; the ratchet script uses the Node API
  and is not affected. `declaration-no-important` reached **zero** in 1.7.5
  (burn-down history: ROADMAP.md, phase 3): the only `!important` left in
  `styles.css` are the documented exceptions below — do not disable the
  rule, keep the gate; new flags are allowed only via this registry.
- stylelint exceptions with written justification (scoped
  `stylelint-disable` comments inside `styles.css`; policy: a new exception
  is allowed only as a scoped disable + an entry in this list, everything
  else stays ratchet debt):
  - KaTeX math overrides (`.icf-markdown .katex …`, 20 declarations,
    reclassified in 1.7.3): they must beat KaTeX's own stylesheet, which
    Obsidian bundles inside `app.css`, for the accessible HTML/MathML
    split — the clip/hide pattern is KaTeX's standard technique, and
    dropping the `!important` flags there would require per-engine math
    rendering tests for no user-visible gain. The disable is scoped to
    `declaration-no-important` around the KaTeX region only.
- `tsconfig.json` has **`noImplicitThis: true`** (since 1.6.16) — do not
  revert it: `ThisType<>` contextual typing (used by the `Object.assign`
  bootstrap in `main.desktop.ts`) only works with this flag, and without it
  `this` in assigned/literal methods degrades to `any`, which the ratchet
  counts as `no-unsafe-*` regressions. The whole project compiles cleanly
  with the flag on (`pnpm type:check`).
- Low-memory machines: a single type-aware ESLint process over the whole
  `src/` needs several GB of heap. Use `pnpm run lint:ratchet -- --batch=14`
  to lint in chunks (slower, but each process stays under ~1 GB).

## Validator warnings with written justification

For catalog submission the Obsidian plugin validator must reach zero
*errors*; warnings are acceptable only with a written rationale. The
ones that cannot be fixed by construction are recorded here:

- `fetch`, `globalThis` and bare `setTimeout/clearTimeout` inside
  `src/embedworker/*` and `src/pgworker/*`: Web Workers have neither
  Obsidian's `requestUrl` nor a `window`; workers use the platform
  primitives by design (comments in place mark each spot).
- `globalThis` in `src/utils/logger.ts`: the logging facade must work
  in the main thread AND in workers, where `window` does not exist.
- The stage-2 `fetch` in `src/utils/ollama.ts`: an intentional
  reproduction of the renderer transport to detect OLLAMA_ORIGINS
  (CORS) blocks; `requestUrl` bypasses CORS and cannot detect them.

Deliberately deferred to planned releases: `no-misused-promises`
void-wrapping of async JSX handlers, the `no-unsafe-*`/`any` debt
(phase 2 pass 3, module by module), the declarative Settings API
(phase 3), and the typescript-eslint
"unsupported TypeScript version" banner on `pnpm lint*` (migration to
@typescript-eslint v8, which supports TS 5.9, is part of the phase-3
ESLint gate hardening; the banner does not affect results).

## Roadmap

See [ROADMAP.md](ROADMAP.md) — it is the single source of truth for release
planning (this section used to duplicate it and rotted).

## History pointer

- 0.8.7 “revival”: PGlite assets shipped locally + CDN fallback (upstream
  fetched them from a dead host — plugin was bricked for everyone), telemetry
  removed, model-picker crash fixed, Infio 401 spam fixed, complete Russian
  locale, CI repaired.
- 1.0.0: rebrand to an independent project (`infio-copilot-free`, `icf-*`
  namespace, docs rewrite).

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
  in `eslint-baseline.json` (per file, per rule; error severity only), and any
  *new* violation fails CI. Since 1.7.9 the toolchain is **ESLint 9 (flat
  config `eslint.config.mjs`) + typescript-eslint 8** (`strictTypeChecked` +
  `projectService`; the old eslintrc, the "unsupported TypeScript" banner and
  the dead css-modules/neverthrow plugin deps are gone). Four debt rules are
  switched off in the config but force-tracked by the ratchet:
  `no-unsafe-assignment/member-access/call` (frozen since 1.5.5) and
  `no-unnecessary-condition` (frozen in 1.7.9).
  `no-floating-promises` graduated in 1.7.10 and `no-misused-promises` in
  1.7.12 (all 65 findings fixed: void-wrapped JSX handlers, sync callbacks
  with an inner void-IIFE/`.catch`, explicit null checks instead of Promise
  truthiness tests); both rules are enabled in the config — the intended
  lifecycle for every tracked rule. Two v8 rules (`no-useless-default-assignment`,
  `no-unnecessary-boolean-literal-compare`) were parked until the
  `strictNullChecks` migration (without it they emitted only per-file
  "rule requires strictNullChecks" meta-errors; frozen as debt in 1.7.9 by
  mistake, unfrozen in 1.7.10); the 1.7.21 flip re-enabled both through
  `strictTypeChecked` — their real findings (3 and 0) went into the
  re-frozen baseline. Since the flip the baseline is measured UNDER SNC:
  **756 findings in 137 files** (the 1.7.21 honest re-freeze,
  `--update --batch=14`; the pre-flip debt was 1891/370).
  `pnpm run lint` still shows the raw ESLint picture (it is red until the
  debt is burned down — that is expected).
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
  rule, keep the gate; new flags are allowed only via this registry. The
  baseline itself reached **zero** in 1.7.17 — the last two
  `no-duplicate-selectors` findings (the duplicate `.icf-popover ul` and
  `.icf-popover li:hover` rules) were merged with byte-identical computed
  values, so the ratchet now guards a stylesheet with no frozen debt at
  all.
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
- `tsconfig.json` has **`strictNullChecks: true`** (since the 1.7.21 flip;
  the 1.7.20 series burned the 156-error tsc debt down first) — do not
  revert it: `eslint-baseline.json` is frozen UNDER SNC (the 1.7.21
  re-freeze, 756/137). Flipping back would resurrect ~1150 phantom
  `no-unnecessary-condition` findings against that baseline (the ratchet
  would fail on almost every file), and the two re-enabled rules would
  degrade to per-file "rule requires strictNullChecks" meta-errors again.

## Declarative settings migration (phase 3, item 1)

Since 1.7.6 the settings tab supports the Obsidian 1.13+ declarative
Settings API (`getSettingDefinitions()`), in the dual-support mode of the
official migration guide (Path B):

- On 1.13+ the host calls `InfioSettingTab.getSettingDefinitions()` and
  **skips `display()`**; on older hosts the definitions are never called
  and `display()` renders exactly as before. No runtime version detection
  is needed — do not add any. Since 1.7.8 the manifest declares
  `minAppVersion: 1.13.0` (the honest floor: the catalog validator's
  `obsidianmd/no-unsupported-api` compared ~170 API sites against the
  fictional upstream 0.15.0), so the dual-support `display()` path is a
  defensive legacy, not an installable configuration.
- The definition tree lives in `src/settings/declarative.ts`
  (`buildSettingDefinitions(host)`), built against a structural host
  interface so it unit-tests without the React tree. Order of items MUST
  match the order of `display()` sections. Wave 1.1 shape: About =
  full-width `render` row at the top (not searchable — it is not a
  setting); Model parameters = `page` with five inline native controls;
  Chat behavior = inline `group`; the other five sections = `page` items
  whose factory mounts the legacy renderers with `embedded = true`.
- **Lazy inheritance contract (critical):** `SettingPage` does not exist
  on pre-1.13 hosts, so `class ... extends SettingPage` MUST NEVER be
  evaluated at module scope — only inside `createSectionPage()`'s
  factory body, which pre-1.13 hosts never invoke. A top-level extends
  crashed plugin load on older hosts (fixed in 1.7.7).
- The four imperative section renderers take `embedded?: boolean`: when
  true (declarative pages) they skip their own heading rows and the
  `icf-collapsible-*` fold chrome — the page navigation row is the
  heading; the legacy `display()` path calls them without the flag and
  keeps the folds.
- Controls bind **dotted paths**: `getControlValue`/`setControlValue`
  resolve them with `readSettingPath`/`writeSettingPath`, and every write
  goes through `InfioSettingsSchema.safeParse` (`parseSettingsCandidate`)
  before `plugin.setSettings` — an invalid value is rejected with a
  `logger.warn`, never persisted. Keep this guard: it is the only thing
  standing between the host UI and the zod contract.
- Control `min`/`max`/`step` MUST mirror `modelOptionsSchema` (and future
  schemas) exactly — adding a stricter bound than the schema is a behavior
  change, adding a looser one lets the safeParse guard reject silently.
- New i18n keys: page/group/ control names reuse existing
  `settings.*` keys; wave 1 added `settings.PluginInfo.title` and
  `settings.Models.title` (en/ru/zh-cn in sync, the completeness test
  enforces it).
- Migrating the next section (wave 2+): replace its `legacyPage(...)`
  entry with a `group` of `control`/`render` definitions, extend the unit
  tests (structure + keys + bounds), and check whether the section's
  renderer becomes dead code (then delete it and its React component).
  `render` callbacks receive an Obsidian `Setting` row and may return a
  cleanup function — use them for React-mounted rows until the section is
  fully native.
- Known wave-1 limitation (same as the legacy path, tracked): React
  section renderers create a fresh `createRoot` per mount and never
  unmount previous roots; `SectionPage.display()/hide()` empty the
  container like the tab always did. Root lifecycle gets proper cleanup
  as sections go native.
- `obsidian` devDependency carries the API types (1.13.1+); bumping it
  further is safe only with a full `pnpm type:check` pass.
- Low-memory machines: a single type-aware ESLint process over the whole
  `src/` needs several GB of heap (with typescript-eslint 8 + projectService
  even a 4 GB heap can be killed on constrained machines). Use
  `pnpm run lint:ratchet -- --batch=14` to lint in chunks; if child batches
  still die, drop to `--batch=4..8`. For a one-off full re-measure on a small
  box, drive the ratchet's child mode (`--files-from`/`--emit-json`) over
  consecutive ~30-file slices of the sorted `src/` list and merge the JSONs —
  that is how the 1.7.9 baseline (3350/364) was produced; the 1.7.21
  re-freeze (756/137) was a plain `--update --batch=14` on a 1 GB box.
- `strictNullChecks` migration probe (1.7.20 spike — **historical**: the
  migration was executed in 1.7.20/1.7.21, and the probe's
  single-occurrence assert on `"strictNullChecks": false` now fails by
  design against the flipped tsconfig, protecting it from accidental
  runs): `scripts/snc-probe.mjs` measured the migration cost without
  changing any committed config. The tsc
  side runs `tsc --noEmit --skipLibCheck --strictNullChecks` and reports
  total/per-code/per-file counts (the code fixes the flag flip requires);
  the ESLint side temporarily flips `"strictNullChecks": false` in
  `tsconfig.json` (single-occurrence assert; restored in a `finally` — the
  script never calls `process.exit` inside the try, and if the probe is
  killed anyway, `git checkout tsconfig.json` restores it), then drives the
  ratchet engine (repo flat config + the four force-tracked rules + the two
  rules parked in 1.7.10, which emit real findings only under SNC) in child
  batches and reports: how much of the frozen `no-unnecessary-condition`
  pool evaporates, what the parked rules would freeze as real debt, every
  other per-file/per-rule drift, and the exact re-freeze preview
  (`--report-json` for machine-readable output; `--files-from` without
  `--emit-json` probes a subset with an honestly scoped report).
  Low-memory recipe: `NODE_OPTIONS=--max-old-space-size=950` for the tsc
  side, `--batch=4` under `--max-old-space-size=800` for the ESLint side
  (both verified on a 1 GB sandbox). Sandbox spike numbers (tree of 1.7.19):
  tsc = **156 errors in 38 files** (TS2322 52, TS2345 47, TS18049/18047/
  18048 39, TS2531/2532 12, TS2578 2 — two `@ts-expect-error` directives
  become unnecessary, TS2769 2, misc 2; top files: parse-icf-block 31,
  ChatView 17, api.ts 17, rag-engine 12, prompt-generator 10); ESLint
  sample (McpHub, prompt-generator, vector-manager, ChatView, helpers —
  149 findings of the 1367 pool): `no-unnecessary-condition` loses ~74%
  in the sample (58→27, 33→2, 16→5, 40→5, 2→0), the two parked rules
  produce ~0 real findings (1 in the sample), and SNC re-exposes a small
  honest drift for the re-freeze (`restrict-template-expressions` +10
  across two files — graduated pre-SNC in 1.7.13, `no-unsafe-call` +1,
  bonuses −2). Run the FULL probe on the maintainer machine before
  deciding (ground truth for the re-freeze, the 1.7.9 method). Migration
  order (EXECUTED): the 1.7.20 series fixed the 156 tsc errors module by
  module (25 patches → 2, both deferred `TS2578` over the PromptGenerator
  constructor calls) → the 1.7.21 atomic flip removed the two directives,
  re-enabled the two parked rules in `eslint.config.mjs` and honestly
  re-froze `eslint-baseline.json` under SNC (1891/370 → **756/137**:
  `no-unnecessary-condition` 1363 → 214 — 84% of the pool were SNC
  phantoms, 233 files fully clean; `restrict-template-expressions`
  0 → 18 honest drift frozen; `no-unsafe-*` aggregate 245 → 240;
  boolean-literal-compare exactly the predicted 3,
  useless-default-assignment 0) → burn the shrunken pools.

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

Deliberately deferred to planned releases (the burn-down register; all
counts are the re-frozen 1.7.21 baseline, measured UNDER
`strictNullChecks`: 756 total in 137 files): the
`no-unsafe-*`/`any` debt (240 across member-access 114 / assignment 52 /
call 39 / argument 27 / return 8 — phase 2 pass 3, module by module),
`no-unnecessary-condition` (214 — collapsed from 1363 in the 1.7.21
re-freeze; the rest is genuine dead-condition debt),
`consistent-type-assertions` (89), `no-explicit-any` (40), inline-styles
(40), `restrict-plus-operands` (25), `ban-ts-comment` (24),
`restrict-template-expressions` (18 — the honest SNC drift frozen by the
re-freeze), `no-unnecessary-boolean-literal-compare` (3, re-enabled in
1.7.21) and the small-rule tail. `no-useless-default-assignment` is
active with an empty baseline (any appearance is blocked).
Done and struck from this register: the declarative Settings API
(1.7.6–1.7.8), the typescript-eslint v8 / ESLint 9 flat-config migration
(1.7.9), `no-floating-promises` — the first graduated rule (fixed and
enabled in 1.7.10) — and the first three rules graduated by pure fix in
1.7.11: `prefer-reduce-type-parameter`, `no-unused-expressions`,
`only-throw-error` (already active through `strictTypeChecked`, their zeroed
counters are simply gone from the baseline; the ratchet rejects any
reappearance), `no-misused-promises` — all 65 async-handler findings
fixed and the rule enabled in the config (1.7.12),
`restrict-template-expressions` — all 296 interpolation findings burned
with `String()` wraps (1.7.13), and `no-confusing-void-expression` +
`no-unnecessary-type-conversion` — the 130 shorthand-arrow and 95
redundant-conversion findings burned in one pass (1.7.16); the last three
were already active through `strictTypeChecked` since 1.7.9, their counters
are gone from the baseline, and `no-unused-vars` — all 57 findings burned
in the 1.7.18 five-patch series (optional catch bindings, dropped
interface-impl parameters with their freed imports, three dead functions
deleted, trailing-parameter trims with call-site updates; the single
deliberate relaxation — `argsIgnorePattern: '^_'` for arity-blocked
base-class methods — is documented in eslint.config.mjs; active through
`strictTypeChecked` since 1.7.9, counters gone from the baseline), and
`no-base-to-string` — all 27 findings burned in the 1.7.19 three-patch
series (unknown-stringification unified through `extractErrorMessage`
with a JSON fallback for plain objects, `t()` interpolation via a local
`stringifyParam`, the provably no-op `fewShotExamples` sorts removed,
Markdown children through the new `childrenToString` helper), plus a
−3 measurement correction for counts the 1.7.18 dead-function removal
had silently retired; active through `strictTypeChecked` since 1.7.9,
counters gone from the baseline), and the `strictNullChecks` migration
itself — the 1.7.20 25-patch series (tsc 156 → 2) plus the 1.7.21 atomic
flip (both deferred `TS2578` directives removed, the two parked rules
re-enabled, `ts-suppressions` 32 → 30 markers, `eslint-baseline.json`
honestly re-frozen under SNC: 1891/370 → 756/137).
Remaining phase-3
lint work: keep graduating rules as their counters reach zero (next
candidates: the shrunken 214-finding `no-unnecessary-condition` pool,
the 240-finding `no-unsafe-*` aggregate and the 18 honest
`restrict-template-expressions` drift findings), and evaluate
`eslint-plugin-obsidianmd` (the catalog review set) as a separate tracked
increment.

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

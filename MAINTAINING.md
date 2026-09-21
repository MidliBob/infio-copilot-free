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
- `Infio*` identifiers that remain (`InfioSettings`, `infioProvider`,
  `INFIO_BASE_URL`, `use-infio.ts`) belong to the *Infio cloud provider
  integration*, not to the plugin brand. They may be removed later as a
  cleanup (the provider service is effectively dead).

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

- `ci.yml` runs on pull requests into `master`: type-check, lint
  (`continue-on-error`, legacy style debt), jest tests.
- Lint debt: `pnpm run lint` reports pre-existing issues from upstream; fix
  opportunistically, do not block features on it.

## Roadmap (next releases)

- **Ollama model lists**: fetch `GET {baseUrl}/api/tags` via Obsidian
  `requestUrl` (avoids CORS) and populate the model pickers; same for
  OpenAI-compatible `/v1/models`.
- **Ollama embeddings**: verify/fix endpoint handling
  (`/v1/embeddings` vs `/api/embed`, upstream issue #148).
- **Local LLM calls via `requestUrl`** to remove the `OLLAMA_ORIGINS`
  requirement for Ollama users.
- **Drop the dead Infio cloud provider** (`infioProvider`, `use-infio.ts`,
  `INFIO_*` constants, ProUpgradeModal) with a settings-migration note.
- **Refresh built-in model catalogs** (Claude 4.x, GPT-5, Gemini 2.5, …).
- **Rename remaining `Infio*` internals** (`InfioSettings` type, file names)
  for a consistent codebase.
- **Mobile pass**: the mobile build skips the database; audit feature
  degradation and subscription leftovers.
- More locales (the loader-free i18n makes additions cheap).

## History pointer

- 0.8.7 “revival”: PGlite assets shipped locally + CDN fallback (upstream
  fetched them from a dead host — plugin was bricked for everyone), telemetry
  removed, model-picker crash fixed, Infio 401 spam fixed, complete Russian
  locale, CI repaired.
- 1.0.0: rebrand to an independent project (`infio-copilot-free`, `icf-*`
  namespace, docs rewrite).

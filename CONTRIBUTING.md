# Contributing to Infio Copilot Free

Contributions are welcome: bug reports, pull requests, translations and
documentation improvements.

## Development workflow

1. Clone the repository into your vault's plugins directory:

   ```bash
   git clone https://github.com/MidliBob/infio-copilot-free.git \
     /path/to/vault/.obsidian/plugins/infio-copilot-free
   cd /path/to/vault/.obsidian/plugins/infio-copilot-free
   ```

2. Install dependencies and build (Node 20, pnpm 12):

   ```bash
   pnpm install
   pnpm build              # one-off production bundle
   pnpm copy-pglite-assets # PGlite runtime files next to main.js
   ```

   For active development use `pnpm dev` (esbuild watch mode with inline
   sourcemaps) and reload Obsidian (Ctrl/Cmd+R) to pick up changes.

3. Before opening a pull request run:

   ```bash
   pnpm run type:check
   pnpm test
   pnpm run lint
   ```

## Translations

The plugin ships three UI languages: English (`en`), Russian (`ru`) and
Simplified Chinese (`zh-cn`) — this is the supported set (roadmap phase 0.4
policy). Any other Obsidian interface language falls back to English
silently.

UI strings live in `src/lang/locale/<lang>.ts`; `en.ts` defines the full key
set. To fix a translation, edit the values (keep `{param}` placeholders
verbatim). To add a key, add it to **all three** locale files:
`src/lang/locale-completeness.test.ts` runs in CI and fails on any key-set,
empty-value or placeholder mismatch. Adding a whole new language is a
maintainer decision — it means committing to keep every key in sync across
releases.

## Pull requests

- Keep commits focused; describe what and why.
- Match the existing code style (TypeScript, tabs, repo eslint config).
- User-visible strings must go through the i18n helper (`t("section.key")`),
  never hardcoded.
- Do not reintroduce telemetry, analytics or self-update code: they violate
  the Obsidian developer policies and are the reason the upstream plugin was
  delisted.

See [MAINTAINING.md](MAINTAINING.md) for the release process and roadmap.

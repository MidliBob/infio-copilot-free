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

2. Install dependencies and build (Node 20, pnpm 9):

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

UI strings live in `src/lang/locale/<lang>.ts`; `en.ts` defines the full key
set. To fix a translation, edit the values (keep `{param}` / `{{param}}`
placeholders verbatim). To add a language, create the locale file and register
it in the `localeMap` in `src/lang/helpers.ts` — the plugin follows Obsidian's
interface language automatically.

## Pull requests

- Keep commits focused; describe what and why.
- Match the existing code style (TypeScript, tabs, repo eslint config).
- User-visible strings must go through the i18n helper (`t("section.key")`),
  never hardcoded.
- Do not reintroduce telemetry, analytics or self-update code: they violate
  the Obsidian developer policies and are the reason the upstream plugin was
  delisted.

See [MAINTAINING.md](MAINTAINING.md) for the release process and roadmap.

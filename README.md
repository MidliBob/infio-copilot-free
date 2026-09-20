# Infio Copilot Free

A Cursor-inspired AI assistant for Obsidian: an agent chat that can read and
edit your vault, RAG-powered semantic search, inline autocomplete and AI
insights — with fully local storage and no telemetry.

**Infio Copilot Free** is an independent, community-maintained continuation of
[Infio Copilot](https://github.com/infiolab/infio-copilot) (0.8.x, unmaintained
since 2025 and delisted from the Obsidian plugin catalog), which itself began
life as [Smart Composer](https://github.com/glm454/smart-composer). All credit
for the original design and code goes to their authors; this project fixed the
fatal issues left behind (dead asset host, telemetry, UI crashes) and keeps the
plugin alive and evolving.

## Features

- **Agent chat with your vault** — the assistant reads notes, searches them
  (semantic / BM25 / regex), fetches web pages, creates and edits files through
  reviewable diffs, and can use MCP tools.
- **RAG semantic search** — a vector index of your notes stored locally
  (PGlite, i.e. PostgreSQL compiled to WebAssembly, on OPFS storage).
- **AI insights** — dense/simple summaries, key insights, paper analysis and
  other transformations of your notes.
- **Autocomplete** — inline code/text completion with a model of your choice.
- **Any provider** — OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Groq,
  xAI, Moonshot, SiliconFlow, Alibaba Qwen, OpenAI-compatible endpoints,
  Ollama and other local servers, plus built-in local embedding models
  (no API key needed for embeddings).
- **Workspaces, custom modes, quick commands, MCP servers.**
- **Localized UI** — English, Russian and Chinese follow Obsidian's interface
  language; more locales are easy to add.

## Install

### From a release (manual)

1. Download `obsidian-infio-copilot-free-<version>.zip` from
   [Releases](../../releases/latest) and unpack it into
   `<vault>/.obsidian/plugins/infio-copilot-free/`.
   The folder must contain `main.js`, `manifest.json`, `styles.css` and the
   three PGlite runtime files `postgres.wasm`, `postgres.data`,
   `vector.tar.gz`.
2. Restart Obsidian and enable **Infio Copilot Free** in
   Settings → Community plugins.

If the three PGlite files are missing the plugin still starts: they are
fetched once from npm CDN mirrors (jsDelivr → npmmirror → unpkg).

### BRAT

Add this repository to [BRAT](https://github.com/TfTHacker/obsidian42-brat) to
receive builds from releases automatically.

### Community plugins catalog

Not listed yet — a submission to `obsidianmd/obsidian-releases` is planned;
until then use the two options above.

## First steps

1. Open the chat from the ribbon (wand icon) or the command palette
   (“Open Infio Copilot Free”).
2. In Settings → Infio Copilot Free pick a provider and paste an API key —
   or point an Ollama slot at `http://localhost:11434` and type the model name
   manually (model lists are not fetched from Ollama yet).
   Local Ollama users: Obsidian sends requests from origin
   `app://obsidian.md`, so start Ollama with
   `OLLAMA_ORIGINS=app://obsidian.md` (or `*`).
3. Configure the four model slots (chat / apply / insights / embeddings) —
   each is set separately. Embeddings can use the built-in local models.
4. Optional: build the semantic index from the “Semantic Index” panel, and
   enable autocomplete at the bottom of the settings tab.

## Privacy

- No telemetry, no analytics, no self-update code (the reasons the upstream
  plugin was delisted are removed).
- Nothing leaves your machine except calls to the LLM provider you configure.
- Chats, vector index and settings are stored locally in the vault profile.

## Notes for upgraders from Infio Copilot

- The plugin id changed to `infio-copilot-free`; it installs side by side with
  the old plugin. Settings do not migrate automatically — copy `data.json`
  between the plugin folders if you want to keep them, then remove the old
  plugin.
- The chat/vector database keeps its storage name (`infio-db`) for continuity.
  Do **not** run both plugins at the same time: they would share that database.
- Custom CSS snippets targeting `.infio-*` classes must switch to the new
  `icf-*` prefix.

## Build from source

Requirements: Node 20, pnpm 9.

```bash
pnpm install
pnpm build               # type-check + esbuild production bundle -> main.js
pnpm copy-pglite-assets  # PGlite runtime files -> pglite-assets/
pnpm test
```

Copy `main.js`, `manifest.json`, `styles.css` and the three `pglite-assets/*`
files into your vault's plugin folder and reload Obsidian (Ctrl/Cmd+R).

Release process, CI notes and the roadmap live in
[MAINTAINING.md](MAINTAINING.md).

## Credits & license

MIT — see [LICENSE](LICENSE).
Based on Infio Copilot © Felix.D and Smart Composer © Heesu Suh;
continuation © 2026 MidliBob and contributors.

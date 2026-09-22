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
   or point an Ollama slot at `http://localhost:11434`: the model dropdowns
   then list models straight from your Ollama server, and the **Test
   connection** button diagnoses both reachability and CORS/origin issues
   (see [Ollama (local models)](#ollama-local-models)).
3. Configure the four model slots (chat / apply / insights / embeddings) —
   each is set separately. Embeddings can use the built-in local models.
4. Optional: build the semantic index from the “Semantic Index” panel, and
   enable autocomplete at the bottom of the settings tab.

## Ollama (local models)

Infio Copilot Free works with [Ollama](https://ollama.com) out of the box:

1. Install Ollama and pull a model, e.g. `ollama pull qwen2.5:3b`.
2. Make sure the server runs (`ollama serve`; the desktop apps start it
   automatically). Default address: `http://localhost:11434`.
3. In Settings → Infio Copilot Free → **Ollama**: set the base URL. The
   chat/insight/autocomplete model dropdowns populate from the server's
   `/api/tags` list automatically, and the embedding dropdown lists the
   server's embedding-capable models (Ollama reports model capabilities;
   on older servers the full list is shown). Any other model name can
   still be typed in manually.
4. Press **Test connection** under the base URL field and follow the
   verdict (see below).

Chat and embedding requests use Ollama's OpenAI-compatible API under
`/v1` (Ollama ≥ 0.1.14). The model list is fetched through Obsidian's
native HTTP layer, which is not subject to browser CORS.

### Reading the Test connection results

| Result | Meaning | What to do |
|---|---|---|
| **OK** (shows the server version) | Reachable and accepts Obsidian's requests | Nothing — you are set |
| **Cannot reach Ollama** | The native request failed | Is Ollama running (`ollama serve`)? Is the base URL/port correct? Firewall/proxy in the way? |
| **Reachable, but rejects browser requests** | The server answers Obsidian's native requests but blocks the renderer's `fetch` — this is the `OLLAMA_ORIGINS` policy | See the recipe below |
| **Set the base URL first** | No address configured | Fill in the Ollama base URL |

### Why OLLAMA_ORIGINS is needed (and how to set it)

Chat/embedding requests run through the renderer's `fetch`, so Ollama sees
them as cross-origin calls from `app://obsidian.md`. By default Ollama only
allows localhost web origins and answers everything else with `403` — which
browsers hide as an opaque "Failed to fetch" (the same message you get when
the server is down; the Test connection button tells the two apart).

Allow Obsidian's origin (or all origins with `*`) and **restart Ollama**:

- **Windows** (PowerShell, then restart the Ollama app):
  `setx OLLAMA_ORIGINS "app://obsidian.md"` — or set it via
  *System → Environment Variables*.
- **macOS** (terminal, then quit and reopen the Ollama app):
  `launchctl setenv OLLAMA_ORIGINS "app://obsidian.md"`
- **Linux** (systemd service): `sudo systemctl edit ollama` and add
  ```ini
  [Service]
  Environment="OLLAMA_ORIGINS=app://obsidian.md"
  ```
  then `sudo systemctl daemon-reload && sudo systemctl restart ollama`.

A handy diagnostic: if the model dropdown **lists your models** but chat
still fails with a network error, it is almost certainly the origins policy
(the list uses native HTTP, chat uses `fetch`).

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

Requirements: Node 20, pnpm 12.

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

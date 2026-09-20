# Infio Copilot — Community Revival Fork

Форк плагина [infiolab/infio-copilot](https://github.com/infiolab/infio-copilot)
(версия 0.8.6, последняя официальная) для Obsidian.

Апстрим заброшен с сентября 2025 и удалён из каталога Obsidian из-за нарушений
политики разработчиков (телеметрия, самообновление — issue #147). Сервер
`infio.dev`, с которого плагин скачивал движок базы данных PGlite, отключён,
из-за чего оригинал 0.8.4+ не запускается ни у кого (`TypeError: Failed to
fetch`, issue #130). Этот форк устраняет поломки и развивает плагин дальше.

Лицензия: MIT (см. LICENSE, © Heesu Suh — original Smart Composer, © Felix.D —
Infio Copilot). Форк обязан сохранять копирайт-уведомления.

## Отличия от апстрима 0.8.6

| Коммит | Что делает |
|---|---|
| `fix(pglite)` | Ресурсы PGlite (postgres.wasm / postgres.data / vector.tar.gz из `@electric-sql/pglite@0.2.14`) больше не качаются с мёртвого `infio.dev`. Они поставляются **отдельными файлами в папке плагина** и читаются через vault adapter; если файлов нет — фолбэк на CDN-зеркала npm (jsDelivr → npmmirror → unpkg). База стартует офлайн, main.js остаётся ~16 МБ. |
| `chore(telemetry)` | Полностью удалена клиентская телеметрия (`onEnt` → `hubs.infio.app`) и все 6 её вызовов. Требование developer policies Obsidian. |
| `fix(settings)` | Исправлен вылет `Cannot read properties of null (reading 'querySelector')` при открытии выпадающего списка моделей (React `event.currentTarget` читался внутри `setTimeout`). |
| `fix(api)` | Без ключа Infio запрос `api.infio.app/model_group/info` не отправляется (раньше — красные 401 в консоли на каждый рендер пикера моделей). |
| `feat(i18n)` | Полная русская локализация: 592 строки, все 13 разделов (`src/lang/locale/ru.ts`). Язык интерфейса следует языку Obsidian. |
| `chore(ci)` | CI приведён в рабочее состояние (pnpm 9 под lockfile v9, существующие имена скриптов, `tsc -noEmit -skipLibCheck`). |
| `chore(release)` | Версия 0.8.7 (manifest.json, package.json, versions.json, CHANGELOG.yaml). |

## Сборка

Требования: **Node 20** (см. `.nvmrc`), **pnpm 9** (`npm i -g pnpm@9`).

```bash
pnpm install
pnpm build                 # tsc -noEmit -skipLibCheck + esbuild production → main.js
pnpm copy-pglite-assets    # node_modules/@electric-sql/pglite/dist → pglite-assets/
```

Замечания:

- `tsc` требует много памяти из-за размеров проекта; при OOM запускайте
  `NODE_OPTIONS=--max-old-space-size=6144 pnpm build`.
- Режим разработки: `pnpm dev` (esbuild watch, sourcemaps inline).
- Тесты: `pnpm test` (jest).

## Установка в хранилище

В папку `<vault>/.obsidian/plugins/infio-copilot/` положить:

```
main.js            ← результат pnpm build
manifest.json
styles.css
postgres.wasm      ← из pglite-assets/ (8.9 МБ)
postgres.data      ← из pglite-assets/ (4.8 МБ)
vector.tar.gz      ← из pglite-assets/ (0.3 МБ)
```

Затем перезапустить Obsidian (или выключить/включить плагин). Три файла
PGlite можно не класть — тогда они скачаются с CDN при первом старте
(нужен интернет; в Китае надёжнее работает зеркало npmmirror, оно в цепочке
второе).

## Как устроены ресурсы PGlite

- `scripts/copy-pglite-assets.mjs` копирует `postgres.wasm`, `postgres.data`,
  `vector.tar.gz` из `node_modules/@electric-sql/pglite/dist` в `pglite-assets/`
  (в git не коммитятся, см. `.gitignore`).
- В рантайме `loadLocalPgliteAssets()` (src/database/database-manager.ts)
  читает их из папки плагина через `app.vault.adapter.readBinary()` и передаёт
  в воркер полем `pgliteAssets` (structured clone через postMessage).
- Воркер (`src/pgworker/pglite.worker.ts`) при отсутствии переданных файлов
  качает их с CDN-зеркал `PGLITE_CDN_BASES`.
- **Обновление версии PGlite**: поменять версию в `package.json`,
  `PGLITE_CDN_BASES` (pglite.worker.ts) и `PGLITE_VERSION`
  (copy-pglite-assets.mjs) — все три должны совпадать, иначе wasm не подойдёт
  к JS-обвязке.

## Релиз

1. Обновить `CHANGELOG.yaml` (секции `features` / `fixes` / `improvements` /
   `other` — их разбирает `.github/scripts/get-changelog.js`).
2. Поднять версию в `manifest.json`, `package.json`, `versions.json`
   (`npm run version` синхронизирует manifest/package).
3. `git tag 0.8.7 && git push origin 0.8.7` — GitHub Action
   (`.github/workflows/release.yml`) соберёт проект, приложит `main.js`,
   `manifest.json`, `styles.css`, три файла PGlite и zip.

## Публикация в каталоге Obsidian

Плагин `infio-copilot` делистнут; чтобы попасть в каталог под своим именем:

1. Сменить `id` и `name` в `manifest.json` (id должен быть уникальным,
   например `infio-copilot-community`), `author`/`authorUrl` — на свои.
   ВНИМАНИЕ: смена id = новая папка плагина; данные настроек (`data.json`)
   и база (IndexedDB/OPFS `infio-db`) при этом не переносятся автоматически.
2. Политики разработчиков уже соблюдены: телеметрии нет, самообновления нет
   (обновление только через каталог/BRAT).
3. Далее — обычный процесс: публичный релиз на GitHub + PR в
   `obsidianmd/obsidian-releases` (community-plugins.json).

## Известные проблемы / план работ

- **Ollama: список моделей не подтягивается** — `GetProviderModels` для
  Ollama/OpenAICompatible возвращает `{}`; имя модели нужно вводить вручную.
  Улучшение: запрашивать `GET {baseUrl}/api/tags` (через `requestUrl` из
  obsidian API, чтобы обойти CORS) и показывать реальный список.
- **Ollama embeddings (#148 апстрима)**: проверять фактический эндпоинт —
  OpenAI-совместимый `/v1/embeddings` против `/api/embed`.
- **CORS Ollama**: запросы к Ollama идут fetch'ем из рендерера
  (origin `app://obsidian.md`); пользователям нужна `OLLAMA_ORIGINS=*`
  (или `app://obsidian.md`). Можно перевести вызовы на `requestUrl`.
- Автодополнение: отдельный блок настроек (свой URL `…/api/chat`, модель
  вручную) — унифицировать с основными слотами моделей.
- Мобильная сборка (`src/main.mobile.ts`) не использует БД — проверить
  деградацию функций на мобильных.
- `api.infio.app` / `platform.infio.app` — провайдер «Infio» мёртв как сервис;
  кандидаты на удаление из списка провайдеров.

## Разработка: как тестировать быстро

- Вариант A: копировать `main.js` (+ассеты) в тестовое хранилище и
  перезагружать Obsidian (`Ctrl+R` / Cmd+R достаточно для перезагрузки
  плагинов).
- Вариант B: плагин [BRAT](https://github.com/TfTHacker/obsidian42-brat) —
  добавить свой форк как beta-плагин, BRAT сам тянет свежие релизы
  (для локальной разработки — включать «debugging» и указывать локальный путь).

# Инвентарь подавлений TypeScript (`@ts-nocheck` / `@ts-ignore` / `@ts-expect-error`)

Документ фазы 2 «Надёжность» (ROADMAP.md, пункт 3). Описывает замороженный
долг подавлений типов, политику и план выгорания.

## Механизм («трещотка»)

- Долг заморожен в `ts-suppressions-baseline.json` (корень репозитория):
  файл → количество маркеров каждого вида.
- `src/ts-suppressions.test.ts` (запускается в `pnpm test` и в CI) требует
  **точного** совпадения с baseline:
  - новое подавление (или рост счётчика) — тест падает: подавления не растут;
  - выгоревшее подавление — тест тоже падает, пока baseline не ужат в том же
    коммите: `node scripts/ts-suppressions.mjs --update`.
- Отчёт в любой момент: `node scripts/ts-suppressions.mjs` (таблица)
  или `--json`.

## Политика

1. **Новые подавления запрещены.** Если без `@ts-expect-error` не обойтись
   (временный обход до фиксации типа в библиотеке) — только точечный
   `@ts-expect-error` с описанием причины в комментарии, и только через
   явное обновление baseline отдельным коммитом с обоснованием.
2. **Blanket `@ts-nocheck` запрещён** в новых файлах и последовательно
   снимается с core-модулей: `src/main.ts` очищен в 1.6.0,
   `src/main.desktop.ts` и обёртка `src/ChatView.tsx` — в 1.6.16
   (следующие кандидаты — по плану ниже).
3. `@ts-ignore` не добавлять вовсе (eslint-правила `ban-ts-comment` и
   `prefer-ts-expect-error` уже требуют `expect-error`; существующие
   `ignore` — часть замороженного долга).
4. Выгорание оформляется как обычный коммит: исправление типов +
   `--update` baseline + правка таблицы ниже.

## Замороженный долг (baseline 1.6.0)

**78 маркеров в 31 файле**: `@ts-nocheck` — 17, `@ts-ignore` — 19,
`@ts-expect-error` — 42. Замер скриптом `scripts/ts-suppressions.mjs`
на v1.5.5+ (2026-09-27). В том же релизе 1.6.0 снят blanket-`@ts-nocheck`
с `src/main.ts` (строка исключена из таблицы ниже, baseline ужат до
77 маркеров в 30 файлах).

| Файл | nocheck | ignore | expect-error | всего |
|---|---|---|---|---|
| `src/utils/parse-icf-block.ts` | 1 | — | 30 | 31 |
| `src/settings/SettingTab.tsx` | — | 8 | — | 8 |
| `src/ChatView.tsx` | 1 | 4 | — | 5 |
| `src/main.desktop.ts` | 1 | — | 3 | 4 |
| `src/components/chat-view/ChatView.tsx` | — | — | 2 | 2 |
| `src/settings/components/ModelProviderSettings.tsx` | — | 2 | — | 2 |
| `src/utils/auto-complete.ts` | 1 | — | 1 | 2 |
| `src/components/chat-view/CustomModeView.tsx` | — | — | 1 | 1 |
| `src/components/chat-view/InsightView.tsx` | — | — | 1 | 1 |
| `src/components/chat-view/Markdown/MarkdownEditFileBlock.tsx` | — | 1 | — | 1 |
| `src/components/chat-view/WorkspaceEditModal.tsx` | — | 1 | — | 1 |
| `src/core/file-search/match/coreplugin-match.ts` | — | 1 | — | 1 |
| `src/core/llm/ollama.ts` | 1 | — | — | 1 |
| `src/core/mcp/McpHub.ts` | — | — | 1 | 1 |
| `src/core/mcp/McpServerManager.ts` | 1 | — | — | 1 |
| `src/core/prompts/sections/custom-system-prompt.ts` | 1 | — | — | 1 |
| `src/database/database-manager.ts` | — | — | 1 | 1 |
| `src/embedworker/EmbeddingManager.ts` | 1 | — | — | 1 |
| `src/event-listener.ts` | 1 | — | — | 1 |
| `src/pgworker/index.ts` | 1 | — | — | 1 |
| `src/pgworker/pglite.worker.ts` | — | — | 1 | 1 |
| `src/render-plugin/completion-key-watcher.ts` | 1 | — | — | 1 |
| `src/render-plugin/document-changes-listener.ts` | 1 | — | — | 1 |
| `src/render-plugin/render-surgestion-plugin.ts` | 1 | — | — | 1 |
| `src/render-plugin/states.ts` | 1 | — | — | 1 |
| `src/render-plugin/types.ts` | 1 | — | — | 1 |
| `src/render-plugin/user-event.ts` | 1 | — | — | 1 |
| `src/settings/components/ProviderModelsPicker.tsx` | — | — | 1 | 1 |
| `src/utils/extract-text.ts` | — | 1 | — | 1 |
| `src/utils/prompt-generator.ts` | — | 1 | — | 1 |

## Категории и план выгорания

| Категория | Файлы | Что делаем |
|---|---|---|
| Парсер ICF-блоков | `src/utils/parse-icf-block.ts` (31) | ✅ Выгорел в 1.6.21: `@ts-nocheck` и все 30 `@ts-expect-error` сняты — дерево parse5 обрабатывается дискриминантами `nodeName` и type guards (`isTextNode`/`isRecord`), JSON5-payload'ы (operations/parameters/urls) валидируются ручными guard-функциями (zod не понадобился: формы payload'ов плоские), ноль кастов. Попутно исправлены порча Apply-контента (вложенная разметка в `<content>`/`<diff>` терялась при join текстовых узлов) и краш рендера на не-массиве `operations` |
| Render-plugin автокомплита | `src/render-plugin/*` (6 nocheck) | Апстримный плагин подсказок целиком под nocheck. Типизируем постепенно, начиная с `types.ts` (он уже только декларативный), затем leaf-файлы (`completion-key-watcher`, `user-event`, …) |
| Entrypoint | `src/main.desktop.ts` (1 nocheck + 3 expect-error) | ✅ Выгорело в 1.6.16: бутстрап переведён на `Object.assign` + `ThisType` (ноль `as`), `editor.cm` читается через `getEditorView()` (Reflect.get + структурный guard) вместо expect-error; включён `noImplicitThis` в tsconfig |
| Legacy-вью | `src/ChatView.tsx` (1+4), `src/components/chat-view/*` (6) | ✅ Обёртка `src/ChatView.tsx` выгорела в 1.6.16 (тип `InfioPluginLike` из `src/types/plugin.ts` закрыл settings/initChatProps/setSettings/addSettingsListener); остались `src/components/chat-view/*` — снимаются по ходу типизации render-plugin и чат-компонентов |
| Legacy-настройки | `src/settings/SettingTab.tsx` (6), `ProviderModelsPicker.tsx` (1) | ✅ `ModelProviderSettings.tsx` (2 `@ts-ignore` на plugin.settings/setSettings) выгорел в 1.6.18 переводом пропа на `InfioPluginLike`; там же снят `@ts-ignore` передачи plugin в `SettingTab.tsx` (осталось 6). Остальное привязать к фазе 3 (декларативный Settings API): при миграции вкладки файлы переписываются типизированными |
| Одиночные маркеры | `src/core/*`, `src/database/*`, `src/pgworker/*`, `src/utils/*`, `src/event-listener.ts` (по 1) | Выжигать попутно при любом изменении этих модулей — самые дешёвые победы |

## История

- 2026-09-27 (1.6.0) — первый замер и заморозка: 78 маркеров / 31 файл;
  снят blanket-`@ts-nocheck` с `src/main.ts` → 77 / 30.
- 2026-09-28 (1.6.9) — hygiene-серия по рекомендациям валидатора сняла
  `@ts-expect-error` с `src/database/database-manager.ts` → 76 / 29.
- 2026-09-28 (1.6.16) — выгорание entrypoint-кластера: снят
  blanket-`@ts-nocheck` с `src/main.desktop.ts` (−1 nocheck, −3
  `@ts-expect-error` на `editor.cm`) и с обёртки `src/ChatView.tsx`
  (−1 nocheck, −4 `@ts-ignore`), снят мёртвый `@ts-ignore` в
  `SettingTab.tsx` → **66 маркеров / 27 файлов** (nocheck 14, ignore 14,
  expect-error 38).
- 2026-09-29 (1.6.18) — выгорание кластера #2 захода 3 фазы 2
  (`ModelProviderSettings.tsx`): оба `@ts-ignore` (plugin.settings /
  plugin.setSettings) сняты переводом пропа компонента на
  `InfioPluginLike`, плюс `@ts-ignore` передачи plugin в `SettingTab.tsx`
  → **63 маркера / 26 файлов** (nocheck 14, ignore 11, expect-error 38).
  Тот же коммит обнулил eslint-долг файла: 149 → 0 (baseline 826/122 →
  675/121).
- 2026-09-29 (1.6.21) — выгорание кластера «Парсер ICF-блоков»
  (`src/utils/parse-icf-block.ts`): сняты blanket-`@ts-nocheck` и все 30
  `@ts-expect-error` («parse5 node value type»). Парсер переведён на
  типизированную обработку дерева parse5 без подавлений и кастов:
  дискриминанты `nodeName`, guards `isTextNode`/`isRecord`, raw-slice
  контента через source-оффсеты, runtime-валидаторы JSON5-payload'ов
  (`toSearchReplaceOperations`, `toManageFilesOperations`,
  `toStringArray`, `toStartLine`). Попутно исправлены: тихая потеря
  вложенной разметки в `<content>`/`<diff>`/`<result>` (порча файла при
  Apply), краш рендера сообщения на не-массиве `operations`
  (`operations.map`), не-строковые элементы `urls`, `NaN` в `lineCount`,
  строковый `start_line` в insert_content. → **32 маркера / 25 файлов**
  (nocheck 13, ignore 11, expect-error 8). Тот же коммит обнулил
  eslint-долг файла: 51 → 0 (baseline 596/120 → 545/119); добавлен
  `src/utils/parse-icf-block.test.ts` — 66 тестов на все 22 тега,
  стриминг и каждую регрессию.

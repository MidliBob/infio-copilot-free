/**
 * Declarative Settings API bridge (phase 3, item 1 — wave 1.1).
 *
 * Obsidian 1.13+ calls `PluginSettingTab.getSettingDefinitions()` and
 * SKIPS `display()` when the tab provides definitions. This module builds
 * the definition tree for `InfioSettingTab`:
 *
 *   - the About banner is a `render` definition at the top of the tab, so
 *     the plugin identity stays visible the moment settings are opened
 *     (field feedback on wave 1: a page row hid it behind a click);
 *   - sections migrated to native declarative controls are emitted as
 *     `group`/`page items` (Model parameters — a page with five native
 *     number controls for a uniform look; Chat behavior — an inline
 *     group): their values are indexed by Obsidian's global settings
 *     search and edited with native controls bound through
 *     getControlValue/setControlValue;
 *   - every other section is a `page` item whose factory mounts the
 *     existing (React / imperative Setting-row) section renderer with
 *     `embedded = true`: inside a declarative page the section skips its
 *     own heading/collapsible chrome — the page navigation row IS the
 *     heading (fixes the double-spoiler of RAG/AutoComplete in wave 1).
 *
 * Hosts older than 1.13 never call getSettingDefinitions() and render
 * display() exactly as before — the dual-support pattern from the official
 * migration guide (Path B), no runtime version detection needed.
 *
 * CRITICAL for <1.13 hosts: `SettingPage` does not exist there, so no
 * top-level `class ... extends SettingPage` may be evaluated at import
 * time (it would throw "Class extends value undefined" and break plugin
 * load). createSectionPage() therefore declares the subclass INSIDE the
 * factory function, which only 1.13+ hosts ever invoke.
 *
 * Controls bind dotted settings paths (e.g. 'modelOptions.temperature') —
 * the officially documented recipe for nested settings.
 * InfioSettingTab.getControlValue/setControlValue resolve those paths with
 * readSettingPath/writeSettingPath below; every write is re-validated with
 * InfioSettingsSchema.safeParse before reaching plugin.setSettings, so an
 * out-of-range value is rejected instead of persisted.
 *
 * Wave-1 known limitation (identical to the legacy display() path, so not a
 * regression): the React section renderers create a fresh createRoot per
 * mount and never unmount previous ones; pages empty their container on
 * display()/hide() like the tab always did. Proper root lifecycle arrives
 * as sections turn native in the following waves.
 */
import { SettingPage } from 'obsidian'
import type {
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingDefinitionPage,
	SettingDefinitionRender,
} from 'obsidian'

import { t } from '../lang/helpers'
import { type InfioSettings, InfioSettingsSchema } from '../types/settings'
import { logger } from '../utils/logger'
import { DEFAULT_SETTINGS } from './versions'
import {
	MAX_FREQUENCY_PENALTY,
	MAX_PRESENCE_PENALTY,
	MAX_TOP_P,
	MIN_FREQUENCY_PENALTY,
	MIN_MAX_TOKENS,
	MIN_PRESENCE_PENALTY,
	MIN_TEMPERATURE,
	MIN_TOP_P,
} from './versions/shared'

/**
 * Structural host contract satisfied by InfioSettingTab. Keeping this
 * structural (instead of importing the tab class) avoids an import cycle
 * and keeps the unit tests free of the React component tree.
 *
 * `embedded` on the four imperative renderers: when true the section is
 * being mounted inside a declarative page and must skip its own
 * heading/collapsible chrome.
 */
export interface DeclarativeSettingsHost {
	plugin: {
		settings: InfioSettings
		setSettings: (next: InfioSettings) => Promise<void>
	}
	renderPluginInfoSection(el: HTMLElement): void
	renderModelsSection(el: HTMLElement): void
	renderFilesSearchSection(el: HTMLElement, embedded?: boolean): void
	renderDeepResearchSection(el: HTMLElement, embedded?: boolean): void
	renderRAGSection(el: HTMLElement, embedded?: boolean): void
	renderAutoCompleteSection(el: HTMLElement, embedded?: boolean): void
}

/** Parsed once at import: the schema-validated default settings object. */
const SETTINGS_DEFAULTS: InfioSettings = InfioSettingsSchema.parse({
	...DEFAULT_SETTINGS,
})

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/**
 * Reads a dotted path ('modelOptions.temperature') from the settings
 * object. Returns undefined when any segment is missing or traverses a
 * non-record value — the host then falls back to the control's
 * defaultValue.
 */
export function readSettingPath(settings: InfioSettings, path: string): unknown {
	let current: unknown = settings
	for (const part of path.split('.')) {
		if (!isRecord(current)) {
			return undefined
		}
		current = current[part]
	}
	return current
}

/**
 * Immutably writes a dotted path into the settings object and returns the
 * candidate. The result is unknown by contract: the caller MUST validate
 * it with InfioSettingsSchema before persisting (setControlValue does).
 */
export function writeSettingPath(
	settings: InfioSettings,
	path: string,
	value: unknown,
): unknown {
	const parts = path.split('.')
	const setIn = (base: unknown, index: number): unknown => {
		if (index === parts.length) {
			return value
		}
		const part = parts[index]
		if (part === undefined) {
			return value
		}
		const next: Record<string, unknown> = isRecord(base) ? { ...base } : {}
		next[part] = setIn(next[part], index + 1)
		return next
	}
	return setIn(settings, 0)
}

/** Validates a candidate produced by writeSettingPath; logs on rejection. */
export function parseSettingsCandidate(
	candidate: unknown,
	key: string,
): InfioSettings | null {
	const parsed = InfioSettingsSchema.safeParse(candidate)
	if (!parsed.success) {
		logger.warn(
			`[icf] declarative settings: rejected invalid value for "${key}"`,
			parsed.error.issues,
		)
		return null
	}
	return parsed.data
}

/**
 * Builds a SettingPage hosting one legacy section renderer.
 *
 * The subclass is created INSIDE this factory on purpose: evaluating
 * `extends SettingPage` at module scope would crash plugin load on
 * pre-1.13 hosts where the base class does not exist. The factory itself
 * is only ever invoked by 1.13+ hosts.
 */
export function createSectionPage(
	title: string,
	renderSection: (el: HTMLElement) => void,
): SettingPage {
	class SectionPageImpl extends SettingPage {
		display(): void {
			this.containerEl.empty()
			renderSection(this.containerEl)
		}

		hide(): void {
			super.hide()
			this.containerEl.empty()
		}
	}
	const page = new SectionPageImpl()
	page.title = title
	return page
}

function legacyPage(
	nameKey: string,
	renderSection: (host: DeclarativeSettingsHost, el: HTMLElement) => void,
	host: DeclarativeSettingsHost,
): SettingDefinitionPage {
	return {
		type: 'page',
		name: t(nameKey),
		page: () =>
			createSectionPage(t(nameKey), (el) => {
				renderSection(host, el)
			}),
	}
}

/**
 * The About banner as a full-width render row at the top of the tab:
 * visible immediately when settings open (wave-1 field feedback),
 * excluded from the settings search (it is not a setting).
 */
function aboutDefinition(host: DeclarativeSettingsHost): SettingDefinitionRender {
	return {
		name: t('settings.PluginInfo.title'),
		searchable: false,
		render: (setting) => {
			setting.setClass('icf-defs-fullwidth')
			host.renderPluginInfoSection(setting.controlEl)
		},
	}
}

function modelParametersPage(): SettingDefinitionPage {
	return {
		type: 'page',
		name: t('settings.ModelParameters.title'),
		items: [
			{
				name: t('settings.ModelParameters.temperature'),
				desc: t('settings.ModelParameters.temperatureDescription'),
				control: {
					type: 'number',
					key: 'modelOptions.temperature',
					defaultValue: SETTINGS_DEFAULTS.modelOptions.temperature,
					min: MIN_TEMPERATURE,
					step: 'any',
				},
			},
			{
				name: t('settings.ModelParameters.topP'),
				desc: t('settings.ModelParameters.topPDescription'),
				control: {
					type: 'number',
					key: 'modelOptions.top_p',
					defaultValue: SETTINGS_DEFAULTS.modelOptions.top_p,
					min: MIN_TOP_P,
					max: MAX_TOP_P,
					step: 'any',
				},
			},
			{
				name: t('settings.ModelParameters.frequencyPenalty'),
				desc: t('settings.ModelParameters.frequencyPenaltyDescription'),
				control: {
					type: 'number',
					key: 'modelOptions.frequency_penalty',
					defaultValue: SETTINGS_DEFAULTS.modelOptions.frequency_penalty,
					min: MIN_FREQUENCY_PENALTY,
					max: MAX_FREQUENCY_PENALTY,
					step: 'any',
				},
			},
			{
				name: t('settings.ModelParameters.presencePenalty'),
				desc: t('settings.ModelParameters.presencePenaltyDescription'),
				control: {
					type: 'number',
					key: 'modelOptions.presence_penalty',
					defaultValue: SETTINGS_DEFAULTS.modelOptions.presence_penalty,
					min: MIN_PRESENCE_PENALTY,
					max: MAX_PRESENCE_PENALTY,
					step: 'any',
				},
			},
			{
				name: t('settings.ModelParameters.maxTokens'),
				desc: t('settings.ModelParameters.maxTokensDescription'),
				control: {
					type: 'number',
					key: 'modelOptions.max_tokens',
					defaultValue: SETTINGS_DEFAULTS.modelOptions.max_tokens,
					min: MIN_MAX_TOKENS,
					step: 1,
				},
			},
		],
	}
}

function chatBehaviorGroup(): SettingDefinitionGroup {
	return {
		type: 'group',
		heading: t('settings.ChatBehavior.title'),
		items: [
			{
				name: t('settings.ChatBehavior.defaultMention'),
				desc: t('settings.ChatBehavior.defaultMentionDescription'),
				control: {
					type: 'dropdown',
					key: 'defaultMention',
					defaultValue: SETTINGS_DEFAULTS.defaultMention,
					options: {
						none: t('settings.ChatBehavior.none'),
						'current-file': t('settings.ChatBehavior.currentFile'),
						vault: t('settings.ChatBehavior.vault'),
					},
				},
			},
		],
	}
}

/**
 * Builds the full definition tree, in the exact order display() renders
 * its eight sections. Cheap by contract (the host calls this on every tab
 * update and once at registration for search indexing): only closures and
 * t() lookups, no DOM, no I/O.
 */
export function buildSettingDefinitions(
	host: DeclarativeSettingsHost,
): SettingDefinitionItem[] {
	return [
		aboutDefinition(host),
		legacyPage('settings.Models.title', (h, el) => h.renderModelsSection(el), host),
		modelParametersPage(),
		legacyPage('settings.FilesSearch.title', (h, el) => h.renderFilesSearchSection(el, true), host),
		chatBehaviorGroup(),
		legacyPage('settings.WebSearch.title', (h, el) => h.renderDeepResearchSection(el, true), host),
		legacyPage('settings.RAG.title', (h, el) => h.renderRAGSection(el, true), host),
		legacyPage('settings.AutoComplete.title', (h, el) => h.renderAutoCompleteSection(el, true), host),
	]
}

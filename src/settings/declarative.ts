/**
 * Declarative Settings API bridge (phase 3, item 1 — wave 1).
 *
 * Obsidian 1.13+ calls `PluginSettingTab.getSettingDefinitions()` and
 * SKIPS `display()` when the tab provides definitions. This module builds
 * the definition tree for `InfioSettingTab`:
 *
 *   - sections already migrated to native declarative controls are emitted
 *     as `group` items (Model parameters, Chat behavior): their values are
 *     indexed by Obsidian's global settings search and edited with native
 *     controls bound through getControlValue/setControlValue;
 *   - every other section is emitted as a `page` item whose factory mounts
 *     the existing (React / imperative Setting-row) section renderer
 *     unchanged, so the familiar UI survives inside the declarative shell.
 *
 * Hosts older than 1.13 never call getSettingDefinitions() and render
 * display() exactly as before — the dual-support pattern from the official
 * migration guide (Path B), no runtime version detection needed.
 *
 * Controls bind dotted settings paths (e.g. 'modelOptions.temperature').
 * InfioSettingTab.getControlValue/setControlValue resolve those paths with
 * readSettingPath/writeSettingPath below; every write is re-validated with
 * InfioSettingsSchema.safeParse before reaching plugin.setSettings, so an
 * out-of-range value is rejected instead of persisted.
 *
 * Wave-1 known limitation (identical to the legacy display() path, so not a
 * regression): the React section renderers create a fresh createRoot per
 * mount and never unmount previous ones; SectionPage empties its container
 * on display()/hide() like the tab always did. Proper root lifecycle
 * arrives as sections turn native in the following waves.
 */
import { SettingPage } from 'obsidian'
import type {
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingDefinitionPage,
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
 */
export interface DeclarativeSettingsHost {
	plugin: {
		settings: InfioSettings
		setSettings: (next: InfioSettings) => Promise<void>
	}
	renderPluginInfoSection(el: HTMLElement): void
	renderModelsSection(el: HTMLElement): void
	renderFilesSearchSection(el: HTMLElement): void
	renderDeepResearchSection(el: HTMLElement): void
	renderRAGSection(el: HTMLElement): void
	renderAutoCompleteSection(el: HTMLElement): void
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

/** A SettingPage hosting one legacy section renderer, unchanged. */
export class SectionPage extends SettingPage {
	private readonly renderSection: (el: HTMLElement) => void

	constructor(title: string, renderSection: (el: HTMLElement) => void) {
		super()
		this.title = title
		this.renderSection = renderSection
	}

	display(): void {
		this.containerEl.empty()
		this.renderSection(this.containerEl)
	}

	hide(): void {
		super.hide()
		this.containerEl.empty()
	}
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
			new SectionPage(t(nameKey), (el) => {
				renderSection(host, el)
			}),
	}
}

function modelParametersGroup(): SettingDefinitionGroup {
	return {
		type: 'group',
		heading: t('settings.ModelParameters.title'),
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
		legacyPage('settings.PluginInfo.title', (h, el) => h.renderPluginInfoSection(el), host),
		legacyPage('settings.Models.title', (h, el) => h.renderModelsSection(el), host),
		modelParametersGroup(),
		legacyPage('settings.FilesSearch.title', (h, el) => h.renderFilesSearchSection(el), host),
		chatBehaviorGroup(),
		legacyPage('settings.WebSearch.title', (h, el) => h.renderDeepResearchSection(el), host),
		legacyPage('settings.RAG.title', (h, el) => h.renderRAGSection(el), host),
		legacyPage('settings.AutoComplete.title', (h, el) => h.renderAutoCompleteSection(el), host),
	]
}

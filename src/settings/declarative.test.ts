/**
 * Unit tests for the declarative Settings API bridge (phase 3, item 1,
 * wave 1): definition-tree structure, dotted-path plumbing behind
 * getControlValue/setControlValue, and the zod guard on writes.
 */
import { SettingPage } from 'obsidian'
import type {
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingDefinitionPage,
} from 'obsidian'

import { t } from '../lang/helpers'
import { type InfioSettings, InfioSettingsSchema } from '../types/settings'
import {
	type DeclarativeSettingsHost,
	SectionPage,
	buildSettingDefinitions,
	parseSettingsCandidate,
	readSettingPath,
	writeSettingPath,
} from './declarative'
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

function makeDefaults(): InfioSettings {
	return InfioSettingsSchema.parse({ ...DEFAULT_SETTINGS })
}

interface FakeHost {
	host: DeclarativeSettingsHost
	settings: InfioSettings
	setSettings: jest.Mock
	renderers: Record<string, jest.Mock>
}

function makeHost(): FakeHost {
	const settings = makeDefaults()
	const setSettings = jest.fn(async (next: InfioSettings) => {
		host.plugin.settings = next
	})
	const renderers: Record<string, jest.Mock> = {
		pluginInfo: jest.fn(),
		models: jest.fn(),
		filesSearch: jest.fn(),
		deepResearch: jest.fn(),
		rag: jest.fn(),
		autoComplete: jest.fn(),
	}
	const host: DeclarativeSettingsHost = {
		plugin: { settings, setSettings },
		renderPluginInfoSection: renderers.pluginInfo,
		renderModelsSection: renderers.models,
		renderFilesSearchSection: renderers.filesSearch,
		renderDeepResearchSection: renderers.deepResearch,
		renderRAGSection: renderers.rag,
		renderAutoCompleteSection: renderers.autoComplete,
	}
	return { host, settings, setSettings, renderers }
}

function itemName(item: SettingDefinitionItem): string | undefined {
	return 'name' in item ? item.name : item.heading
}

function isGroup(item: SettingDefinitionItem): item is SettingDefinitionGroup {
	return 'type' in item && item.type === 'group'
}

function isPage(item: SettingDefinitionItem): item is SettingDefinitionPage {
	return 'type' in item && item.type === 'page'
}

function controlKeys(group: SettingDefinitionGroup): string[] {
	return (group.items ?? []).map((item) =>
		'control' in item && item.control ? item.control.key : '',
	)
}

describe('buildSettingDefinitions', () => {
	it('emits the eight sections in display() order', () => {
		const defs = buildSettingDefinitions(makeHost().host)
		expect(defs).toHaveLength(8)
		expect(defs.map(itemName)).toEqual([
			t('settings.PluginInfo.title'),
			t('settings.Models.title'),
			t('settings.ModelParameters.title'),
			t('settings.FilesSearch.title'),
			t('settings.ChatBehavior.title'),
			t('settings.WebSearch.title'),
			t('settings.RAG.title'),
			t('settings.AutoComplete.title'),
		])
	})

	it('migrates Model parameters to five native number controls on dotted keys', () => {
		const defs = buildSettingDefinitions(makeHost().host)
		const group = defs[2]
		if (!group || !isGroup(group)) {
			throw new Error('expected the Model parameters group at index 2')
		}
		expect(controlKeys(group)).toEqual([
			'modelOptions.temperature',
			'modelOptions.top_p',
			'modelOptions.frequency_penalty',
			'modelOptions.presence_penalty',
			'modelOptions.max_tokens',
		])
		const items = group.items ?? []
		const ranges: Array<[number | undefined, number | undefined, number | 'any' | undefined]> = []
		for (const item of items) {
			if ('control' in item && item.control && item.control.type === 'number') {
				ranges.push([item.control.min, item.control.max, item.control.step])
			}
		}
		expect(ranges).toEqual([
			[MIN_TEMPERATURE, undefined, 'any'],
			[MIN_TOP_P, MAX_TOP_P, 'any'],
			[MIN_FREQUENCY_PENALTY, MAX_FREQUENCY_PENALTY, 'any'],
			[MIN_PRESENCE_PENALTY, MAX_PRESENCE_PENALTY, 'any'],
			[MIN_MAX_TOKENS, undefined, 1],
		])
	})

	it('migrates Chat behavior to a native dropdown with the exact legacy options', () => {
		const defs = buildSettingDefinitions(makeHost().host)
		const group = defs[4]
		if (!group || !isGroup(group)) {
			throw new Error('expected the Chat behavior group at index 4')
		}
		const items = group.items ?? []
		expect(items).toHaveLength(1)
		const item = items[0]
		if (!item || !('control' in item) || !item.control || item.control.type !== 'dropdown') {
			throw new Error('expected a dropdown control')
		}
		expect(item.control.key).toBe('defaultMention')
		expect(Object.keys(item.control.options).sort()).toEqual([
			'current-file',
			'none',
			'vault',
		])
		expect(item.control.options['none']).toBe(t('settings.ChatBehavior.none'))
		expect(item.control.options['current-file']).toBe(t('settings.ChatBehavior.currentFile'))
		expect(item.control.options['vault']).toBe(t('settings.ChatBehavior.vault'))
	})

	it('wraps the six legacy sections in pages that mount the existing renderers', () => {
		const { host, renderers } = makeHost()
		const defs = buildSettingDefinitions(host)
		const pages = defs.filter(isPage)
		expect(pages).toHaveLength(6)
		const cases: Array<[string, jest.Mock]> = [
			[t('settings.PluginInfo.title'), renderers.pluginInfo],
			[t('settings.Models.title'), renderers.models],
			[t('settings.FilesSearch.title'), renderers.filesSearch],
			[t('settings.WebSearch.title'), renderers.deepResearch],
			[t('settings.RAG.title'), renderers.rag],
			[t('settings.AutoComplete.title'), renderers.autoComplete],
		]
		for (const [name, renderer] of cases) {
			const def = pages.find((page) => page.name === name)
			if (!def || !def.page) {
				throw new Error(`missing page definition for ${name}`)
			}
			const page = def.page()
			expect(page).toBeInstanceOf(SectionPage)
			expect(page).toBeInstanceOf(SettingPage)
			expect(page.title).toBe(name)
			page.display()
			expect(renderer).toHaveBeenCalledTimes(1)
			expect(renderer).toHaveBeenCalledWith(page.containerEl)
		}
	})
})

describe('readSettingPath / writeSettingPath', () => {
	it('reads flat and dotted paths', () => {
		const defaults = makeDefaults()
		expect(readSettingPath(defaults, 'defaultMention')).toBe(defaults.defaultMention)
		expect(readSettingPath(defaults, 'modelOptions.temperature')).toBe(
			defaults.modelOptions.temperature,
		)
	})

	it('returns undefined for missing segments and paths through primitives', () => {
		const defaults = makeDefaults()
		expect(readSettingPath(defaults, 'modelOptions.notAKey')).toBeUndefined()
		expect(readSettingPath(defaults, 'defaultMention.deeper')).toBeUndefined()
		expect(readSettingPath(defaults, 'notASection.key')).toBeUndefined()
	})

	it('writes immutably and produces a schema-valid candidate', () => {
		const defaults = makeDefaults()
		const candidate = writeSettingPath(defaults, 'modelOptions.temperature', 0.4242)
		const parsed = parseSettingsCandidate(candidate, 'modelOptions.temperature')
		expect(parsed).not.toBeNull()
		expect(parsed?.modelOptions.temperature).toBe(0.4242)
		// the source object is untouched (immutable update)
		expect(defaults.modelOptions.temperature).not.toBe(0.4242)
		// sibling keys survive the nested write
		expect(parsed?.modelOptions.max_tokens).toBe(defaults.modelOptions.max_tokens)
	})
})

describe('parseSettingsCandidate (the setControlValue guard)', () => {
	it('rejects values the schema forbids instead of persisting them', () => {
		const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			const defaults = makeDefaults()
			expect(
				parseSettingsCandidate(
					writeSettingPath(defaults, 'modelOptions.max_tokens', 10),
					'modelOptions.max_tokens',
				),
			).toBeNull() // below MIN_MAX_TOKENS
			expect(
				parseSettingsCandidate(
					writeSettingPath(defaults, 'modelOptions.top_p', 5),
					'modelOptions.top_p',
				),
			).toBeNull() // above MAX_TOP_P
			expect(warnSpy).toHaveBeenCalledTimes(2)
			// defaultMention carries .catch('none') in the schema: an invalid
			// value is not rejected but degrades to the enum fallback — pin
			// that behavior so the guard's semantics stay explicit
			const mention = parseSettingsCandidate(
				writeSettingPath(defaults, 'defaultMention', 'not-a-mention'),
				'defaultMention',
			)
			expect(mention?.defaultMention).toBe('none')
		} finally {
			warnSpy.mockRestore()
		}
	})
})

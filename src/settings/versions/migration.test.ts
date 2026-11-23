import {
	DEFAULT_SETTINGS as DEFAULT_SETTINGS_V0,
	type Settings as SettingsV0,
} from './v0/v0'
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS_V1 } from './v1/v1'
import { isSettingsV1, migrateFromV0ToV1 } from './migration'

/** A v0 settings object that is still byte-identical to the v0 defaults. */
function defaultV0Settings(): SettingsV0 {
	return structuredClone(DEFAULT_SETTINGS_V0)
}

describe('migrateFromV0ToV1', () => {
	it('stamps version "1" and produces settings the v1 schema accepts', () => {
		const migrated = migrateFromV0ToV1(defaultV0Settings())

		expect(migrated.version).toBe('1')
		expect(isSettingsV1(migrated)).toBe(true)
	})

	it('carries release defaults over paths the user never customized', () => {
		const migrated = migrateFromV0ToV1(defaultV0Settings())

		expect(migrated.delay).toBe(DEFAULT_SETTINGS_V1.delay)
		expect(migrated.maxPrefixCharLimit).toBe(DEFAULT_SETTINGS_V1.maxPrefixCharLimit)
		expect(migrated.systemMessage).toBe(DEFAULT_SETTINGS_V1.systemMessage)
	})

	it('keeps values the user did customize', () => {
		const settings = defaultV0Settings()
		settings.delay = 1500
		settings.systemMessage = 'Custom system message for the migration test'

		const migrated = migrateFromV0ToV1(settings)

		expect(migrated.delay).toBe(1500)
		expect(migrated.systemMessage).toBe('Custom system message for the migration test')
	})

	it('seeds the fields that only exist in v1', () => {
		const migrated = migrateFromV0ToV1(defaultV0Settings())

		expect(migrated.ollamaApiSettings).toEqual(DEFAULT_SETTINGS_V1.ollamaApiSettings)
		expect(migrated.ignoredFilePatterns).toBe(DEFAULT_SETTINGS_V1.ignoredFilePatterns)
		expect(migrated.ignoredTags).toBe(DEFAULT_SETTINGS_V1.ignoredTags)
		expect(migrated.cacheSuggestions).toBe(DEFAULT_SETTINGS_V1.cacheSuggestions)
		expect(migrated.debugMode).toBe(DEFAULT_SETTINGS_V1.debugMode)
	})

	it('anchors regex triggers with "$"', () => {
		const settings = defaultV0Settings()
		settings.triggers = [{ type: 'regex', value: '\\bTODO' }]

		const migrated = migrateFromV0ToV1(settings)

		expect(migrated.triggers).toEqual([{ type: 'regex', value: '\\bTODO$' }])
	})

	it('drops empty triggers and regexes that still do not compile', () => {
		const settings = defaultV0Settings()
		settings.triggers = [
			{ type: 'string', value: '' },
			{ type: 'regex', value: '[unclosed' },
			{ type: 'string', value: '# ' },
		]

		const migrated = migrateFromV0ToV1(settings)

		expect(migrated.triggers).toEqual([{ type: 'string', value: '# ' }])
	})

	it('falls back to the v1 default when chainOfThoughRemovalRegex does not compile', () => {
		const settings = defaultV0Settings()
		settings.chainOfThoughRemovalRegex = '(unclosed'

		const migrated = migrateFromV0ToV1(settings)

		expect(migrated.chainOfThoughRemovalRegex).toBe(
			DEFAULT_SETTINGS_V1.chainOfThoughRemovalRegex,
		)
	})
})

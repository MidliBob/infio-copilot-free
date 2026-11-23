import {
	deserializeSettings,
	findEqualPaths,
	isRegexValid,
	isValidIgnorePattern,
	serializeSettings,
} from './auto-complete'

import { DEFAULT_SETTINGS as DEFAULT_SETTINGS_V0 } from '../settings/versions/v0/v0'
import { migrateFromV0ToV1 } from '../settings/versions/migration'

import type { Settings as SettingsV1 } from '../settings/versions/v1/v1'

/** A v1 settings object produced by the (tested) v0 -> v1 migration. */
function migratedV1Settings(): SettingsV1 {
	return migrateFromV0ToV1(structuredClone(DEFAULT_SETTINGS_V0))
}

describe('deserializeSettings', () => {
	it('round-trips settings that serializeSettings produced', () => {
		const settings = migratedV1Settings()

		const result = deserializeSettings(serializeSettings(settings))

		expect(result.isOk()).toBe(true)
		expect(result._unsafeUnwrap()).toEqual(settings)
	})

	it('repairs a value that fails the schema by replacing it with the default', () => {
		// The pre-0006 file referenced an unimported `settingsSchema` here, so
		// this repair path threw a ReferenceError instead of returning a Result.
		const broken: Record<string, unknown> = { ...migratedV1Settings(), delay: 'soon' }

		const result = deserializeSettings({ settings: broken })

		expect(result.isOk()).toBe(true)
		expect(result._unsafeUnwrap().delay).toBe(500)
	})

	it('drops keys the v1 schema does not recognize', () => {
		const extra: Record<string, unknown> = { ...migratedV1Settings(), bogus: 1 }

		const result = deserializeSettings({ settings: extra })

		expect(result.isOk()).toBe(true)
		expect(result._unsafeUnwrap()).toEqual(migratedV1Settings())
	})

	it('documents the current gap: a payload without settings is not repaired', () => {
		// DEFAULT_SETTINGS_V1 has no `enabled` and no `version` (it still says
		// `autocompleteEnabled`, and `version` is commented out), so the repair
		// pass cannot supply the two required keys and gives up. Fixing that
		// defaults object is a separate patch; this test pins today's contract.
		expect(deserializeSettings(undefined).isErr()).toBe(true)
	})
})

describe('pattern helpers', () => {
	it('validates regexes', () => {
		expect(isRegexValid('(.|\\n)*ANSWER:')).toBe(true)
		expect(isRegexValid('(unclosed')).toBe(false)
	})

	it('accepts a valid ignore pattern', () => {
		expect(isValidIgnorePattern('**/secret/**')).toBe(true)
	})
})

describe('findEqualPaths', () => {
	it('lists the paths whose values are equal, including nested ones', () => {
		const user = { delay: 500, modelOptions: { temperature: 1, top_p: 0.5 } }
		const defaults = { delay: 500, modelOptions: { temperature: 1, top_p: 1 } }

		expect(findEqualPaths(user, defaults).sort()).toEqual([
			'delay',
			'modelOptions.temperature',
		])
	})

	it('returns no paths for non-object inputs', () => {
		expect(findEqualPaths(5, 5)).toEqual([])
		expect(findEqualPaths('a', 'a')).toEqual([])
	})
})

import { TRANSFORMATIONS, TransformationType } from '../core/transformations/trans-engine'

import { findTransformationConfig } from './glob-utils'

describe('findTransformationConfig', () => {
	it('resolves a stored insight_type to its transformation config', () => {
		const config = findTransformationConfig(TransformationType.DENSE_SUMMARY)

		expect(config).toBe(TRANSFORMATIONS[TransformationType.DENSE_SUMMARY])
		expect(config?.description.length).toBeGreaterThan(0)
	})

	it('resolves every transformation type', () => {
		for (const type of Object.values(TransformationType)) {
			expect(findTransformationConfig(type)).toBe(TRANSFORMATIONS[type])
		}
	})

	it('returns undefined for an insight_type this build does not know', () => {
		expect(findTransformationConfig('legacy_type_from_older_build')).toBeUndefined()
		expect(findTransformationConfig('')).toBeUndefined()
	})
})

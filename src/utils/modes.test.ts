import { ModeConfig, isCustomMode } from './modes'

const mode = (slug: string): ModeConfig => ({
	slug,
	name: slug,
	roleDefinition: 'test role',
	groups: [],
})

describe('isCustomMode', () => {
	it('returns true when the slug matches a custom mode', () => {
		expect(isCustomMode('plan', [mode('plan'), mode('code')])).toBe(true)
	})

	it('returns false when no custom mode matches', () => {
		expect(isCustomMode('missing', [mode('plan')])).toBe(false)
	})

	it('returns false for an empty list', () => {
		expect(isCustomMode('plan', [])).toBe(false)
	})

	it('returns a real boolean false when customModes is omitted', () => {
		// Regression guard for the 1.7.16 lint burn: the old implementation
		// was `!!customModes?.some(...)`; a naive `!!`-removal would return
		// undefined here and silently break the declared boolean contract.
		const result = isCustomMode('plan')
		expect(result).toBe(false)
		expect(typeof result).toBe('boolean')
	})
})

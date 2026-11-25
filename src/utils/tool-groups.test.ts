import { getToolName, getToolOptions, isToolName } from './tool-groups'

describe('isToolName', () => {
	it('accepts the registered tool names', () => {
		expect(isToolName('read_file')).toBe(true)
		expect(isToolName('switch_mode')).toBe(true)
	})

	it('rejects unknown names', () => {
		expect(isToolName('unknown_tool')).toBe(false)
		expect(isToolName('')).toBe(false)
	})

	it('does not accept Object prototype keys', () => {
		expect(isToolName('toString')).toBe(false)
		expect(isToolName('constructor')).toBe(false)
	})
})

describe('getToolName', () => {
	it('returns a registered tool name from a plain string', () => {
		expect(getToolName('apply_diff')).toBe('apply_diff')
	})

	it('returns the first element of a tuple config', () => {
		expect(getToolName(['write_to_file', { some: 'option' }])).toBe('write_to_file')
	})

	it('returns undefined for a name this build does not know', () => {
		expect(getToolName('legacy_tool')).toBeUndefined()
		expect(getToolName('toString')).toBeUndefined()
	})
})

describe('getToolOptions', () => {
	it('returns undefined for a plain string config', () => {
		expect(getToolOptions('read_file')).toBeUndefined()
	})

	it('returns the second element of a tuple config', () => {
		expect(getToolOptions(['read_file', { maxLines: 10 }])).toEqual({ maxLines: 10 })
	})
})

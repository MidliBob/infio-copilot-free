import type { ModeConfig } from './modes'

import { FileRestrictionError, getToolsForMode, isToolAllowedForMode } from './modes'

function modeWithGroups(groups: ModeConfig['groups'], slug = 'custom'): ModeConfig {
	return {
		slug,
		name: `Mode ${slug}`,
		roleDefinition: 'You are a test mode.',
		groups,
	}
}

describe('getToolsForMode', () => {
	it('collects the group tools and always adds the always-available ones', () => {
		const tools = getToolsForMode(['read', 'edit'])

		expect(tools).toEqual(
			expect.arrayContaining(['read_file', 'apply_diff', 'switch_mode', 'attempt_completion']),
		)
		// No duplicates even though several groups share the always-available tools.
		expect(new Set(tools).size).toBe(tools.length)
	})
})

describe('isToolAllowedForMode', () => {
	it('allows a tool that belongs to one of the mode groups', () => {
		expect(isToolAllowedForMode('read_file', 'ask', [])).toBe(true)
	})

	it('rejects a tool outside every mode group', () => {
		expect(isToolAllowedForMode('apply_diff', 'ask', [])).toBe(false)
	})

	it('allows the always-available tools regardless of the groups', () => {
		const noGroups = modeWithGroups([], 'bare')

		expect(isToolAllowedForMode('switch_mode', 'bare', [noGroups])).toBe(true)
		expect(isToolAllowedForMode('ask_followup_question', 'bare', [noGroups])).toBe(true)
	})

	it('returns false for an unknown mode slug', () => {
		expect(isToolAllowedForMode('read_file', 'no-such-mode', [])).toBe(false)
	})

	it('honours the tool requirement switches', () => {
		expect(isToolAllowedForMode('read_file', 'ask', [], { read_file: false })).toBe(false)
		expect(isToolAllowedForMode('read_file', 'ask', [], { read_file: true })).toBe(true)
	})

	describe('edit-group file restrictions', () => {
		const restricted = modeWithGroups([['edit', { fileRegex: '\\.md$', description: 'markdown only' }]], 'md-only')

		it('allows an edit of a matching file', () => {
			expect(
				isToolAllowedForMode('write_to_file', 'md-only', [restricted], undefined, {
					path: 'notes/idea.md',
					content: '# idea',
				}),
			).toBe(true)
		})

		it('throws FileRestrictionError for a non-matching path', () => {
			expect(() =>
				isToolAllowedForMode('write_to_file', 'md-only', [restricted], undefined, {
					path: 'notes/idea.txt',
					content: 'plain text',
				}),
			).toThrow(FileRestrictionError)
		})

		it('does not apply the restriction when the call carries no file payload', () => {
			expect(
				isToolAllowedForMode('write_to_file', 'md-only', [restricted], undefined, {
					path: 'notes/idea.txt',
				}),
			).toBe(true)
		})

		it('does not apply the restriction to non-string paths', () => {
			expect(
				isToolAllowedForMode('write_to_file', 'md-only', [restricted], undefined, {
					path: 42,
					content: 'x',
				}),
			).toBe(true)
		})
	})
})

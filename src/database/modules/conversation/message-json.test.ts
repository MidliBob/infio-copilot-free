import { ApplyStatus } from '../../../types/apply'

import {
	parseStoredAssistantMetadata,
	parseStoredEditorState,
	parseStoredMentionables,
	parseStoredPromptContent,
	parseStoredSimilarityResults,
	toApplyStatus,
} from './message-json'

describe('parseStoredEditorState', () => {
	it('returns null for a blank column', () => {
		expect(parseStoredEditorState(null)).toBeNull()
		expect(parseStoredEditorState(undefined)).toBeNull()
		expect(parseStoredEditorState('')).toBeNull()
	})

	it('returns the stored editor state', () => {
		const state = { root: { children: [], type: 'root', version: 1 } }

		expect(parseStoredEditorState(JSON.stringify(state))).toEqual(state)
	})

	it('degrades a non-object payload to null', () => {
		expect(parseStoredEditorState('42')).toBeNull()
		expect(parseStoredEditorState('{"noRoot":true}')).toBeNull()
	})
})

describe('parseStoredPromptContent', () => {
	it('returns null for a blank column', () => {
		expect(parseStoredPromptContent(null)).toBeNull()
		expect(parseStoredPromptContent('')).toBeNull()
	})

	it('keeps a plain template string as-is', () => {
		expect(parseStoredPromptContent('{{prefix}}<mask/>{{suffix}}')).toBe(
			'{{prefix}}<mask/>{{suffix}}',
		)
	})

	it('parses a JSON content-part array', () => {
		const parts = [{ type: 'text', text: 'hello' }]

		expect(parseStoredPromptContent(JSON.stringify(parts))).toEqual(parts)
	})

	it('keeps a JSON object that is not a content part as the raw template', () => {
		expect(parseStoredPromptContent('{"not":"a content part"}')).toBe('{"not":"a content part"}')
	})
})

describe('parseStoredMentionables', () => {
	it('returns an empty list for a blank column', () => {
		expect(parseStoredMentionables(null)).toEqual([])
	})

	it('parses known mentionables and drops unknown shapes', () => {
		const stored = [
			{ type: 'url', url: 'https://example.com' },
			{ type: 'unsupported' },
			{ type: 'block', content: 'x', file: 'a.md', startLine: 1, endLine: 2 },
		]

		expect(parseStoredMentionables(JSON.stringify(stored))).toEqual([
			{ type: 'url', url: 'https://example.com' },
			{ type: 'block', content: 'x', file: 'a.md', startLine: 1, endLine: 2 },
		])
	})

	it('returns an empty list for a non-array payload', () => {
		expect(parseStoredMentionables('{"type":"url"}')).toEqual([])
	})
})

describe('parseStoredSimilarityResults', () => {
	it('parses stored vector hits', () => {
		const stored = [
			{
				id: 1,
				path: 'notes/a.md',
				mtime: 1700000000,
				content: 'text',
				metadata: { startLine: 1, endLine: 2 },
				similarity: 0.87,
			},
		]

		expect(parseStoredSimilarityResults(JSON.stringify(stored))).toEqual(stored)
	})

	it('returns undefined for a blank or unrecognized column', () => {
		expect(parseStoredSimilarityResults(null)).toBeUndefined()
		expect(parseStoredSimilarityResults('{"not":"an array"}')).toBeUndefined()
	})
})

describe('parseStoredAssistantMetadata', () => {
	it('parses usage and model bookkeeping', () => {
		const stored = { usage: { total_tokens: 12 }, model: { id: 'gpt-4o' } }

		expect(parseStoredAssistantMetadata(JSON.stringify(stored))).toEqual(stored)
	})

	it('returns undefined for a blank or unrecognized column', () => {
		expect(parseStoredAssistantMetadata(null)).toBeUndefined()
		expect(parseStoredAssistantMetadata('"a string"')).toBeUndefined()
	})
})

describe('toApplyStatus', () => {
	it('maps every known status', () => {
		expect(toApplyStatus(ApplyStatus.Idle)).toBe(ApplyStatus.Idle)
		expect(toApplyStatus(ApplyStatus.Applied)).toBe(ApplyStatus.Applied)
		expect(toApplyStatus(ApplyStatus.Failed)).toBe(ApplyStatus.Failed)
		expect(toApplyStatus(ApplyStatus.Rejected)).toBe(ApplyStatus.Rejected)
	})

	it('falls back to Idle for a value from another build', () => {
		expect(toApplyStatus(99)).toBe(ApplyStatus.Idle)
		expect(toApplyStatus(-1)).toBe(ApplyStatus.Idle)
	})
})

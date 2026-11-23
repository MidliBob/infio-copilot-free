import { parseRipgrepOutput } from './ripgrep-regex'
import { logger } from '../../../utils/logger'

function matchRecord(file: string, lineNumber: number, text: string, column = 0): string {
	return JSON.stringify({
		type: 'match',
		data: {
			path: { text: file },
			lines: { text },
			line_number: lineNumber,
			submatches: [{ start: column }],
		},
	})
}

function contextRecord(text: string, lineNumber: number): string {
	return JSON.stringify({
		type: 'context',
		data: { lines: { text }, line_number: lineNumber },
	})
}

describe('parseRipgrepOutput', () => {
	it('builds one result per match record', () => {
		const output = [
			matchRecord('/vault/notes/a.md', 7, 'const answer = 42', 6),
			matchRecord('/vault/notes/b.md', 12, 'answer'),
		].join('\n')

		expect(parseRipgrepOutput(output)).toEqual([
			{
				file: '/vault/notes/a.md',
				line: 7,
				column: 6,
				match: 'const answer = 42',
				beforeContext: [],
				afterContext: [],
			},
			{
				file: '/vault/notes/b.md',
				line: 12,
				column: 0,
				match: 'answer',
				beforeContext: [],
				afterContext: [],
			},
		])
	})

	it('attaches context records to the preceding match', () => {
		const output = [
			contextRecord('orphan before any match', 1),
			matchRecord('/vault/a.md', 5, 'hit'),
			contextRecord('after the match', 6),
		].join('\n')

		const [first] = parseRipgrepOutput(output)
		expect(first.afterContext).toEqual(['after the match'])
		expect(first.beforeContext).toEqual([])
	})

	it('routes lower-numbered context lines of a later window to beforeContext', () => {
		const output = [
			matchRecord('/vault/a.md', 5, 'first'),
			matchRecord('/vault/a.md', 9, 'second'),
			contextRecord('belongs above the second match', 8),
		].join('\n')

		const results = parseRipgrepOutput(output)
		expect(results).toHaveLength(2)
		expect(results[1].beforeContext).toEqual(['belongs above the second match'])
		expect(results[1].afterContext).toEqual([])
	})

	it('skips malformed JSON lines but keeps the records around them', () => {
		const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
		const output = [
			'{not json',
			matchRecord('/vault/a.md', 3, 'kept'),
			'',
			'"still not an envelope"',
			matchRecord('/vault/b.md', 4, 'also kept'),
		].join('\n')

		const results = parseRipgrepOutput(output)
		expect(results.map((result) => result.file)).toEqual(['/vault/a.md', '/vault/b.md'])
		expect(errorSpy).toHaveBeenCalledTimes(1)
		errorSpy.mockRestore()
	})

	it('ignores records that are not match or context', () => {
		const output = [
			JSON.stringify({ type: 'begin', data: { path: { text: '/vault/a.md' } } }),
			matchRecord('/vault/a.md', 1, 'hit'),
			JSON.stringify({ type: 'end', data: { path: { text: '/vault/a.md' } } }),
			JSON.stringify({ type: 'summary', data: { elapsed_total: { secs: 0, nanos: 1 } } }),
		].join('\n')

		expect(parseRipgrepOutput(output)).toHaveLength(1)
	})

	it('drops match records without submatches instead of throwing', () => {
		const output = [
			matchRecord('/vault/a.md', 1, 'kept'),
			JSON.stringify({
				type: 'match',
				data: {
					path: { text: '/vault/broken.md' },
					lines: { text: 'no submatches' },
					line_number: 2,
					submatches: [],
				},
			}),
			matchRecord('/vault/c.md', 3, 'after the broken record'),
		].join('\n')

		const results = parseRipgrepOutput(output)
		expect(results.map((result) => result.file)).toEqual(['/vault/a.md', '/vault/c.md'])
	})
})

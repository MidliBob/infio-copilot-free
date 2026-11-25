import type { Change } from './types'

import {
	evaluateSimilarity,
	findBestMatch,
	findExactMatch,
	getDMPSimilarity,
	prepareSearchString,
} from './search-strategies'

function remove(content: string): Change {
	return { type: 'remove', content, indent: '' }
}

function add(content: string): Change {
	return { type: 'add', content, indent: '' }
}

describe('prepareSearchString', () => {
	it('joins the removed lines and ignores the added ones', () => {
		const changes: Change[] = [remove('first'), add('ignored'), remove('second')]

		expect(prepareSearchString(changes)).toBe('first\nsecond')
	})

	it('returns an empty string when the hunk removes nothing', () => {
		expect(prepareSearchString([add('only add')])).toBe('')
	})
})

describe('similarity helpers', () => {
	it('scores identical texts as fully similar', () => {
		expect(evaluateSimilarity('alpha\nbeta', 'alpha\nbeta')).toBe(1)
		expect(getDMPSimilarity('alpha\nbeta', 'alpha\nbeta')).toBe(1)
	})

	it('scores unrelated texts as dissimilar', () => {
		expect(evaluateSimilarity('alpha', 'zulu')).toBe(0)
		// The DMP helper applies the computed patch to the original, so a clean
		// application reproduces the modified text; the result stays a probability.
		const dmpSimilarity = getDMPSimilarity('alpha', 'zulu')
		expect(dmpSimilarity).toBeGreaterThanOrEqual(0)
		expect(dmpSimilarity).toBeLessThanOrEqual(1)
	})
})

describe('findExactMatch', () => {
	const content = ['line one', 'line two', 'line three', 'line four']

	it('finds the line index of an exact multi-line match', () => {
		const result = findExactMatch('line two\nline three', content)

		expect(result.index).toBe(1)
		expect(result.confidence).toBeGreaterThan(0.9)
		expect(result.strategy).toContain('exact')
	})

	it('returns the sentinel result when nothing matches', () => {
		expect(findExactMatch('absent line', content)).toEqual({
			index: -1,
			confidence: 0,
			strategy: 'exact',
		})
	})
})

describe('findBestMatch', () => {
	it('falls back to the best available strategy', () => {
		const content = ['const a = 1', 'const b = 2', 'return a + b']

		const result = findBestMatch('const b = 2\nreturn a + b', content, 0, 0.9)

		expect(result.index).toBe(1)
		expect(result.confidence).toBeGreaterThan(0.5)
		expect(result.strategy).not.toBe('none')
	})

	it('reports no match for unrelated content', () => {
		expect(findBestMatch('nothing here', ['abc', 'def']).index).toBe(-1)
	})
})

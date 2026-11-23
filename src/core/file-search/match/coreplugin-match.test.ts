import { readMatchOffsets } from './coreplugin-match'

describe('readMatchOffsets', () => {
	it('reads the offset from [matched_text, start_offset] tuples', () => {
		const fileMatches = {
			result: {
				content: [
					['foo', 12],
					['bar', 30],
				],
			},
		}

		expect(readMatchOffsets(fileMatches)).toEqual([12, 30])
	})

	it('skips entries that are not [string, number] tuples', () => {
		const fileMatches = {
			result: {
				content: [['no offset'], 'a string', { 1: 5 }, ['valid', 7], ['wrong type', '8']],
			},
		}

		expect(readMatchOffsets(fileMatches)).toEqual([7])
	})

	it('returns an empty list for shapes the pane never sends', () => {
		expect(readMatchOffsets(null)).toEqual([])
		expect(readMatchOffsets('nope')).toEqual([])
		expect(readMatchOffsets({})).toEqual([])
		expect(readMatchOffsets({ result: null })).toEqual([])
		expect(readMatchOffsets({ result: { content: 'not an array' } })).toEqual([])
	})
})

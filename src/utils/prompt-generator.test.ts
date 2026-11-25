import { addLineNumbers } from './prompt-generator'

describe('addLineNumbers', () => {
	it('prefixes every line with its number starting at 1', () => {
		expect(addLineNumbers('alpha\nbeta')).toBe('1 | alpha\n2 | beta')
	})

	it('honours the start line and pads to the widest number', () => {
		expect(addLineNumbers('alpha\nbeta', 9)).toBe(' 9 | alpha\n10 | beta')
	})

	it('handles an empty content string', () => {
		expect(addLineNumbers('')).toBe('1 | ')
	})
})

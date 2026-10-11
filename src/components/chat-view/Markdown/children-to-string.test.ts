import { createElement } from 'react';

import { childrenToString } from './children-to-string';

describe('childrenToString', () => {
	it('passes strings through', () => {
		expect(childrenToString('code text\n')).toBe('code text\n');
	});

	it('stringifies numbers like String() did', () => {
		expect(childrenToString(7)).toBe('7');
	});

	it('concatenates arrays without the String() comma corruption', () => {
		expect(childrenToString(['single\n'])).toBe('single\n');
		expect(childrenToString(['part one ', 'part two'])).toBe('part one part two');
		expect(childrenToString(['a', ['b', 'c']])).toBe('abc');
	});

	it('degrades non-text nodes to empty string instead of garbage', () => {
		expect(childrenToString(null)).toBe('');
		expect(childrenToString(undefined)).toBe('');
		expect(childrenToString(true)).toBe('');
		expect(childrenToString(createElement('span'))).toBe('');
	});
});

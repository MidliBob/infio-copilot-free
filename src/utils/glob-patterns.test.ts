import {
	cleanPattern,
	compilePatterns,
	expandPattern,
	expandPatterns,
	matchesAny,
} from './glob-patterns'

// A nested vault mirroring the 1.7.13 field-feedback case
const VAULT = [
	'_infio_prompts/write/a.md',
	'_infio_prompts/rules/b.md',
	'Notes/ANALYSIS/c.md',
	'Notes/ANALYSISIX/f.md',
	'Notes/b.md',
	'workspace/d.md',
	'ruleset/e.md',
	'root.md',
]

const matched = (patterns: string[]): string[] => {
	const compiled = compilePatterns(patterns)
	return VAULT.filter((path) => matchesAny(compiled, path))
}

describe('cleanPattern', () => {
	it('trims whitespace', () => {
		expect(cleanPattern('  notes/*  ')).toBe('notes/*')
	})

	it('strips surrounding double quotes', () => {
		expect(cleanPattern('"rules"')).toBe('rules')
		expect(cleanPattern('" _infio_prompts/" ')).toBe('_infio_prompts')
	})

	it('strips surrounding single quotes', () => {
		expect(cleanPattern("'notes/*.md'")).toBe('notes/*.md')
	})

	it('strips trailing slashes', () => {
		expect(cleanPattern('notes//')).toBe('notes')
		expect(cleanPattern('"_infio_prompts/"')).toBe('_infio_prompts')
	})

	it('keeps interior quotes and a lone slash-free char', () => {
		expect(cleanPattern('a"b')).toBe('a"b')
		expect(cleanPattern('"')).toBe('"')
	})

	it('empty input stays empty', () => {
		expect(cleanPattern('   ')).toBe('')
		expect(cleanPattern('""')).toBe('')
	})
})

describe('expandPattern', () => {
	it('empty pattern expands to nothing', () => {
		expect(expandPattern('  ')).toEqual([])
		expect(expandPatterns(['', '""'])).toEqual([])
	})

	it('bare name expands to the four depth-agnostic variants', () => {
		expect(expandPattern('rules')).toEqual([
			'rules',
			'rules/**',
			'**/rules',
			'**/rules/**',
		])
	})

	it('does not double-prefix patterns already starting with **/', () => {
		const variants = expandPattern('**/private/**')
		expect(variants).toEqual(['**/private/**', '**/private/**/**'])
	})
})

describe('matching behavior (field-feedback regression)', () => {
	it('quoted inputs from the setting description match nested files', () => {
		expect(matched(['" _infio_prompts/"'])).toEqual([
			'_infio_prompts/write/a.md',
			'_infio_prompts/rules/b.md',
		])
		expect(matched(['"rules"'])).toEqual(['_infio_prompts/rules/b.md'])
		expect(matched(['"ANALYSIS"'])).toEqual(['Notes/ANALYSIS/c.md'])
	})

	it('bare folder names match at any depth', () => {
		expect(matched(['ANALYSIS'])).toEqual(['Notes/ANALYSIS/c.md'])
		expect(matched(['_infio_prompts'])).toEqual([
			'_infio_prompts/write/a.md',
			'_infio_prompts/rules/b.md',
		])
	})

	it('trailing-slash paths match at any depth', () => {
		expect(matched(['Notes/ANALYSIS/'])).toEqual(['Notes/ANALYSIS/c.md'])
	})

	it('a bare name never matches a longer one', () => {
		expect(matched(['rules'])).not.toContain('ruleset/e.md')
		expect(matched(['ANALYSIS'])).not.toContain('Notes/ANALYSISIX/f.md')
	})

	it('one-level globs from the docs now reach nested files', () => {
		expect(matched(['Notes/*'])).toEqual([
			'Notes/ANALYSIS/c.md',
			'Notes/ANALYSISIX/f.md',
			'Notes/b.md',
		])
		expect(matched(['*.md'])).toEqual(VAULT)
	})

	it('strict globs keep working verbatim', () => {
		expect(matched(['**/ANALYSIS/**'])).toEqual(['Notes/ANALYSIS/c.md'])
		expect(matched(['Notes/ANALYSIS/*.md'])).toEqual(['Notes/ANALYSIS/c.md'])
		expect(matched(['workspace/d.md'])).toEqual(['workspace/d.md'])
		expect(matched(['**/nothing/**'])).toEqual([])
	})

	it('star matches everything, include-style', () => {
		expect(matched(['*'])).toEqual(VAULT)
	})

	it('empty pattern list matches nothing', () => {
		expect(matched([])).toEqual([])
	})
})

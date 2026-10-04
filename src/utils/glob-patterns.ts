// Normalization and expansion of RAG index include/exclude patterns.
//
// Raw `minimatch(path, pattern)` is a strict glob: a bare folder name
// (`rules`), a trailing-slash path (`notes/`) or even the documented
// one-level globs (`notes/*`, `private/*`) never match files nested one
// level deeper than the glob spells, and quotes copied from the setting
// description (`"notes/"`) become part of the pattern and never match
// anything at all. Field feedback (1.7.13 vault: `" _infio_prompts/"`,
// `"rules"`, `"ANALYSIS"` -> zero matches on a nested vault) made this a
// real inclusion/exclusion bug, not a papercut.
//
// Every stored pattern is therefore cleaned (trim, strip surrounding
// quotes, strip trailing slashes) and expanded into a small set of
// equivalent strict globs:
//
//   p            -> exact match (strict globs keep working verbatim)
//   p/**         -> anything below p, at any depth
//   **/p         -> p itself, at any depth (a folder named p anywhere)
//   **/p/**      -> anything below a folder named p, at any depth
//
// The expansion only widens matches; strict globs such as
// **/private/** behave exactly as before, and a bare name never
// matches a longer one (`rules` does not match `ruleset/e.md`).
import { Minimatch } from 'minimatch'

/** Trim, strip surrounding quotes and trailing slashes from a pattern. */
export const cleanPattern = (raw: string): string => {
	let pattern = raw.trim()
	if (
		pattern.length > 1 &&
		((pattern.startsWith('"') && pattern.endsWith('"')) ||
			(pattern.startsWith("'") && pattern.endsWith("'")))
	) {
		pattern = pattern.slice(1, -1).trim()
	}
	while (pattern.length > 1 && pattern.endsWith('/')) {
		pattern = pattern.slice(0, -1)
	}
	return pattern
}

/** The equivalent strict-glob variants of a single stored pattern. */
export const expandPattern = (raw: string): string[] => {
	const pattern = cleanPattern(raw)
	if (pattern === '') return []
	const variants = new Set<string>([pattern, `${pattern}/**`])
	if (!pattern.startsWith('**/')) {
		variants.add(`**/${pattern}`)
		variants.add(`**/${pattern}/**`)
	}
	return Array.from(variants)
}

/** The equivalent strict-glob variants of a list of stored patterns. */
export const expandPatterns = (raws: string[]): string[] =>
	raws.flatMap((raw) => expandPattern(raw))

/** Compiled minimatch instances for a list of stored patterns. */
export const compilePatterns = (raws: string[]): Minimatch[] =>
	expandPatterns(raws).map((variant) => new Minimatch(variant))

/** True when the path matches any of the compiled patterns. */
export const matchesAny = (compiled: Minimatch[], path: string): boolean =>
	compiled.some((matcher) => matcher.match(path))

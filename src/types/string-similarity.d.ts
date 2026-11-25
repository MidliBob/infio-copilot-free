/**
 * Typings for `string-similarity` v4, which ships no declarations of its own and
 * has no `@types/string-similarity` in package.json. Only the entry point the
 * diff search strategies call is declared; add members here when another one is
 * used.
 */
declare module 'string-similarity' {
	export function compareTwoStrings(first: string, second: string): number
}

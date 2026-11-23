/**
 * Typings for micromatch v4, which ships no declarations of its own and has
 * no `@types/micromatch` in package.json. Only the entry points this plugin
 * calls are declared; add members here when another one is used.
 */
declare module 'micromatch' {
	export function isMatch(
		input: string,
		pattern: string | string[],
		options?: Record<string, unknown>,
	): boolean
	export function some(
		input: string,
		patterns: string | string[],
		options?: Record<string, unknown>,
	): boolean
}
/**
 * Small logging facade with a user-facing debug switch.
 *
 * Why not bare console.*: the production esbuild config drops every
 * console call (`drop: ['console']`), so user-enabled debug output would
 * vanish from release builds. Going through a `window.console` reference
 * keeps the calls intact, while the debug gate is controlled by the
 * "Debug mode" setting (settings.debugMode -> setDebugEnabled).
 *
 * Mapping used across the codebase:
 *   console.log / console.debug -> logger.debug (only in Debug mode)
 *   console.info                -> logger.info  (always)
 *   console.warn                -> logger.warn  (always)
 *   console.error               -> logger.error (always)
 *
 * Worker bundles (embedworker/pgworker) intentionally keep bare console:
 * they run in a separate context without access to plugin settings.
 */
type ConsoleLike = {
	log: (...args: unknown[]) => void
	info: (...args: unknown[]) => void
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
}

let debugEnabled = false

export function setDebugEnabled(enabled: boolean): void {
	debugEnabled = enabled
}

export function isDebugEnabled(): boolean {
	return debugEnabled
}

function out(): ConsoleLike {
	// property reference (not a console.* call), so esbuild's
	// drop:['console'] does not strip production debug logging
	const scope: { console: ConsoleLike } =
		typeof window !== 'undefined' ? window : globalThis
	return scope.console
}

const PREFIX = '[icf]'

// Arrow properties (not method shorthand) on purpose: nothing here uses
// `this`, and it keeps `logger.error` safe to destructure or to reference as a
// value - which is exactly what tests do with `jest.mocked(logger)` when they
// assert on the diagnostics of a failure path (@typescript-eslint/unbound-method
// only complains about method signatures).
export const logger = {
	debug: (...args: unknown[]): void => {
		if (debugEnabled) {
			out().log(PREFIX, ...args)
		}
	},
	info: (...args: unknown[]): void => {
		out().log(PREFIX, ...args)
	},
	warn: (...args: unknown[]): void => {
		out().warn(PREFIX, ...args)
	},
	error: (...args: unknown[]): void => {
		out().error(PREFIX, ...args)
	},
}

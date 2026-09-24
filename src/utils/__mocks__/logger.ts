/**
 * Manual Jest mock of the logging facade (`src/utils/logger.ts`).
 *
 * Suites that exercise failure paths on purpose (bad HTTP status, unreachable
 * YaCy peer, corrupt stored settings, ...) opt in with
 * `jest.mock('<relative path>/logger')`. The expected diagnostics are then
 * recorded as mock calls that can be asserted on, instead of being dumped into
 * the Jest console output where they look like real problems.
 *
 * The mock mirrors the public surface of the real module, so `jest.mocked()`
 * keeps the argument types.
 */
export const logger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
}

export const setDebugEnabled = jest.fn()

export const isDebugEnabled = jest.fn((): boolean => false)

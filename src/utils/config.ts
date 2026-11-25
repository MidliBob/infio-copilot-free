/**
 * Deeply injects environment variables into a configuration object/string/json
 *
 * Uses VSCode env:name pattern: https://code.visualstudio.com/docs/reference/variables-reference#_environment-variables
 *
 * Does not mutate original object
 */
import { logger } from './logger'

/**
 * Env-var substitution for a config that is already JSON text.
 */
export function injectEnv(config: string, notFoundValue?: string): Promise<string>
/**
 * Env-var substitution for a config object: the object is serialized, the
 * `${env:NAME}` references are replaced and the result is parsed back, so the
 * caller keeps its own (already validated) config type.
 */
export function injectEnv<C extends Record<PropertyKey, unknown>>(
	config: C,
	notFoundValue?: string,
): Promise<C>
export async function injectEnv(
	config: string | Record<PropertyKey, unknown>,
	notFoundValue = "",
): Promise<string | Record<PropertyKey, unknown>> {
	// Use simple regex replace for now, will see if object traversal and recursion is needed here (e.g: for non-serializable objects)
	const isObject = typeof config === "object"
	let _config: string = isObject ? JSON.stringify(config) : config

	_config = _config.replace(/\$\{env:([\w]+)\}/g, (_, name: string) => {
		// Check if null or undefined
		// intentionally using == to match null | undefined
		if (process.env[name] == null) {
			logger.warn(`[injectEnv] env variable ${name} referenced but not found in process.env`)
		}

		return process.env[name] ?? notFoundValue
	})

	if (!isObject) {
		return _config
	}

	const parsed: unknown = JSON.parse(_config)
	return isRecordValue(parsed) ? parsed : {}
}

/** JSON.parse of a serialized object yields an object; anything else is junk. */
function isRecordValue(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === "object" && value !== null
}

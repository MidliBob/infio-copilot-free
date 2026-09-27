/**
 * Shared classification of low-level network failures (ROADMAP phase 0.3 /
 * phase 2 item 5: actionable errors instead of opaque transport wording).
 *
 * Both the OpenAI SDK and the NoStainlessOpenAI subclass surface a dead
 * connection as APIConnectionError with the default message
 * "Connection error." (openai/error.js), while raw fetch failures say
 * "Failed to fetch" / "fetch failed" and Node-side transports say
 * ECONNREFUSED etc. Provider wrappers match the failure text against the
 * patterns below and replace it with a message that names the server,
 * its address and the first things to check.
 */

/** Substrings identifying a transport-level failure (lowercased match). */
const NETWORK_FAILURE_PATTERNS = [
	'failed to fetch',
	'fetch failed',
	'network',
	'econnrefused',
	'econnreset',
	'enotfound',
	'connection refused',
	'connection error', // OpenAI SDK APIConnectionError default wording
	'timeout',
	'timed out', // OpenAI SDK APIConnectionTimeoutError: "Request timed out."
	'terminated',
	'cannot reach', // our own wording: describeOllamaNetworkError / describeEndpointNetworkError
]

export function isNetworkFailureMessage(message: string): boolean {
	const lower = message.toLowerCase()
	return NETWORK_FAILURE_PATTERNS.some((pattern) => lower.includes(pattern))
}

/**
 * HTTP status carried by SDK errors (APIError.status). Transport-level
 * failures have no status - that is exactly what separates "the server
 * answered something" from "the server never answered".
 */
export function extractNetworkErrorStatus(error: unknown): number | undefined {
	if (error !== null && typeof error === 'object' && 'status' in error) {
		const rawStatus: unknown = error.status
		if (typeof rawStatus === 'number') {
			return rawStatus
		}
	}
	return undefined
}

/**
 * Actionable message for "custom server is down / unreachable" failures of
 * any OpenAI-compatible endpoint the user configures themselves (vLLM,
 * LM Studio, llama.cpp, LocalAI, corporate proxy, ...). Returns null when
 * the error does not look transport-level, so callers rethrow the original
 * (HTTP-level errors such as 401/404/429 keep the server's own wording).
 */
export function describeEndpointNetworkError(
	error: unknown,
	baseUrl: string,
	serverLabel: string,
): string | null {
	const status = extractNetworkErrorStatus(error)
	if (status !== undefined) {
		return null
	}
	const message = error instanceof Error ? error.message : String(error ?? '')
	if (!isNetworkFailureMessage(message)) {
		return null
	}
	return (
		`Cannot reach the ${serverLabel} at ${baseUrl || '(no address set)'}. ` +
		'Make sure the server is running and the base URL in the plugin settings is correct.'
	)
}

/** True when the caught value looks like a transport-level failure. */
export function isNetworkFailure(error: unknown): boolean {
	if (extractNetworkErrorStatus(error) !== undefined) {
		return false
	}
	const message = error instanceof Error ? error.message : String(error ?? '')
	return isNetworkFailureMessage(message)
}

/**
 * Best-effort human-readable message from a caught value:
 * Error.message, plain strings, `{ message }`-shaped objects, String()
 * for primitives, empty string for null/undefined.
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}
	if (typeof error === 'string') {
		return error
	}
	if (typeof error === 'object' && error !== null && 'message' in error) {
		const message: unknown = error.message
		if (typeof message === 'string') {
			return message
		}
	}
	if (error === undefined || error === null) {
		return ''
	}
	return String(error)
}

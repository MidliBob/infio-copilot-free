import { APIUserAbortError } from 'openai'

/**
 * True when the error represents an intentional cancellation rather than a
 * failure: the chat stop button, a new submission replacing the running
 * stream, switching conversations, starting a new chat or unmounting the
 * view all abort the active streams on purpose.
 *
 * The OpenAI SDK wraps a caller-aborted fetch into APIUserAbortError
 * ("Request was aborted.") whose `name` stays the generic "Error", so the
 * usual `error.name === 'AbortError'` check misses it and cancellations
 * surface as error notices. Raw DOM AbortErrors (fetch timeouts in other
 * call sites) keep the 'AbortError' name and are covered too.
 *
 * SDK timeouts (APIConnectionTimeoutError, "Request timed out.") are NOT
 * cancellations: the server really was too slow, and callers keep
 * reporting them as failures.
 */
export function isCancellation(error: unknown): boolean {
	if (error instanceof APIUserAbortError) {
		return true
	}
	if (error instanceof Error) {
		if (error.name === 'AbortError') {
			return true
		}
		// Message fallback for cross-realm copies of the SDK error.
		return error.message === 'Request was aborted.'
	}
	return false
}

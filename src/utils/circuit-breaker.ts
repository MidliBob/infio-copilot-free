import { extractErrorMessage, isNetworkFailure } from './network-errors'

/**
 * Minimal circuit breaker for embedding traffic (1.6.2).
 *
 * Indexing a vault calls the embedding provider once per chunk, wrapped in
 * per-task retries and SDK-level retries. When the server is down, every
 * chunk independently burns its full retry budget: hundreds of pointless
 * connection-refused requests, a flooded console - and because per-task
 * errors were swallowed, the operation even "completed" with zero vectors.
 *
 * The breaker counts CONSECUTIVE transport-level failures (classified by
 * network-errors.ts). Once tripped:
 *   - check() throws CircuitOpenError immediately (no HTTP, no retries -
 *     the backOff `retry` predicate stops on CircuitOpenError);
 *   - callers rethrow it so the whole indexing operation aborts with the
 *     actionable provider message ("Cannot reach Ollama at ..."), which the
 *     error-notice layer surfaces with a Retry button;
 *   - after resetAfterMs the breaker goes half-open: the next call is let
 *     through as a probe; success closes it, failure re-trips it.
 *
 * A server response of any kind (even HTTP 500) proves reachability and
 * resets the breaker - it only guards connectivity, not correctness.
 */

export class CircuitOpenError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'CircuitOpenError'
	}
}

export type CircuitBreakerOptions = {
	/** Consecutive network failures before the breaker trips. Default 3. */
	tripAfter?: number
	/** Cooldown before a half-open probe is allowed. Default 30 s. */
	resetAfterMs?: number
	/** Injectable clock for tests. Default Date.now. */
	now?: () => number
}

export class CircuitBreaker {
	private readonly tripAfter: number
	private readonly resetAfterMs: number
	private readonly now: () => number

	private consecutiveFailures = 0
	private trippedAt: number | null = null
	private lastMessage = ''

	constructor(options: CircuitBreakerOptions = {}) {
		this.tripAfter = options.tripAfter ?? 3
		this.resetAfterMs = options.resetAfterMs ?? 30_000
		this.now = options.now ?? Date.now
	}

	/** True while tripped and the cooldown has not elapsed. */
	isOpen(): boolean {
		return this.trippedAt !== null && this.now() - this.trippedAt < this.resetAfterMs
	}

	/**
	 * Guard for a single attempt: throws CircuitOpenError while open.
	 * Once the cooldown elapses the attempt is allowed through as a
	 * half-open probe (the breaker stays tripped until it succeeds or the
	 * probe fails, which re-arms the cooldown).
	 */
	check(): void {
		if (this.trippedAt === null) {
			return
		}
		if (this.now() - this.trippedAt >= this.resetAfterMs) {
			return // half-open: let one probe through
		}
		throw new CircuitOpenError(this.describe())
	}

	recordSuccess(): void {
		this.consecutiveFailures = 0
		this.trippedAt = null
		this.lastMessage = ''
	}

	/**
	 * Classifies the failure: transport-level failures count toward the
	 * trip threshold; anything else (the server answered - HTTP error,
	 * bad model name, rate limit) proves reachability and resets the
	 * counter and the tripped state.
	 */
	recordFailure(error: unknown): void {
		if (!isNetworkFailure(error)) {
			this.recordSuccess()
			return
		}
		this.consecutiveFailures++
		this.lastMessage = extractErrorMessage(error)
		if (this.trippedAt !== null) {
			// half-open probe failed - re-arm the cooldown
			this.trippedAt = this.now()
			return
		}
		if (this.consecutiveFailures >= this.tripAfter) {
			this.trippedAt = this.now()
		}
	}

	describe(): string {
		return (
			`Stopped after ${this.consecutiveFailures} consecutive connection failures. ` +
			`${this.lastMessage} ` +
			'(No further embedding requests were attempted while the server is unreachable.)'
		)
	}
}

/**
 * Runs one embedding call through the breaker: guards the attempt,
 * records the outcome, and converts a freshly tripped breaker into a
 * CircuitOpenError so the surrounding backOff stops retrying (its
 * `retry` predicate rejects CircuitOpenError).
 */
export async function callWithBreaker<T>(
	breaker: CircuitBreaker,
	call: () => Promise<T>,
): Promise<T> {
	breaker.check()
	try {
		const result = await call()
		breaker.recordSuccess()
		return result
	} catch (error) {
		breaker.recordFailure(error)
		if (breaker.isOpen()) {
			throw new CircuitOpenError(breaker.describe())
		}
		throw error
	}
}

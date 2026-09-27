import {
	CircuitBreaker,
	CircuitOpenError,
	callWithBreaker,
} from './circuit-breaker'

// The exact wordings observed in the field: the OpenAI SDK wrap and the
// actionable message produced by describeOllamaNetworkError.
const sdkNetworkError = (): Error => new Error('Connection error.')
const wrappedOllamaError = (): Error =>
	new Error(
		'Cannot reach Ollama at http://localhost:11434. 1) make sure Ollama is running (try "ollama serve"); 2) set OLLAMA_ORIGINS=app://obsidian.md',
	)
const httpError = () => ({ status: 500, message: 'Internal Server Error' })
const appError = (): Error => new Error('model "foo" not found')

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
	let current = start
	return {
		now: () => current,
		advance: (ms: number) => {
			current += ms
		},
	}
}

describe('CircuitBreaker', () => {
	it('stays closed below the trip threshold', () => {
		const breaker = new CircuitBreaker()
		breaker.recordFailure(sdkNetworkError())
		breaker.recordFailure(sdkNetworkError())
		expect(breaker.isOpen()).toBe(false)
		expect(() => breaker.check()).not.toThrow()
	})

	it('trips after the configured number of consecutive network failures', () => {
		const breaker = new CircuitBreaker({ tripAfter: 3 })
		breaker.recordFailure(sdkNetworkError())
		breaker.recordFailure(wrappedOllamaError())
		expect(breaker.isOpen()).toBe(false)
		breaker.recordFailure(sdkNetworkError())
		expect(breaker.isOpen()).toBe(true)
		expect(() => breaker.check()).toThrow(CircuitOpenError)
	})

	it('carries the last actionable message and the failure count when open', () => {
		const breaker = new CircuitBreaker({ tripAfter: 2 })
		breaker.recordFailure(sdkNetworkError())
		breaker.recordFailure(wrappedOllamaError())
		try {
			breaker.check()
			throw new Error('check() should have thrown')
		} catch (error) {
			expect(error).toBeInstanceOf(CircuitOpenError)
			expect(error).toBeInstanceOf(Error)
			const message = error instanceof Error ? error.message : ''
			expect(message).toContain('Cannot reach Ollama at http://localhost:11434')
			expect(message).toContain('2 consecutive connection failures')
		}
	})

	it('resets the consecutive counter on success', () => {
		const breaker = new CircuitBreaker({ tripAfter: 3 })
		breaker.recordFailure(sdkNetworkError())
		breaker.recordFailure(sdkNetworkError())
		breaker.recordSuccess()
		breaker.recordFailure(sdkNetworkError())
		breaker.recordFailure(sdkNetworkError())
		expect(breaker.isOpen()).toBe(false)
	})

	it('treats any server response as reachable and never trips on those', () => {
		const breaker = new CircuitBreaker({ tripAfter: 2 })
		for (let i = 0; i < 10; i++) {
			breaker.recordFailure(httpError())
			breaker.recordFailure(appError())
		}
		expect(breaker.isOpen()).toBe(false)
		expect(() => breaker.check()).not.toThrow()
	})

	it('goes half-open after the cooldown: probe passes, failure re-trips, success closes', () => {
		const clock = fakeClock()
		const breaker = new CircuitBreaker({ tripAfter: 1, resetAfterMs: 30_000, now: clock.now })

		breaker.recordFailure(sdkNetworkError())
		expect(breaker.isOpen()).toBe(true)
		expect(() => breaker.check()).toThrow(CircuitOpenError)

		// cooldown not elapsed yet
		clock.advance(29_999)
		expect(() => breaker.check()).toThrow(CircuitOpenError)

		// half-open: the probe is let through
		clock.advance(1)
		expect(() => breaker.check()).not.toThrow()

		// probe failed -> re-tripped with a fresh cooldown
		breaker.recordFailure(sdkNetworkError())
		expect(breaker.isOpen()).toBe(true)
		expect(() => breaker.check()).toThrow(CircuitOpenError)

		// after the next cooldown a successful probe closes the breaker
		clock.advance(30_000)
		breaker.recordSuccess()
		expect(breaker.isOpen()).toBe(false)
		expect(() => breaker.check()).not.toThrow()
	})
})

describe('callWithBreaker', () => {
	it('returns the call result and keeps the breaker closed on success', async () => {
		const breaker = new CircuitBreaker()
		await expect(callWithBreaker(breaker, async () => [1, 2, 3])).resolves.toEqual([1, 2, 3])
		expect(breaker.isOpen()).toBe(false)
	})

	it('rethrows the original error while below the threshold', async () => {
		const breaker = new CircuitBreaker({ tripAfter: 3 })
		await expect(callWithBreaker(breaker, async (): Promise<number[]> => {
			throw sdkNetworkError()
		})).rejects.toThrow('Connection error.')
		expect(breaker.isOpen()).toBe(false)
	})

	it('converts the tripping failure into CircuitOpenError and short-circuits subsequent calls', async () => {
		const breaker = new CircuitBreaker({ tripAfter: 2 })
		const failing = async (): Promise<number[]> => {
			throw wrappedOllamaError()
		}

		await expect(callWithBreaker(breaker, failing)).rejects.toThrow('Cannot reach Ollama')
		// the second failure trips the breaker -> CircuitOpenError instead of the original
		await expect(callWithBreaker(breaker, failing)).rejects.toThrow(CircuitOpenError)
		// further calls never reach the provider
		let called = false
		await expect(
			callWithBreaker(breaker, async (): Promise<number[]> => {
				called = true
				return []
			}),
		).rejects.toThrow(CircuitOpenError)
		expect(called).toBe(false)
	})
})

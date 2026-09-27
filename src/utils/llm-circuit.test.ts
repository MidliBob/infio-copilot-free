import { CircuitOpenError } from './circuit-breaker'
import { ChatStreamChunk, llmCircuit, resetLlmCircuit, streamChatWithBreaker } from './llm-circuit'

function fetcher(texts: string[]): () => Promise<AsyncIterable<ChatStreamChunk>> {
	return async () =>
		(async function* () {
			for (const text of texts) {
				yield { choices: [{ delta: { content: text } }] }
			}
		})()
}

function failingFetcher(error: unknown): () => Promise<AsyncIterable<ChatStreamChunk>> {
	return async () => {
		throw error
	}
}

const networkError = (): Error => new Error('Connection error.')
const appError = (): Error => new Error('model "foo" not found')

beforeEach(() => {
	resetLlmCircuit()
})

describe('streamChatWithBreaker', () => {
	it('accumulates delta content into an ok result', async () => {
		const result = await streamChatWithBreaker(fetcher(['Hel', 'lo', ' world']))
		expect(result.isOk()).toBe(true)
		if (result.isOk()) {
			expect(result.value).toBe('Hello world')
		}
		expect(llmCircuit.isOpen()).toBe(false)
	})

	it('returns transport failures as err instead of throwing', async () => {
		const result = await streamChatWithBreaker(failingFetcher(networkError()))
		expect(result.isErr()).toBe(true)
		if (result.isErr()) {
			expect(result.error.message).toBe('Connection error.')
		}
	})

	it('opens the circuit after three consecutive connection failures and then skips the network', async () => {
		const fetch = jest.fn(failingFetcher(networkError()))
		for (let i = 0; i < 3; i++) {
			const result = await streamChatWithBreaker(fetch)
			expect(result.isErr()).toBe(true)
		}
		expect(fetch).toHaveBeenCalledTimes(3)
		expect(llmCircuit.isOpen()).toBe(true)

		// the fourth call never touches the network
		const fourth = await streamChatWithBreaker(fetch)
		expect(fetch).toHaveBeenCalledTimes(3)
		expect(fourth.isErr()).toBe(true)
		if (fourth.isErr()) {
			expect(fourth.error).toBeInstanceOf(CircuitOpenError)
			expect(fourth.error.message).toContain('Stopped after 3 consecutive connection failures')
			expect(fourth.error.message).toContain('Connection error.')
		}
	})

	it('does not trip on application-level failures (the server answered)', async () => {
		const fetch = jest.fn(failingFetcher(appError()))
		for (let i = 0; i < 5; i++) {
			await streamChatWithBreaker(fetch)
		}
		expect(llmCircuit.isOpen()).toBe(false)
		expect(fetch).toHaveBeenCalledTimes(5)
	})

	it('closes again after a successful probe', async () => {
		const failing = failingFetcher(networkError())
		for (let i = 0; i < 3; i++) {
			await streamChatWithBreaker(failing)
		}
		expect(llmCircuit.isOpen()).toBe(true)

		// resetLlmCircuit models the cooldown elapsing + a successful probe
		resetLlmCircuit()
		const result = await streamChatWithBreaker(fetcher(['back']))
		expect(result.isOk()).toBe(true)
		expect(llmCircuit.isOpen()).toBe(false)
	})
})

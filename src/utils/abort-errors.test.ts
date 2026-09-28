import { APIUserAbortError } from 'openai'

import { isCancellation } from './abort-errors'

describe('isCancellation', () => {
	it('recognizes the SDK wrapper for caller-aborted requests', () => {
		const error = new APIUserAbortError()
		// the SDK leaves the generic name in place - the historical bug
		expect(error.name).toBe('Error')
		expect(error.message).toBe('Request was aborted.')
		expect(isCancellation(error)).toBe(true)
	})

	it('recognizes raw DOM-style AbortErrors', () => {
		const error = new Error('The operation was aborted.')
		error.name = 'AbortError'
		expect(isCancellation(error)).toBe(true)
	})

	it('falls back to the SDK abort message for cross-realm copies', () => {
		expect(isCancellation(new Error('Request was aborted.'))).toBe(true)
	})

	it('does not treat real failures as cancellations', () => {
		expect(isCancellation(new Error('Request timed out.'))).toBe(false)
		expect(isCancellation(new Error('Connection error.'))).toBe(false)
		expect(isCancellation(new Error('Cannot reach Ollama at http://localhost:11434.'))).toBe(false)
		expect(isCancellation({ status: 500, message: 'Internal Server Error' })).toBe(false)
		expect(isCancellation('Request was aborted.')).toBe(false)
		expect(isCancellation(undefined)).toBe(false)
		expect(isCancellation(null)).toBe(false)
	})
})

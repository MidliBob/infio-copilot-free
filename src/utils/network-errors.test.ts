import {
	describeEndpointNetworkError,
	extractErrorMessage,
	extractNetworkErrorStatus,
	isNetworkFailure,
	isNetworkFailureMessage,
} from './network-errors'

describe('isNetworkFailureMessage', () => {
	it('matches the OpenAI SDK transport wording', () => {
		// APIConnectionError default message (openai/error.js) - the exact
		// wording seen in the field when Ollama / a custom endpoint is down
		expect(isNetworkFailureMessage('Connection error.')).toBe(true)
		// APIConnectionTimeoutError
		expect(isNetworkFailureMessage('Request timed out.')).toBe(true)
	})

	it('matches raw fetch and node transport failures', () => {
		expect(isNetworkFailureMessage('Failed to fetch')).toBe(true)
		expect(isNetworkFailureMessage('fetch failed')).toBe(true)
		expect(isNetworkFailureMessage('Network request failed')).toBe(true)
		expect(isNetworkFailureMessage('connect ECONNREFUSED 127.0.0.1:11434')).toBe(true)
		expect(isNetworkFailureMessage('socket hang up terminated')).toBe(true)
		expect(isNetworkFailureMessage('getaddrinfo ENOTFOUND example.com')).toBe(true)
	})

	it('does not match application-level errors', () => {
		expect(isNetworkFailureMessage('model "foo" not found')).toBe(false)
		expect(isNetworkFailureMessage('rate limit exceeded')).toBe(false)
		expect(isNetworkFailureMessage('invalid api key')).toBe(false)
		expect(isNetworkFailureMessage('')).toBe(false)
	})
})

describe('extractNetworkErrorStatus', () => {
	it('reads a numeric status from SDK-like errors', () => {
		expect(extractNetworkErrorStatus({ status: 429, message: 'slow down' })).toBe(429)
	})

	it('returns undefined for transport errors, plain objects and primitives', () => {
		// APIConnectionError carries status: undefined explicitly
		expect(extractNetworkErrorStatus({ status: undefined, message: 'Connection error.' })).toBeUndefined()
		expect(extractNetworkErrorStatus(new Error('Connection error.'))).toBeUndefined()
		expect(extractNetworkErrorStatus({ message: 'no status here' })).toBeUndefined()
		expect(extractNetworkErrorStatus(null)).toBeUndefined()
		expect(extractNetworkErrorStatus('plain string')).toBeUndefined()
		expect(extractNetworkErrorStatus({ status: '500' })).toBeUndefined()
	})
})

describe('describeEndpointNetworkError', () => {
	const url = 'http://localhost:8000/v1'
	const label = 'OpenAI-compatible endpoint'

	it('describes a dead custom endpoint with address and label', () => {
		const described = describeEndpointNetworkError(new Error('Connection error.'), url, label)
		expect(described).not.toBeNull()
		expect(described).toContain(url)
		expect(described).toContain(label)
		expect(described).toContain('server is running')
	})

	it('describes an unset base URL', () => {
		const described = describeEndpointNetworkError(new Error('Failed to fetch'), '', label)
		expect(described).toContain('(no address set)')
	})

	it('returns null when the server answered with an HTTP status', () => {
		expect(describeEndpointNetworkError({ status: 401, message: 'Connection error.' }, url, label)).toBeNull()
		expect(describeEndpointNetworkError({ status: 429, message: 'rate limit' }, url, label)).toBeNull()
	})

	it('returns null for non-network errors so callers rethrow the original', () => {
		expect(describeEndpointNetworkError(new Error('model "foo" not found'), url, label)).toBeNull()
		expect(describeEndpointNetworkError(undefined, url, label)).toBeNull()
	})
})

describe('isNetworkFailure', () => {
	it('is true for transport-level errors without an HTTP status', () => {
		expect(isNetworkFailure(new Error('Connection error.'))).toBe(true)
		expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
		expect(isNetworkFailure('ECONNREFUSED')).toBe(true)
	})

	it('is true for our own actionable wording, so wrapped errors still trip breakers', () => {
		const wrapped = new Error(
			'Cannot reach Ollama at http://localhost:11434. 1) make sure Ollama is running',
		)
		expect(isNetworkFailure(wrapped)).toBe(true)
	})

	it('is false when the server answered, whatever it answered', () => {
		expect(isNetworkFailure({ status: 500, message: 'Connection error.' })).toBe(false)
		expect(isNetworkFailure({ status: 429, message: 'rate limit' })).toBe(false)
		expect(isNetworkFailure({ status: 403, message: 'forbidden' })).toBe(false)
	})

	it('is false for application-level errors and empty values', () => {
		expect(isNetworkFailure(new Error('model "foo" not found'))).toBe(false)
		expect(isNetworkFailure(undefined)).toBe(false)
		expect(isNetworkFailure(null)).toBe(false)
	})
})

describe('extractErrorMessage', () => {
	it('prefers Error.message and string values', () => {
		expect(extractErrorMessage(new Error('boom'))).toBe('boom')
		expect(extractErrorMessage('plain')).toBe('plain')
	})

	it('reads a string message off message-shaped objects', () => {
		expect(extractErrorMessage({ message: 'shaped' })).toBe('shaped')
		expect(extractErrorMessage({ message: 42 })).toBe('[object Object]')
	})

	it('falls back to String() and empty string', () => {
		expect(extractErrorMessage(7)).toBe('7')
		expect(extractErrorMessage(null)).toBe('')
		expect(extractErrorMessage(undefined)).toBe('')
	})
})

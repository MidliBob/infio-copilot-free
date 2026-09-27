import {
	describeEndpointNetworkError,
	extractNetworkErrorStatus,
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

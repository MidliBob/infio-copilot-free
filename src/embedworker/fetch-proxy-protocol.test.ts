import {
	FetchRequestMessage,
	FetchResponseMessage,
	isFetchRequestMessage,
	isFetchResponseMessage,
	performFetchProxyRequest,
	responseFromFetchProxy,
} from './fetch-proxy-protocol'

function bufferOf(text: string): ArrayBuffer {
	const bytes = new TextEncoder().encode(text)
	const buffer = new ArrayBuffer(bytes.length)
	new Uint8Array(buffer).set(bytes)
	return buffer
}
describe('performFetchProxyRequest', () => {
	it('passes url and timeout to the performer and returns the bytes', async () => {
		const msg: FetchRequestMessage = { type: 'fetch-request', requestId: 7, url: 'https://example/m.json', timeoutMs: 5000 }
		const body = bufferOf('payload')
		const seen: Array<[string, number | undefined]> = []
		const response = await performFetchProxyRequest(msg, async (url, timeoutMs) => {
			seen.push([url, timeoutMs])
			return { status: 200, headers: { 'Content-Length': '7' }, body }
		})
		expect(seen).toEqual([['https://example/m.json', 5000]])
		expect(response.type).toBe('fetch-response')
		expect(response.requestId).toBe(7)
		expect(response.status).toBe(200)
		expect(response.body).toBe(body)
		expect(response.error).toBeUndefined()
	})

	it('converts performer failures into an error response', async () => {
		const msg: FetchRequestMessage = { type: 'fetch-request', requestId: 8, url: 'https://example/x' }
		const response = await performFetchProxyRequest(msg, async () => {
			throw new Error('net::ERR_NAME_NOT_RESOLVED')
		})
		expect(response.requestId).toBe(8)
		expect(response.status).toBe(0)
		expect(response.error).toBe('net::ERR_NAME_NOT_RESOLVED')
		expect(response.body).toBeUndefined()
	})
})

describe('message guards', () => {
	it('recognizes fetch-request messages only', () => {
		expect(isFetchRequestMessage({ type: 'fetch-request', requestId: 1, url: 'u' })).toBe(true)
		expect(isFetchRequestMessage({ type: 'fetch-response', requestId: 1, status: 200 })).toBe(false)
		expect(isFetchRequestMessage({ method: 'load', id: 0 })).toBe(false)
		expect(isFetchRequestMessage(null)).toBe(false)
		expect(isFetchRequestMessage('fetch-request')).toBe(false)
	})

	it('recognizes fetch-response messages only', () => {
		expect(isFetchResponseMessage({ type: 'fetch-response', requestId: 1, status: 200 })).toBe(true)
		expect(isFetchResponseMessage({ type: 'fetch-request', requestId: 1, url: 'u' })).toBe(false)
		expect(isFetchResponseMessage(undefined)).toBe(false)
	})
})

describe('responseFromFetchProxy', () => {
	it('rebuilds a Response with status, headers and body', async () => {
		const body = bufferOf('tokenizer-bytes')
		const msg: FetchResponseMessage = {
			type: 'fetch-response',
			requestId: 3,
			status: 200,
			headers: { 'Content-Length': '15' },
			body,
		}
		const response = responseFromFetchProxy(msg)
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Length')).toBe('15')
		expect(await response.text()).toBe('tokenizer-bytes')
	})

	it('throws the transported error message', () => {
		const msg: FetchResponseMessage = { type: 'fetch-response', requestId: 4, status: 0, error: 'CORS blocked upstream' }
		expect(() => responseFromFetchProxy(msg)).toThrow('CORS blocked upstream')
	})
})

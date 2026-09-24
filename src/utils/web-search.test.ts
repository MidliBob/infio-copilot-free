import type { RequestUrlParam, RequestUrlResponse } from 'obsidian'
import { requestUrl } from 'obsidian'

import { logger } from './logger'
import type { WebSearchEmbedder } from './web-search'
import {
	fetchUrlsContent,
	normalizeYacyBaseUrl,
	tavilySearch,
	webSearch,
	yacySearch,
} from './web-search'

// The failure-path tests below trigger the diagnostics on purpose. The mock
// (src/utils/__mocks__/logger.ts) records them so they can be asserted on
// instead of being dumped into the Jest console output.
jest.mock('./logger')

const requestUrlMock = jest.mocked(requestUrl)
const loggerMock = jest.mocked(logger)

/** Message (first argument) of every recorded logger.error call. */
function errorMessages(): string[] {
	return loggerMock.error.mock.calls.map((call) => String(call[0]))
}

/** requestUrl also accepts a bare string; our code always passes the object form. */
function callParam(index: number): RequestUrlParam {
	const arg = requestUrlMock.mock.calls[index][0]
	return typeof arg === 'string' ? { url: arg } : arg
}

function textResponse(status: number, text: string): RequestUrlResponse {
	return {
		status,
		headers: {},
		arrayBuffer: new ArrayBuffer(0),
		json: {},
		text,
	}
}

// Every embedding is the same vector, so cosine similarity is always 1 and
// all results pass the > 0.5 relevance filter - keeps the tests deterministic
// without stubbing a real embedding model.
const fakeRagEngine: WebSearchEmbedder = {
	getEmbedding: async (): Promise<number[]> => [1, 0],
}

beforeEach(() => {
	jest.clearAllMocks()
})

describe('normalizeYacyBaseUrl', () => {
	it('trims slashes and falls back to the local peer default', () => {
		expect(normalizeYacyBaseUrl('http://192.168.1.10:8090//')).toBe('http://192.168.1.10:8090')
		expect(normalizeYacyBaseUrl('  ')).toBe('http://localhost:8090')
	})
})

describe('tavilySearch', () => {
	it('POSTs the query with a Bearer key and maps results', async () => {
		requestUrlMock.mockResolvedValue(textResponse(200, JSON.stringify({
			query: 'obsidian plugins',
			answer: null,
			results: [
				{ title: 'A', url: 'https://a.example', content: 'snippet A', score: 0.9 },
				{ title: 'B', url: 'https://b.example', content: 'snippet B', score: 0.5 },
			],
		})))

		const results = await tavilySearch('obsidian plugins', 'tvly-key')

		expect(requestUrlMock).toHaveBeenCalledTimes(1)
		const call = callParam(0)
		expect(call.url).toBe('https://api.tavily.com/search')
		expect(call.method).toBe('POST')
		expect(call.headers).toMatchObject({ Authorization: 'Bearer tvly-key' })
		expect(JSON.parse(String(call.body))).toMatchObject({
			query: 'obsidian plugins',
			max_results: 20,
		})
		expect(results).toEqual([
			{ title: 'A', link: 'https://a.example', snippet: 'snippet A', snippet_embedding: [] },
			{ title: 'B', link: 'https://b.example', snippet: 'snippet B', snippet_embedding: [] },
		])
	})

	it('returns [] on HTTP errors, non-JSON bodies and network failures', async () => {
		requestUrlMock.mockResolvedValue(textResponse(401, '{"detail":{"error":"Invalid API Key"}}'))
		expect(await tavilySearch('q', 'bad-key')).toEqual([])

		requestUrlMock.mockResolvedValue(textResponse(200, '<html>not json</html>'))
		expect(await tavilySearch('q', 'k')).toEqual([])

		requestUrlMock.mockRejectedValue(new Error('network down'))
		expect(await tavilySearch('q', 'k')).toEqual([])

		expect(errorMessages()).toEqual([
			'tavily search failed with HTTP 401',
			'tavily search returned a non-JSON response',
			'tavily search request failed',
		])
		expect(loggerMock.error.mock.calls[2][1]).toBeInstanceOf(Error)
	})
})

describe('yacySearch', () => {
	it('queries the peer JSON API and normalizes items', async () => {
		requestUrlMock.mockResolvedValue(textResponse(200, JSON.stringify({
			channels: [{
				totalResults: '2',
				items: [
					{ title: 'A', link: [{ href: 'https://a.example' }], description: 'snippet A' },
					{ title: 'B', link: { href: 'https://b.example' } },
				],
			}],
		})))

		const results = await yacySearch('test query', 'http://localhost:8090/')

		const call = callParam(0)
		expect(call.url).toBe('http://localhost:8090/yacysearch.json?query=test%20query&maximumRecords=20')
		expect(results).toEqual([
			{ title: 'A', link: 'https://a.example', snippet: 'snippet A', snippet_embedding: [] },
			{ title: 'B', link: 'https://b.example', snippet: '', snippet_embedding: [] },
		])
	})

	it('returns [] when the peer is unreachable or has zero results', async () => {
		requestUrlMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8090'))
		expect(await yacySearch('q', 'http://localhost:8090')).toEqual([])

		requestUrlMock.mockResolvedValue(textResponse(200, JSON.stringify({ channels: [{ totalResults: '0' }] })))
		expect(await yacySearch('q', 'http://localhost:8090')).toEqual([])

		// an empty result set is not an error, only the refused connection is
		expect(errorMessages()).toEqual([
			'yacy search request failed (is the peer running at http://localhost:8090?)',
		])
	})
})

describe('webSearch', () => {
	it('does not hit the network when Tavily is selected but has no API key', async () => {
		const out = await webSearch(
			'q',
			{ provider: 'tavily', tavilyApiKey: '', yacyBaseUrl: '' },
			fakeRagEngine,
		)

		expect(requestUrlMock).not.toHaveBeenCalled()
		expect(out).toContain('not configured')
		expect(loggerMock.warn).toHaveBeenCalledWith(
			'web search skipped: no Tavily API key configured',
		)
		expect(loggerMock.error).not.toHaveBeenCalled()
	})

	it('searches via the YaCy peer, re-ranks by embedding and inlines page content', async () => {
		requestUrlMock
			.mockResolvedValueOnce(textResponse(200, JSON.stringify({
				channels: [{
					items: [{ title: 'A', link: [{ href: 'https://a.example' }], description: 'snippet A' }],
				}],
			})))
			.mockResolvedValueOnce(textResponse(200, '<html><body>page A</body></html>'))

		const out = await webSearch(
			'q',
			{ provider: 'yacy', tavilyApiKey: '', yacyBaseUrl: 'http://127.0.0.1:8090' },
			fakeRagEngine,
		)

		expect(requestUrlMock).toHaveBeenCalledTimes(2)
		expect(callParam(0).url).toContain('http://127.0.0.1:8090/yacysearch.json')
		expect(out).toContain('<url_content url="https://a.example">')
		expect(out).toContain('page A')
	})

	it('reports when the provider returned nothing relevant', async () => {
		requestUrlMock.mockResolvedValue(textResponse(200, JSON.stringify({ results: [] })))

		const out = await webSearch(
			'q',
			{ provider: 'tavily', tavilyApiKey: 'tvly-key', yacyBaseUrl: '' },
			fakeRagEngine,
		)

		expect(out).toContain('no relevant web search results')
	})
})

describe('fetchUrlsContent', () => {
	it('wraps every fetched page in a url_content block', async () => {
		requestUrlMock.mockResolvedValue(textResponse(200, '<html>hello</html>'))

		const out = await fetchUrlsContent(['https://a.example', 'https://b.example'])

		expect(out).toContain('<url_content url="https://a.example">')
		expect(out).toContain('<url_content url="https://b.example">')
		expect(out).toContain('hello')
	})
})

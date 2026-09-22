import type { RequestUrlResponse } from 'obsidian'
import { requestUrl } from 'obsidian'

import { DEFAULT_SETTINGS } from '../settings/versions/v1/v1'
import { ApiProvider } from '../types/llm/model'
import { parseInfioSettings } from '../types/settings'
import { GetEmbeddingProviderModelIdsAsync } from './api'
import {
	checkOllamaHealth,
	describeOllamaNetworkError,
	getOllamaEmbeddingModels,
	getOllamaModels,
	normalizeOllamaBaseUrl,
} from './ollama'

const requestUrlMock = jest.mocked(requestUrl)

function nativeResponse(status: number, json: unknown): RequestUrlResponse {
	return {
		status,
		headers: {},
		arrayBuffer: new ArrayBuffer(0),
		json,
		text: '',
	}
}

let fetchMock: jest.Mock

beforeEach(() => {
	jest.clearAllMocks()
	fetchMock = jest.fn()
	global.fetch = fetchMock
})

describe('normalizeOllamaBaseUrl', () => {
	it('trims whitespace and trailing slashes', () => {
		expect(normalizeOllamaBaseUrl('  http://localhost:11434// ')).toBe('http://localhost:11434')
		expect(normalizeOllamaBaseUrl('')).toBe('')
	})
})

describe('checkOllamaHealth', () => {
	it('reports empty-url when no address is configured', async () => {
		await expect(checkOllamaHealth('   ')).resolves.toEqual({ status: 'empty-url' })
		expect(requestUrlMock).not.toHaveBeenCalled()
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('reports unreachable when the native request fails (server down)', async () => {
		requestUrlMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'))
		await expect(checkOllamaHealth('http://localhost:11434')).resolves.toEqual({
			status: 'unreachable',
			detail: 'connect ECONNREFUSED 127.0.0.1:11434',
		})
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('reports unreachable on a non-2xx native response', async () => {
		requestUrlMock.mockResolvedValue(nativeResponse(500, {}))
		await expect(checkOllamaHealth('http://localhost:11434')).resolves.toEqual({
			status: 'unreachable',
			detail: 'HTTP 500',
		})
	})

	it('reports origins-blocked when native passes but the renderer fetch fails', async () => {
		requestUrlMock.mockResolvedValue(nativeResponse(200, { version: '0.9.1' }))
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
		await expect(checkOllamaHealth('http://localhost:11434/')).resolves.toEqual({
			status: 'origins-blocked',
			version: '0.9.1',
			detail: 'Failed to fetch',
		})
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/version', {
			method: 'GET',
			cache: 'no-store',
			signal: expect.anything(),
		})
	})

	it('reports origins-blocked when the fetch probe gets a readable non-ok status', async () => {
		requestUrlMock.mockResolvedValue(nativeResponse(200, { version: '0.9.1' }))
		fetchMock.mockResolvedValue({ ok: false, status: 403 })
		await expect(checkOllamaHealth('http://localhost:11434')).resolves.toEqual({
			status: 'origins-blocked',
			version: '0.9.1',
			detail: 'HTTP 403',
		})
	})

	it('reports ok with the server version when both stages pass', async () => {
		requestUrlMock.mockResolvedValue(nativeResponse(200, { version: '0.9.1' }))
		fetchMock.mockResolvedValue({ ok: true, status: 200 })
		await expect(checkOllamaHealth('http://localhost:11434')).resolves.toEqual({
			status: 'ok',
			version: '0.9.1',
		})
	})

	it('survives a malformed native json body', async () => {
		requestUrlMock.mockResolvedValue(nativeResponse(200, null))
		fetchMock.mockResolvedValue({ ok: true, status: 200 })
		await expect(checkOllamaHealth('http://localhost:11434')).resolves.toEqual({
			status: 'ok',
			version: undefined,
		})
	})
})

describe('describeOllamaNetworkError', () => {
	const url = 'http://localhost:11434'

	it('explains opaque network failures with the OLLAMA_ORIGINS hint', () => {
		const described = describeOllamaNetworkError(new TypeError('Failed to fetch'), url)
		expect(described).not.toBeNull()
		expect(described).toContain('OLLAMA_ORIGINS=app://obsidian.md')
		expect(described).toContain(url)
		expect(described).toContain('ollama serve')
	})

	it('explains a readable 403 with the OLLAMA_ORIGINS hint', () => {
		const described = describeOllamaNetworkError({ status: 403, message: 'forbidden' }, url)
		expect(described).toContain('OLLAMA_ORIGINS')
	})

	it('explains 404 as a base URL / API compatibility problem', () => {
		const described = describeOllamaNetworkError({ status: 404, message: '' }, url)
		expect(described).toContain('/v1')
		expect(described).not.toContain('OLLAMA_ORIGINS')
	})

	it('returns null for unrelated errors so callers rethrow the original', () => {
		expect(describeOllamaNetworkError(new Error('model "foo" not found'), url)).toBeNull()
		expect(describeOllamaNetworkError({ status: 429, message: 'rate limit' }, url)).toBeNull()
	})

	it('handles a missing base URL gracefully', () => {
		const described = describeOllamaNetworkError(new TypeError('Failed to fetch'), '')
		expect(described).toContain('(no address set)')
	})
})

function settingsWithOllamaUrl(baseUrl: string) {
	return parseInfioSettings({
		ollamaProvider: { name: 'Ollama', apiKey: 'ollama', baseUrl, useCustomUrl: false, models: [] },
		autocompleteEnabled: true,
		advancedMode: false,
		apiProvider: 'openai',
		triggers: DEFAULT_SETTINGS.triggers,
		delay: 500,
		modelOptions: {
			temperature: 1,
			top_p: 0.1,
			frequency_penalty: 0.25,
			presence_penalty: 0,
			max_tokens: 4096,
		},
		systemMessage: DEFAULT_SETTINGS.systemMessage,
		fewShotExamples: DEFAULT_SETTINGS.fewShotExamples,
		userMessageTemplate: '{{prefix}}<mask/>{{suffix}}',
		chainOfThoughRemovalRegex: '(.|\\n)*ANSWER:',
		dontIncludeDataviews: true,
		maxPrefixCharLimit: 4000,
		maxSuffixCharLimit: 4000,
		removeDuplicateMathBlockIndicator: true,
		removeDuplicateCodeBlockIndicator: true,
		ignoredFilePatterns: '',
		ignoredTags: '',
		cacheSuggestions: true,
		debugMode: false,
	})
}

describe('getOllamaModels / getOllamaEmbeddingModels', () => {
	it('lists all model names from /api/tags', async () => {
		requestUrlMock.mockResolvedValue(
			nativeResponse(200, { models: [{ name: 'qwen2.5:3b' }, { name: 'nomic-embed-text' }] })
		)
		await expect(getOllamaModels('http://localhost:11434')).resolves.toEqual([
			'qwen2.5:3b',
			'nomic-embed-text',
		])
	})

	it('keeps only embedding-capable models when capabilities are reported', async () => {
		requestUrlMock.mockResolvedValue(
			nativeResponse(200, {
				models: [
					{ name: 'qwen2.5:3b', capabilities: ['completion', 'tools'] },
					{ name: 'nomic-embed-text', capabilities: ['embedding'] },
					{ name: 'bge-m3', capabilities: ['embedding'] },
				],
			})
		)
		await expect(getOllamaEmbeddingModels('http://localhost:11434')).resolves.toEqual([
			'nomic-embed-text',
			'bge-m3',
		])
	})

	it('falls back to all models when the server does not report capabilities', async () => {
		requestUrlMock.mockResolvedValue(
			nativeResponse(200, { models: [{ name: 'a' }, { name: 'b' }] })
		)
		await expect(getOllamaEmbeddingModels('http://localhost:11434')).resolves.toEqual(['a', 'b'])
	})

	it('returns [] on unreachable servers and malformed payloads', async () => {
		requestUrlMock.mockRejectedValue(new Error('ECONNREFUSED'))
		await expect(getOllamaEmbeddingModels('http://localhost:11434')).resolves.toEqual([])
		requestUrlMock.mockResolvedValue(nativeResponse(200, null))
		await expect(getOllamaModels('http://localhost:11434')).resolves.toEqual([])
		requestUrlMock.mockResolvedValue(nativeResponse(200, { unexpected: true }))
		await expect(getOllamaModels('http://localhost:11434')).resolves.toEqual([])
	})
})

describe('GetEmbeddingProviderModelIdsAsync', () => {
	it('returns static catalogs for non-Ollama providers without network calls', async () => {
		const ids = await GetEmbeddingProviderModelIdsAsync(ApiProvider.LocalProvider)
		expect(ids).toContain('TaylorAI/bge-micro-v2')
		expect(requestUrlMock).not.toHaveBeenCalled()
	})

	it('returns [] for Ollama when no base URL is configured', async () => {
		await expect(GetEmbeddingProviderModelIdsAsync(ApiProvider.Ollama)).resolves.toEqual([])
		expect(requestUrlMock).not.toHaveBeenCalled()
	})

	it('fetches embedding-capable models for a configured Ollama server', async () => {
		requestUrlMock.mockResolvedValue(
			nativeResponse(200, {
				models: [
					{ name: 'qwen2.5:3b', capabilities: ['completion'] },
					{ name: 'nomic-embed-text', capabilities: ['embedding'] },
				],
			})
		)
		const ids = await GetEmbeddingProviderModelIdsAsync(
			ApiProvider.Ollama,
			settingsWithOllamaUrl('http://localhost:11434/')
		)
		expect(ids).toEqual(['nomic-embed-text'])
		expect(requestUrlMock).toHaveBeenCalledWith('http://localhost:11434/api/tags')
	})
})

import { DEFAULT_MODELS } from '../constants'
import { DEFAULT_SETTINGS } from '../settings/versions/v1/v1'
import { logger } from '../utils/logger'

import { parseInfioSettings } from './settings'

// parseInfioSettings logs the whole ZodError and falls back to the defaults
// when the stored data is unusable. The mock records that call so the expected
// dump stays out of the Jest console output and can be asserted on instead.
jest.mock('../utils/logger')

const loggerMock = jest.mocked(logger)

beforeEach(() => {
	jest.clearAllMocks()
})

describe('parseSmartCopilotSettings', () => {
	it('should return default values for empty input', () => {
		const result = parseInfioSettings({
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
			ignoredFilePatterns: '**/secret/**\n',
			ignoredTags: '',
			cacheSuggestions: true,
			debugMode: false,
		})
		expect(result).toEqual({
			version: 0.9,
			workspace: '',
			activeModels: DEFAULT_MODELS,
			activeProviderTab: 'Ollama',
			filesSearchSettings: {
				method: 'auto',
				regexBackend: 'coreplugin',
				matchBackend: 'coreplugin',
				ripgrepPath: '',
			},
			fuzzyMatchThreshold: 0.85,
			deepseekApiKey: '',
			chatModelId: '',
			mcpEnabled: false,
			collectedChatModels: [],
			collectedApplyModels: [],
			collectedEmbeddingModels: [],
			collectedInsightModels: [],
			chatModelProvider: 'Ollama',
			applyModelId: '',
			applyModelProvider: 'Ollama',
			embeddingModelId: '',
			embeddingModelProvider: 'LocalProvider',
			insightModelId: '',
			insightModelProvider: 'Ollama',
			experimentalDiffStrategy: false,
			defaultProvider: 'Ollama',
			alibabaQwenProvider: {
				name: 'AlibabaQwen',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			localproviderProvider: {
				name: 'LocalProvider',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			ollamaChatModel: {
				baseUrl: '',
				model: '',
			},
			ollamaApplyModel: {
				baseUrl: '',
				model: '',
			},
			ollamaEmbeddingModel: {
				baseUrl: '',
				model: '',
			},
			systemPrompt: '',
			ragOptions: {
				filesystem: 'opfs',
				batchSize: 32,
				chunkSize: 500,
				thresholdTokens: 8192,
				minSimilarity: 0.0,
				limit: 10,
				excludePatterns: [],
				includePatterns: [],
			},
			autocompleteEnabled: true,
			advancedMode: false,
			apiProvider: 'openai',
			azureOAIApiSettings: '',
			openAIApiSettings: '',
			multiSearchReplaceDiffStrategy: true,
			ollamaApiSettings: '',
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
			mode: 'ask',
			defaultMention: 'none',
			removeDuplicateMathBlockIndicator: true,
			removeDuplicateCodeBlockIndicator: true,
			webSearchProvider: 'searxng',
			yacyBaseUrl: 'http://localhost:8090',
			searxngBaseUrl: 'http://localhost:8080',
			ignoredFilePatterns: '**/secret/**\n',
			ignoredTags: '',
			cacheSuggestions: true,
			debugMode: false,
			deepseekProvider: {
				name: 'DeepSeek',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			ollamaProvider: {
				apiKey: 'ollama',
				baseUrl: '',
				name: 'Ollama',
				useCustomUrl: true,
				models: [],
			},
			moonshotProvider: {
				name: 'Moonshot',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			siliconflowProvider: {
				name: 'SiliconFlow',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
		})
	})
})

describe('settings migration', () => {
	it('should migrate from v0 to v1', () => {
		const oldSettings = {
			openAIApiKey: 'openai-api-key',
			groqApiKey: 'groq-api-key',
			anthropicApiKey: 'anthropic-api-key',
			ollamaBaseUrl: 'http://localhost:11434',
			chatModel: 'claude-3.5-sonnet-latest',
			applyModel: 'gpt-4o-mini',
			embeddingModel: 'text-embedding-3-small',
			systemPrompt: 'system prompt',
			ragOptions: {
				filesystem: 'opfs',
				batchSize: 32,
				chunkSize: 500,
				thresholdTokens: 8192,
				minSimilarity: 0.0,
				limit: 10,
			},
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
			ignoredFilePatterns: '**/secret/**\n',
			ignoredTags: '',
			cacheSuggestions: true,
			debugMode: false,
		}

		const result = parseInfioSettings(oldSettings)
		expect(result).toEqual({
			version: 0.9,
			workspace: '',
			activeModels: DEFAULT_MODELS,
			activeProviderTab: 'Ollama',
			filesSearchSettings: {
				method: 'auto',
				regexBackend: 'coreplugin',
				matchBackend: 'coreplugin',
				ripgrepPath: '',
			},
			fuzzyMatchThreshold: 0.85,
			deepseekApiKey: '',
			collectedChatModels: [],
			collectedApplyModels: [],
			collectedEmbeddingModels: [],
			collectedInsightModels: [],
			chatModelId: '',
			mcpEnabled: false,
			chatModelProvider: 'Ollama',
			applyModelId: '',
			applyModelProvider: 'Ollama',
			embeddingModelId: '',
			embeddingModelProvider: 'LocalProvider',
			insightModelId: '',
			insightModelProvider: 'Ollama',
			experimentalDiffStrategy: false,
			defaultProvider: 'Ollama',
			alibabaQwenProvider: {
				name: 'AlibabaQwen',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			localproviderProvider: {
				name: 'LocalProvider',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			ollamaChatModel: {
				baseUrl: '',
				model: '',
			},
			ollamaApplyModel: {
				baseUrl: '',
				model: '',
			},
			ollamaEmbeddingModel: {
				baseUrl: '',
				model: '',
			},
			systemPrompt: 'system prompt',
			ragOptions: {
				filesystem: 'opfs',
				batchSize: 32,
				chunkSize: 500,
				thresholdTokens: 8192,
				minSimilarity: 0.0,
				limit: 10,
				excludePatterns: [],
				includePatterns: [],
			},
			autocompleteEnabled: true,
			advancedMode: false,
			apiProvider: 'openai',
			azureOAIApiSettings: '',
			openAIApiSettings: '',
			multiSearchReplaceDiffStrategy: true,
			ollamaApiSettings: '',
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
			mode: 'ask',
			defaultMention: 'none',
			removeDuplicateMathBlockIndicator: true,
			removeDuplicateCodeBlockIndicator: true,
			webSearchProvider: 'searxng',
			yacyBaseUrl: 'http://localhost:8090',
			searxngBaseUrl: 'http://localhost:8080',
			ignoredFilePatterns: '**/secret/**\n',
			ignoredTags: '',
			cacheSuggestions: true,
			debugMode: false,
			deepseekProvider: {
				name: 'DeepSeek',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			ollamaProvider: {
				apiKey: 'ollama',
				baseUrl: '',
				name: 'Ollama',
				useCustomUrl: true,
				models: [],
			},
			moonshotProvider: {
				name: 'Moonshot',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			siliconflowProvider: {
				name: 'SiliconFlow',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
		})
	})

	it('should migrate max_tokens from old value to new minimum', () => {
		// Test case: user has old max_tokens value (800) that needs to be migrated
		const settingsWithOldMaxTokens = {
			version: 0.4,
			modelOptions: {
				temperature: 1,
				top_p: 0.1,
				frequency_penalty: 0.25,
				presence_penalty: 0,
				max_tokens: 800, // Old value that's below new minimum
			},
			// Include other required fields for valid settings
			autocompleteEnabled: true,
			advancedMode: false,
			apiProvider: 'openai',
			triggers: DEFAULT_SETTINGS.triggers,
			delay: 500,
			systemMessage: DEFAULT_SETTINGS.systemMessage,
			fewShotExamples: DEFAULT_SETTINGS.fewShotExamples,
			userMessageTemplate: '{{prefix}}<mask/>{{suffix}}',
			chainOfThoughRemovalRegex: '(.|\\n)*ANSWER:',
			dontIncludeDataviews: true,
			maxPrefixCharLimit: 4000,
			maxSuffixCharLimit: 4000,
			removeDuplicateMathBlockIndicator: true,
			removeDuplicateCodeBlockIndicator: true,
			ignoredFilePatterns: '**/secret/**\n',
			ignoredTags: '',
			cacheSuggestions: true,
			debugMode: false,
		}

		const result = parseInfioSettings(settingsWithOldMaxTokens)
		
		// Should successfully parse and migrate max_tokens to 4096
		expect(result.modelOptions.max_tokens).toBe(4096)
		expect(result.version).toBe(0.9)
	})

	it('should not change max_tokens if it is already above minimum', () => {
		// Test case: user has max_tokens already above minimum
		const settingsWithValidMaxTokens = {
			version: 0.4,
			modelOptions: {
				temperature: 1,
				top_p: 0.1,
				frequency_penalty: 0.25,
				presence_penalty: 0,
				max_tokens: 6000, // Already above minimum
			},
			// Include other required fields for valid settings
			autocompleteEnabled: true,
			advancedMode: false,
			apiProvider: 'openai',
			triggers: DEFAULT_SETTINGS.triggers,
			delay: 500,
			systemMessage: DEFAULT_SETTINGS.systemMessage,
			fewShotExamples: DEFAULT_SETTINGS.fewShotExamples,
			userMessageTemplate: '{{prefix}}<mask/>{{suffix}}',
			chainOfThoughRemovalRegex: '(.|\\n)*ANSWER:',
			dontIncludeDataviews: true,
			maxPrefixCharLimit: 4000,
			maxSuffixCharLimit: 4000,
			removeDuplicateMathBlockIndicator: true,
			removeDuplicateCodeBlockIndicator: true,
			ignoredFilePatterns: '**/secret/**\n',
			ignoredTags: '',
			cacheSuggestions: true,
			debugMode: false,
		}

		const result = parseInfioSettings(settingsWithValidMaxTokens)
		
		// Should keep the existing max_tokens value since it's already valid
		expect(result.modelOptions.max_tokens).toBe(6000)
		expect(result.version).toBe(0.9)
	})
})

describe('Infio provider removal migration (0.5 -> 0.9)', () => {
	it('remaps Infio selections to Ollama/LocalProvider and drops stale data', () => {
		const infioEraSettings = {
			version: 0.5,
			defaultProvider: 'Infio',
			activeProviderTab: 'Infio',
			chatModelProvider: 'Infio',
			chatModelId: 'infio/agent-chat',
			insightModelProvider: 'Infio',
			insightModelId: 'deepseek/deepseek-v3',
			applyModelProvider: 'Infio',
			applyModelId: 'groq/llama-3.3-70b-versatile',
			embeddingModelProvider: 'Infio',
			embeddingModelId: 'openai/text-embedding-3-small',
			collectedChatModels: [
				{ provider: 'Infio', modelId: 'infio/agent-chat' },
				{ provider: 'Deepseek', modelId: 'deepseek-chat' },
			],
			collectedEmbeddingModels: [
				{ provider: 'Infio', modelId: 'openai/text-embedding-3-small' },
			],
			infioProvider: { name: 'Infio', apiKey: 'sk-secret', baseUrl: '', useCustomUrl: false, models: [] },
			infioApiKey: 'sk-secret',
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
			ignoredFilePatterns: '**/secret/**\\n',
			ignoredTags: '',
			cacheSuggestions: true,
			debugMode: false,
		}

		const result = parseInfioSettings(infioEraSettings)

		expect(result.version).toBe(0.9)
		expect(result.defaultProvider).toBe('Ollama')
		expect(result.activeProviderTab).toBe('Ollama')
		expect(result.chatModelProvider).toBe('Ollama')
		expect(result.chatModelId).toBe('')
		expect(result.insightModelProvider).toBe('Ollama')
		expect(result.insightModelId).toBe('')
		expect(result.applyModelProvider).toBe('Ollama')
		expect(result.applyModelId).toBe('')
		expect(result.embeddingModelProvider).toBe('LocalProvider')
		expect(result.embeddingModelId).toBe('TaylorAI/bge-micro-v2')
		expect(result.collectedChatModels).toEqual([{ provider: 'Deepseek', modelId: 'deepseek-chat' }])
		expect(result.collectedEmbeddingModels).toEqual([])
		expect('infioProvider' in result).toBe(false)
		expect('infioApiKey' in result).toBe(false)
	})
})

describe('Serper/Jina removal migration (0.6 -> 0.9)', () => {
	// A complete 0.6-era payload. With only the removed keys present the schema
	// parse fails and parseInfioSettings returns the defaults, which also lack
	// serperApiKey/serperSearchEngine/jinaApiKey - the migration itself would
	// then go completely untested.
	const serperEraSettings = {
		version: 0.6,
		defaultProvider: 'Ollama',
		activeProviderTab: 'Ollama',
		chatModelProvider: 'Ollama',
		chatModelId: 'qwen2.5:7b',
		insightModelProvider: 'Ollama',
		insightModelId: '',
		applyModelProvider: 'Ollama',
		applyModelId: '',
		embeddingModelProvider: 'LocalProvider',
		embeddingModelId: 'TaylorAI/bge-micro-v2',
		collectedChatModels: [{ provider: 'Deepseek', modelId: 'deepseek-chat' }],
		collectedEmbeddingModels: [],
		deepseekApiKey: 'dk-survives-migration',
		serperApiKey: 'secret-serper-key',
		serperSearchEngine: 'bing',
		jinaApiKey: 'secret-jina-key',
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
		ignoredFilePatterns: '**/secret/**\\n',
		ignoredTags: '',
		cacheSuggestions: true,
		debugMode: false,
	}

	it('drops the removed web-search credentials and falls back to the SearXNG default', () => {
		const result = parseInfioSettings(serperEraSettings)

		// the migration must have run on a valid parse, not on the fallback
		expect(loggerMock.error).not.toHaveBeenCalled()
		expect(result.deepseekApiKey).toBe('dk-survives-migration')
		expect(result.chatModelId).toBe('qwen2.5:7b')
		expect(result.version).toBe(0.9)
		expect('serperApiKey' in result).toBe(false)
		expect('serperSearchEngine' in result).toBe(false)
		expect('jinaApiKey' in result).toBe(false)
		expect(result.webSearchProvider).toBe('searxng')
		expect('tavilyApiKey' in result).toBe(false)
		expect(result.yacyBaseUrl).toBe('http://localhost:8090')
		expect(result.searxngBaseUrl).toBe('http://localhost:8080')
	})

	it('logs and falls back to the defaults when the stored data is unusable', () => {
		const result = parseInfioSettings({
			version: 0.6,
			serperApiKey: 'secret-serper-key',
		})

		expect(loggerMock.error).toHaveBeenCalledTimes(1)
		expect(String(loggerMock.error.mock.calls[0][0])).toContain(
			'using default settings instead',
		)
		expect(result.version).toBe(0.9)
		expect('serperApiKey' in result).toBe(false)
		expect(result.webSearchProvider).toBe('searxng')
		expect('tavilyApiKey' in result).toBe(false)
		expect(result.yacyBaseUrl).toBe('http://localhost:8090')
		expect(result.searxngBaseUrl).toBe('http://localhost:8080')
	})
})

describe('web search provider settings', () => {
	// The web-search keys all have schema defaults, but a handful of other
	// fields (cacheSuggestions, debugMode, ...) carry no catch and must be
	// present for a successful parse - same minimal payload as the defaults
	// test at the top of the file.
	const parseableBase = {
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
		ignoredFilePatterns: '**/secret/**\n',
		ignoredTags: '',
		cacheSuggestions: true,
		debugMode: false,
	}

	it('keeps a stored SearXNG provider and instance URL', () => {
		const result = parseInfioSettings({
			...parseableBase,
			version: 0.8,
			webSearchProvider: 'searxng',
			searxngBaseUrl: 'http://searx.example:8080',
		})

		expect(loggerMock.error).not.toHaveBeenCalled()
		expect(result.webSearchProvider).toBe('searxng')
		expect(result.searxngBaseUrl).toBe('http://searx.example:8080')
	})

	it('falls back to SearXNG for an unknown provider and defaults the instance URL', () => {
		const result = parseInfioSettings({
			...parseableBase,
			version: 0.8,
			webSearchProvider: 'serper',
		})

		expect(result.webSearchProvider).toBe('searxng')
		expect(result.searxngBaseUrl).toBe('http://localhost:8080')
	})
})

describe('Tavily removal migration (0.7 -> 0.9)', () => {
	// A complete 0.7-era payload as stored by releases 1.4.0-1.5.0, with the
	// Tavily provider selected and an API key on disk.
	const tavilyEraSettings = {
		version: 0.7,
		defaultProvider: 'Ollama',
		activeProviderTab: 'Ollama',
		chatModelProvider: 'Ollama',
		chatModelId: 'qwen2.5:7b',
		insightModelProvider: 'Ollama',
		insightModelId: '',
		applyModelProvider: 'Ollama',
		applyModelId: '',
		embeddingModelProvider: 'LocalProvider',
		embeddingModelId: 'TaylorAI/bge-micro-v2',
		collectedChatModels: [{ provider: 'Deepseek', modelId: 'deepseek-chat' }],
		collectedEmbeddingModels: [],
		deepseekApiKey: 'dk-survives-migration',
		webSearchProvider: 'tavily',
		tavilyApiKey: 'secret-tavily-key',
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
		ignoredFilePatterns: '**/secret/**\\n',
		ignoredTags: '',
		cacheSuggestions: true,
		debugMode: false,
	}

	it('drops the Tavily key and re-selects the SearXNG default provider', () => {
		const result = parseInfioSettings(tavilyEraSettings)

		// the migration must have run on a valid parse, not on the fallback
		expect(loggerMock.error).not.toHaveBeenCalled()
		expect(result.deepseekApiKey).toBe('dk-survives-migration')
		expect(result.chatModelId).toBe('qwen2.5:7b')
		expect(result.version).toBe(0.9)
		expect(result.webSearchProvider).toBe('searxng')
		expect('tavilyApiKey' in result).toBe(false)
		expect(result.searxngBaseUrl).toBe('http://localhost:8080')
	})

	it('keeps an explicit YaCy choice and its peer URL', () => {
		const result = parseInfioSettings({
			...tavilyEraSettings,
			webSearchProvider: 'yacy',
			yacyBaseUrl: 'http://mypeer.example:8090',
		})

		expect(loggerMock.error).not.toHaveBeenCalled()
		expect(result.version).toBe(0.9)
		expect(result.webSearchProvider).toBe('yacy')
		expect(result.yacyBaseUrl).toBe('http://mypeer.example:8090')
		expect('tavilyApiKey' in result).toBe(false)
	})
})

describe('Cloud provider removal migration (0.8 -> 0.9)', () => {
	// A complete 0.8-era payload as stored by releases 1.5.1-1.5.2, with the
	// removed cloud providers selected and their credentials on disk.
	const cloudEraSettings = {
		version: 0.8,
		defaultProvider: 'Google',
		activeProviderTab: 'Grok',
		chatModelProvider: 'OpenAI',
		chatModelId: 'gpt-4o',
		insightModelProvider: 'Anthropic',
		insightModelId: 'claude-sonnet-4-20250514',
		applyModelProvider: 'OpenRouter',
		applyModelId: 'google/gemini-2.5-pro-preview',
		embeddingModelProvider: 'OpenAICompatible',
		embeddingModelId: 'text-embedding-3-small',
		collectedChatModels: [
			{ provider: 'OpenAI', modelId: 'gpt-4o' },
			{ provider: 'Deepseek', modelId: 'deepseek-chat' },
		],
		collectedEmbeddingModels: [
			{ provider: 'Google', modelId: 'text-embedding-004' },
		],
		openaiProvider: { name: 'OpenAI', apiKey: 'sk-secret', baseUrl: '', useCustomUrl: false, models: [] },
		anthropicProvider: { name: 'Anthropic', apiKey: 'sk-ant-secret', baseUrl: '', useCustomUrl: false, models: [] },
		googleProvider: { name: 'Google', apiKey: 'goog-secret', baseUrl: '', useCustomUrl: false, models: [] },
		groqProvider: { name: 'Groq', apiKey: 'gsk-secret', baseUrl: '', useCustomUrl: false, models: [] },
		grokProvider: { name: 'Grok', apiKey: 'xai-secret', baseUrl: '', useCustomUrl: false, models: [] },
		openrouterProvider: { name: 'OpenRouter', apiKey: 'sk-or-secret', baseUrl: '', useCustomUrl: false, models: [] },
		openaicompatibleProvider: { name: 'OpenAICompatible', apiKey: 'compat-secret', baseUrl: 'https://my.endpoint/v1', useCustomUrl: true, models: [] },
		openAIApiKey: 'sk-legacy',
		anthropicApiKey: 'sk-ant-legacy',
		geminiApiKey: 'goog-legacy',
		groqApiKey: 'gsk-legacy',
		openAICompatibleChatModel: { baseUrl: 'https://my.endpoint/v1', apiKey: 'compat-secret', model: 'my-model' },
		openAICompatibleApplyModel: { baseUrl: 'https://my.endpoint/v1', apiKey: 'compat-secret', model: 'my-model' },
		deepseekProvider: { name: 'DeepSeek', apiKey: 'dk-kept', baseUrl: '', useCustomUrl: false, models: [] },
		deepseekApiKey: 'dk-kept',
		ollamaProvider: { name: 'Ollama', apiKey: 'ollama', baseUrl: 'http://localhost:11434', useCustomUrl: true, models: ['qwen2.5:7b'] },
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
		ignoredFilePatterns: '**/secret/**\\n',
		ignoredTags: '',
		cacheSuggestions: true,
		debugMode: false,
	}

	it('remaps removed providers to Ollama/LocalProvider and drops their credentials', () => {
		const result = parseInfioSettings(cloudEraSettings)

		// the migration must have run on a valid parse, not on the fallback
		expect(loggerMock.error).not.toHaveBeenCalled()
		expect(result.version).toBe(0.9)
		expect(result.defaultProvider).toBe('Ollama')
		expect(result.activeProviderTab).toBe('Ollama')
		expect(result.chatModelProvider).toBe('Ollama')
		expect(result.chatModelId).toBe('')
		expect(result.insightModelProvider).toBe('Ollama')
		expect(result.insightModelId).toBe('')
		expect(result.applyModelProvider).toBe('Ollama')
		expect(result.applyModelId).toBe('')
		expect(result.embeddingModelProvider).toBe('LocalProvider')
		expect(result.embeddingModelId).toBe('TaylorAI/bge-micro-v2')
		expect(result.collectedChatModels).toEqual([{ provider: 'Deepseek', modelId: 'deepseek-chat' }])
		expect(result.collectedEmbeddingModels).toEqual([])
		expect('openaiProvider' in result).toBe(false)
		expect('anthropicProvider' in result).toBe(false)
		expect('googleProvider' in result).toBe(false)
		expect('groqProvider' in result).toBe(false)
		expect('grokProvider' in result).toBe(false)
		expect('openrouterProvider' in result).toBe(false)
		expect('openaicompatibleProvider' in result).toBe(false)
		expect('openAIApiKey' in result).toBe(false)
		expect('anthropicApiKey' in result).toBe(false)
		expect('geminiApiKey' in result).toBe(false)
		expect('groqApiKey' in result).toBe(false)
		expect('openAICompatibleChatModel' in result).toBe(false)
		expect('openAICompatibleApplyModel' in result).toBe(false)
		// the remaining providers keep their stored configuration
		expect(result.deepseekProvider.apiKey).toBe('dk-kept')
		expect(result.deepseekApiKey).toBe('dk-kept')
		expect(result.ollamaProvider.baseUrl).toBe('http://localhost:11434')
	})

	it('keeps an Ollama chat setup and LocalProvider embeddings untouched', () => {
		const result = parseInfioSettings({
			...cloudEraSettings,
			defaultProvider: 'Ollama',
			activeProviderTab: 'Ollama',
			chatModelProvider: 'Ollama',
			chatModelId: 'qwen2.5:7b',
			insightModelProvider: 'Ollama',
			insightModelId: 'qwen2.5:7b',
			applyModelProvider: 'Ollama',
			applyModelId: 'qwen2.5:7b',
			embeddingModelProvider: 'LocalProvider',
			embeddingModelId: 'TaylorAI/bge-micro-v2',
		})

		expect(loggerMock.error).not.toHaveBeenCalled()
		expect(result.version).toBe(0.9)
		expect(result.chatModelProvider).toBe('Ollama')
		expect(result.chatModelId).toBe('qwen2.5:7b')
		expect(result.embeddingModelProvider).toBe('LocalProvider')
		expect(result.embeddingModelId).toBe('TaylorAI/bge-micro-v2')
	})
})

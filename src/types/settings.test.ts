import { DEFAULT_MODELS } from '../constants'
import { DEFAULT_SETTINGS } from '../settings/versions/v1/v1'

import { parseInfioSettings } from './settings'

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
			version: 0.7,
			workspace: '',
			activeModels: DEFAULT_MODELS,
			activeProviderTab: 'Ollama',
			openAIApiKey: '',
			anthropicApiKey: '',
			filesSearchSettings: {
				method: 'auto',
				regexBackend: 'coreplugin',
				matchBackend: 'coreplugin',
				ripgrepPath: '',
			},
			fuzzyMatchThreshold: 0.85,
			geminiApiKey: '',
			groqApiKey: '',
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
			anthropicProvider: {
				name: 'Anthropic',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			ollamaChatModel: {
				baseUrl: '',
				model: '',
			},
			openAICompatibleChatModel: {
				baseUrl: '',
				apiKey: '',
				model: '',
			},
			ollamaApplyModel: {
				baseUrl: '',
				model: '',
			},
			openAICompatibleApplyModel: {
				baseUrl: '',
				apiKey: '',
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
			webSearchProvider: 'tavily',
			tavilyApiKey: '',
			yacyBaseUrl: 'http://localhost:8090',
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
			googleProvider: {
				name: 'Google',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			groqProvider: {
				name: 'Groq',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			grokProvider: {
				name: 'Grok',
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
			openaiProvider: {
				name: 'OpenAI',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			openaicompatibleProvider: {
				name: 'OpenAICompatible',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: true,
				models: [],
			},
			openrouterProvider: {
				name: 'OpenRouter',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
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
			version: 0.7,
			workspace: '',
			activeModels: DEFAULT_MODELS,
			activeProviderTab: 'Ollama',
			openAIApiKey: 'openai-api-key',
			anthropicApiKey: 'anthropic-api-key',
			filesSearchSettings: {
				method: 'auto',
				regexBackend: 'coreplugin',
				matchBackend: 'coreplugin',
				ripgrepPath: '',
			},
			fuzzyMatchThreshold: 0.85,
			geminiApiKey: '',
			groqApiKey: 'groq-api-key',
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
			anthropicProvider: {
				name: 'Anthropic',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			ollamaChatModel: {
				baseUrl: '',
				model: '',
			},
			openAICompatibleChatModel: {
				baseUrl: '',
				apiKey: '',
				model: '',
			},
			ollamaApplyModel: {
				baseUrl: '',
				model: '',
			},
			openAICompatibleApplyModel: {
				baseUrl: '',
				apiKey: '',
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
			webSearchProvider: 'tavily',
			tavilyApiKey: '',
			yacyBaseUrl: 'http://localhost:8090',
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
			googleProvider: {
				name: 'Google',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			groqProvider: {
				name: 'Groq',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			grokProvider: {
				name: 'Grok',
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
			openaiProvider: {
				name: 'OpenAI',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
				models: [],
			},
			openaicompatibleProvider: {
				name: 'OpenAICompatible',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: true,
				models: [],
			},
			openrouterProvider: {
				name: 'OpenRouter',
				apiKey: '',
				baseUrl: '',
				useCustomUrl: false,
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
		expect(result.version).toBe(0.7)
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
		expect(result.version).toBe(0.7)
	})
})

describe('Infio provider removal migration (0.5 -> 0.7)', () => {
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
				{ provider: 'OpenAI', modelId: 'gpt-4o' },
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

		expect(result.version).toBe(0.7)
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
		expect(result.collectedChatModels).toEqual([{ provider: 'OpenAI', modelId: 'gpt-4o' }])
		expect(result.collectedEmbeddingModels).toEqual([])
		expect('infioProvider' in result).toBe(false)
		expect('infioApiKey' in result).toBe(false)
	})
})

describe('Serper/Jina removal migration (0.6 -> 0.7)', () => {
	it('drops the removed web-search credentials and falls back to Tavily defaults', () => {
		const serperEraSettings = {
			version: 0.6,
			serperApiKey: 'secret-serper-key',
			serperSearchEngine: 'bing',
			jinaApiKey: 'secret-jina-key',
		}

		const result = parseInfioSettings(serperEraSettings)

		expect(result.version).toBe(0.7)
		expect('serperApiKey' in result).toBe(false)
		expect('serperSearchEngine' in result).toBe(false)
		expect('jinaApiKey' in result).toBe(false)
		expect(result.webSearchProvider).toBe('tavily')
		expect(result.tavilyApiKey).toBe('')
		expect(result.yacyBaseUrl).toBe('http://localhost:8090')
	})
})

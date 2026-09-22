import { z } from 'zod';

import { DEFAULT_MODELS } from '../constants';
import {
	MAX_DELAY,
	MAX_MAX_CHAR_LIMIT,
	MIN_DELAY,
	MIN_MAX_CHAR_LIMIT,
	MIN_MAX_TOKENS,
	fewShotExampleSchema,
	modelOptionsSchema
} from '../settings/versions/shared';
export const DEFAULT_SETTINGS = {
	// version: "1",

	// General settings
	autocompleteEnabled: true,
	advancedMode: false,
	apiProvider: "openai",
	// API settings
	azureOAIApiSettings: {
		key: "",
		url: "https://YOUR_AOI_SERVICE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT_NAME/chat/completions",
	},
	openAIApiSettings: {
		key: "",
		url: "https://api.openai.com/v1/chat/completions",
		model: "gpt-3.5-turbo",
	},
	ollamaApiSettings: {
		url: "http://localhost:11434/api/chat",
		model: "",
	},

	// Trigger settings
	triggers: [
		{ type: "string", value: "# " },
		{ type: "string", value: ". " },
		{ type: "string", value: ": " },
		{ type: "string", value: ", " },
		{ type: "string", value: "! " },
		{ type: "string", value: "? " },
		{ type: "string", value: "`" },
		{ type: "string", value: "' " },
		{ type: "string", value: "= " },
		{ type: "string", value: "$ " },
		{ type: "string", value: "> " },
		{ type: "string", value: "\n" },

		// bullet list
		{ type: "regex", value: "[\\t ]*(\\-|\\*)[\\t ]+$" },
		// numbered list
		{ type: "regex", value: "[\\t ]*[0-9A-Za-z]+\\.[\\t ]+$" },
		// new line with spaces
		{ type: "regex", value: "\\$\\$\\n[\\t ]*$" },
		// markdown multiline code block
		{ type: "regex", value: "```[a-zA-Z0-9]*(\\n\\s*)?$" },
		// task list normal, sub or numbered.
		{ type: "regex", value: "\\s*(-|[0-9]+\\.) \\[.\\]\\s+$" },
	],

	delay: 500,
	// Request settings
	modelOptions: {
		temperature: 1,
		top_p: 0.1,
		frequency_penalty: 0.25,
		presence_penalty: 0,
		max_tokens: MIN_MAX_TOKENS,
	},
	// Prompt settings
	systemMessage: `Your job is to predict the most logical text that should be written at the location of the <mask/>.
Your answer can be either code, a single word, or multiple sentences.
If the <mask/> is in the middle of a partial sentence, your answer should only be the 1 or 2 words fixes the sentence and not the entire sentence.
You are not allowed to have any overlapping text directly surrounding the <mask/>.  
Your answer must be in the same language as the text directly surrounding the <mask/>.
Your response must have the following format:
THOUGHT: here, you reason about the answer; use the 80/20 principle to be brief.
LANGUAGE: here, you write the language of your answer, e.g. English, Python, Dutch, etc.
ANSWER: here, you write the text that should be at the location of <mask/>
`,
	fewShotExamples: [
	],
	userMessageTemplate: "{{prefix}}<mask/>{{suffix}}",
	chainOfThoughRemovalRegex: `(.|\\n)*ANSWER:`,
	// Preprocessing settings
	dontIncludeDataviews: true,
	maxPrefixCharLimit: 4000,
	maxSuffixCharLimit: 4000,
	// Postprocessing settings
	removeDuplicateMathBlockIndicator: true,
	removeDuplicateCodeBlockIndicator: true,
	ignoredFilePatterns: "**/secret/**\n",
	ignoredTags: "",
	cacheSuggestions: true,
	debugMode: false,
};
import { ApiProvider } from './llm/model';
import { logger } from '../utils/logger'

export function isRegexValid(value: string): boolean {
	try {
		const regex = new RegExp(value);
		regex.test("");
		return true;
	} catch (e) {
		return false;
	}
}

export function isValidIgnorePattern(value: string): boolean {
	if (typeof value !== "string" || value.length === 0) return false;
	// 不允许以单个反斜杠结尾
	if (/\\$/.test(value)) return false;

	const openerToCloser: Record<string, string> = { "[": "]", "{": "}", "(": ")" };
	const validExtglobLeaders = new Set(["!", "?", "+", "*", "@"]);
	const stack: string[] = [];

	const isEscaped = (s: string, i: number): boolean => {
		let backslashes = 0;
		for (let k = i - 1; k >= 0 && s[k] === "\\"; k--) backslashes++;
		return backslashes % 2 === 1;
	};

	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if (isEscaped(value, i)) continue;

		if (ch === "[" || ch === "{" || ch === "(") {
			// 括号需作为 extglob 的一部分，如 !(...), ?(...), +(...), *(...), @(...)
			if (ch === "(") {
				const prev = value[i - 1];
				if (!validExtglobLeaders.has(prev ?? "")) return false;
			}
			stack.push(openerToCloser[ch]);
		} else if (ch === "]" || ch === "}" || ch === ")") {
			const expected = stack.pop();
			if (expected !== ch) return false;
		}
	}

	return stack.length === 0;
}
export const SETTINGS_SCHEMA_VERSION = 0.6

const OpenRouterProviderSchema = z.object({
	name: z.literal('OpenRouter'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'OpenRouter',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const SiliconFlowProviderSchema = z.object({
	name: z.literal('SiliconFlow'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'SiliconFlow',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const AlibabaQwenProviderSchema = z.object({
	name: z.literal('AlibabaQwen'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'AlibabaQwen',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const AnthropicProviderSchema = z.object({
	name: z.literal('Anthropic'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().optional(),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'Anthropic',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const DeepSeekProviderSchema = z.object({
	name: z.literal('DeepSeek'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'DeepSeek',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const GoogleProviderSchema = z.object({
	name: z.literal('Google'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'Google',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const OpenAIProviderSchema = z.object({
	name: z.literal('OpenAI'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().optional(),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'OpenAI',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const OpenAICompatibleProviderSchema = z.object({
	name: z.literal('OpenAICompatible'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().optional(),
	useCustomUrl: z.boolean().catch(true),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'OpenAICompatible',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: true,
	models: []
})

const OllamaProviderSchema = z.object({
	name: z.literal('Ollama'),
	apiKey: z.string().catch('ollama'),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'Ollama',
	apiKey: 'ollama',
	baseUrl: '',
	useCustomUrl: true,
	models: []
})

const GroqProviderSchema = z.object({
	name: z.literal('Groq'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'Groq',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const GrokProviderSchema = z.object({
	name: z.literal('Grok'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'Grok',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const MoonshotProviderSchema = z.object({
	name: z.literal('Moonshot'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'Moonshot',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const LocalProviderSchema = z.object({
	name: z.literal('LocalProvider'),
	apiKey: z.string().catch(''),
	baseUrl: z.string().catch(''),
	useCustomUrl: z.boolean().catch(false),
	models: z.array(z.string()).catch([])
}).catch({
	name: 'LocalProvider',
	apiKey: '',
	baseUrl: '',
	useCustomUrl: false,
	models: []
})

const ollamaModelSchema = z.object({
	baseUrl: z.string().catch(''),
	model: z.string().catch(''),
})

const openAICompatibleModelSchema = z.object({
	baseUrl: z.string().catch(''),
	apiKey: z.string().catch(''),
	model: z.string().catch(''),
})

const ragOptionsSchema = z.object({
	filesystem: z.enum(['idb', 'opfs']).catch('opfs'),
	chunkSize: z.number().catch(500),
	batchSize: z.number().catch(32),
	thresholdTokens: z.number().catch(8192),
	minSimilarity: z.number().catch(0.0),
	limit: z.number().catch(10),
	excludePatterns: z.array(z.string()).catch([]),
	includePatterns: z.array(z.string()).catch([]),
})

export const triggerSchema = z.object({
	type: z.enum(['string', 'regex']),
	value: z.string().min(1, { message: "Trigger value must be at least 1 character long" })
}).strict().superRefine((trigger, ctx) => {
	if (trigger.type === "regex") {
		if (!trigger.value.endsWith("$")) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Regex triggers must end with a $.",
				path: ["value"],
			});
		}
		if (!isRegexValid(trigger.value)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Invalid regex: "${trigger.value}"`,
				path: ["value"],
			});
		}
	}
});

const FilesSearchSettingsSchema = z.object({
	method: z.enum(['match', 'regex', 'semantic', 'auto']).catch('auto'),
	regexBackend: z.enum(['coreplugin', 'ripgrep']).catch('coreplugin'),
	matchBackend: z.enum(['omnisearch', 'coreplugin']).catch('coreplugin'),
	ripgrepPath: z.string().catch(''),
}).catch({
	method: 'auto',
	regexBackend: 'coreplugin',
	matchBackend: 'coreplugin',
	ripgrepPath: '',
});

export const InfioSettingsSchema = z.object({
	// Version
	version: z.literal(SETTINGS_SCHEMA_VERSION).catch(SETTINGS_SCHEMA_VERSION),

	// Provider
	defaultProvider: z.nativeEnum(ApiProvider).catch(ApiProvider.Ollama),
	openrouterProvider: OpenRouterProviderSchema,
	siliconflowProvider: SiliconFlowProviderSchema,
	alibabaQwenProvider: AlibabaQwenProviderSchema,
	anthropicProvider: AnthropicProviderSchema,
	deepseekProvider: DeepSeekProviderSchema,
	openaiProvider: OpenAIProviderSchema,
	googleProvider: GoogleProviderSchema,
	ollamaProvider: OllamaProviderSchema,
	groqProvider: GroqProviderSchema,
	grokProvider: GrokProviderSchema,
	moonshotProvider: MoonshotProviderSchema,
	openaicompatibleProvider: OpenAICompatibleProviderSchema,
	localproviderProvider: LocalProviderSchema,

	// MCP Servers
	mcpEnabled: z.boolean().catch(false),

	// Chat Model start list
	collectedChatModels: z.array(z.object({
		provider: z.nativeEnum(ApiProvider),
		modelId: z.string(),
	})).catch([]),

	// Insight Model start list
	collectedInsightModels: z.array(z.object({
		provider: z.nativeEnum(ApiProvider),
		modelId: z.string(),
	})).catch([]),

	// Apply Model start list
	collectedApplyModels: z.array(z.object({
		provider: z.nativeEnum(ApiProvider),
		modelId: z.string(),
	})).catch([]),

	// Embedding Model start list
	collectedEmbeddingModels: z.array(z.object({
		provider: z.nativeEnum(ApiProvider),
		modelId: z.string(),
	})).catch([]),

	// Active Provider Tab (for UI state)
	activeProviderTab: z.nativeEnum(ApiProvider).catch(ApiProvider.Ollama),

	// Chat Model 
	chatModelProvider: z.nativeEnum(ApiProvider).catch(ApiProvider.Ollama),
	chatModelId: z.string().catch(''),

	// Insight Model
	insightModelProvider: z.nativeEnum(ApiProvider).catch(ApiProvider.Ollama),
	insightModelId: z.string().catch(''),

	// Apply Model
	applyModelProvider: z.nativeEnum(ApiProvider).catch(ApiProvider.Ollama),
	applyModelId: z.string().catch(''),

	// Embedding Model
	embeddingModelProvider: z.nativeEnum(ApiProvider).catch(ApiProvider.LocalProvider),
	embeddingModelId: z.string().catch(''),

	// fuzzyMatchThreshold
	fuzzyMatchThreshold: z.number().catch(0.85),

	// experimentalDiffStrategy
	experimentalDiffStrategy: z.boolean().catch(false),

	// multiSearchReplaceDiffStrategy
	multiSearchReplaceDiffStrategy: z.boolean().catch(true),

	// Workspace
	workspace: z.string().catch(''),
	// Mode
	mode: z.string().catch('ask'),
	defaultMention: z.enum(['none', 'current-file', 'vault']).catch('none'),

	// web search
	serperApiKey: z.string().catch(''),
	serperSearchEngine: z.enum(['google', 'duckduckgo', 'bing']).catch('google'),
	jinaApiKey: z.string().catch(''),

	// Files Search
	filesSearchSettings: FilesSearchSettingsSchema,

	/// [compatible]
	// activeModels [compatible]
	activeModels: z.array(
		z.object({
			name: z.string(),
			provider: z.string(),
			enabled: z.boolean(),
			isEmbeddingModel: z.boolean(),
			isBuiltIn: z.boolean(),
			apiKey: z.string().optional(),
			baseUrl: z.string().optional(),
			dimension: z.number().optional(),
		})
	).catch(DEFAULT_MODELS),
	// API Keys [compatible]
	openAIApiKey: z.string().catch(''),
	anthropicApiKey: z.string().catch(''),
	geminiApiKey: z.string().catch(''),
	groqApiKey: z.string().catch(''),
	deepseekApiKey: z.string().catch(''),
	ollamaEmbeddingModel: ollamaModelSchema.catch({
		baseUrl: '',
		model: '',
	}),
	ollamaChatModel: ollamaModelSchema.catch({
		baseUrl: '',
		model: '',
	}),
	openAICompatibleChatModel: openAICompatibleModelSchema.catch({
		baseUrl: '',
		apiKey: '',
		model: '',
	}),
	ollamaApplyModel: ollamaModelSchema.catch({
		baseUrl: '',
		model: '',
	}),
	openAICompatibleApplyModel: openAICompatibleModelSchema.catch({
		baseUrl: '',
		apiKey: '',
		model: '',
	}),

	// System Prompt
	systemPrompt: z.string().catch(''),

	// RAG Options
	ragOptions: ragOptionsSchema.catch({
		filesystem: 'opfs',
		batchSize: 32,
		chunkSize: 500,
		thresholdTokens: 8192,
		minSimilarity: 0.0,
		limit: 10,
		excludePatterns: [],
		includePatterns: [],
	}),

	// autocomplete options
	autocompleteEnabled: z.boolean(),
	advancedMode: z.boolean(),

	// [compatible]
	apiProvider: z.enum(['azure', 'openai', "ollama"]),
	azureOAIApiSettings: z.string().catch(''),
	openAIApiSettings: z.string().catch(''),
	ollamaApiSettings: z.string().catch(''),

	triggers: z.array(triggerSchema),
	delay: z.number().int().min(MIN_DELAY, { message: "Delay must be between 0ms and 2000ms" }).max(MAX_DELAY, { message: "Delay must be between 0ms and 2000ms" }),
	modelOptions: modelOptionsSchema,
	systemMessage: z.string().min(3, { message: "System message must be at least 3 characters long" }),
	fewShotExamples: z.array(fewShotExampleSchema),
	userMessageTemplate: z.string().min(3, { message: "User message template must be at least 3 characters long" }),
	chainOfThoughRemovalRegex: z.string().refine((regex) => isRegexValid(regex), { message: "Invalid regex" }),
	dontIncludeDataviews: z.boolean(),
	maxPrefixCharLimit: z.number().int().min(MIN_MAX_CHAR_LIMIT, { message: `Max prefix char limit must be at least ${MIN_MAX_CHAR_LIMIT}` }).max(MAX_MAX_CHAR_LIMIT, { message: `Max prefix char limit must be at most ${MAX_MAX_CHAR_LIMIT}` }),
	maxSuffixCharLimit: z.number().int().min(MIN_MAX_CHAR_LIMIT, { message: `Max prefix char limit must be at least ${MIN_MAX_CHAR_LIMIT}` }).max(MAX_MAX_CHAR_LIMIT, { message: `Max prefix char limit must be at most ${MAX_MAX_CHAR_LIMIT}` }),
	removeDuplicateMathBlockIndicator: z.boolean(),
	removeDuplicateCodeBlockIndicator: z.boolean(),
	ignoredFilePatterns: z.string().refine((value) => value
		.split("\n")
		.filter(s => s.trim().length > 0)
		.filter(s => !isValidIgnorePattern(s)).length === 0,
		{ message: "Invalid ignore pattern" }
	),
	ignoredTags: z.string().refine((value) => value
		.split("\n")
		.filter(s => s.includes(" ")).length === 0, { message: "Tags cannot contain spaces" }
	).refine((value) => value
		.split("\n")
		.filter(s => s.includes("#")).length === 0, { message: "Enter tags without the # symbol" }
	).refine((value) => value
		.split("\n")
		.filter(s => s.includes(",")).length === 0, { message: "Enter each tag on a new line without commas" }
	),
	cacheSuggestions: z.boolean(),
	debugMode: z.boolean(),
})

export type InfioSettings = z.infer<typeof InfioSettingsSchema>
export type FilesSearchSettings = z.infer<typeof FilesSearchSettingsSchema>

type Migration = {
	fromVersion: number
	toVersion: number
	migrate: (data: Record<string, unknown>) => Record<string, unknown>
}

const MIGRATIONS: Migration[] = [
	{
		fromVersion: 0.1,
		toVersion: 0.4,
		migrate: (data) => {
			const newData = { ...data }
			newData.version = 0.4
			return newData
		},
	},
	{
		fromVersion: 0.4,
		toVersion: 0.5,
		migrate: (data) => {
			const newData = { ...data }
			newData.version = 0.5
			
			// Handle max_tokens minimum value increase from 800 to 4096
			if (newData.modelOptions && typeof newData.modelOptions === 'object') {
				const modelOptions = newData.modelOptions as Record<string, any>
				if (typeof modelOptions.max_tokens === 'number' && modelOptions.max_tokens < MIN_MAX_TOKENS) {
					logger.debug(`Updating max_tokens from ${modelOptions.max_tokens} to ${MIN_MAX_TOKENS} due to minimum value change`)
					modelOptions.max_tokens = MIN_MAX_TOKENS
				}
			}
			
			return newData
		},
	},
	{
		fromVersion: 0.5,
		toVersion: 0.6,
		migrate: (data) => {
			const newData = { ...data }
			newData.version = 0.6

			// The Infio cloud service was discontinued and the provider removed.
			// Remap selections to the new defaults and drop the stale model ids
			// that only existed on the Infio service.
			if (newData.chatModelProvider === 'Infio') {
				newData.chatModelProvider = 'Ollama'
				newData.chatModelId = ''
			}
			if (newData.insightModelProvider === 'Infio') {
				newData.insightModelProvider = 'Ollama'
				newData.insightModelId = ''
			}
			if (newData.applyModelProvider === 'Infio') {
				newData.applyModelProvider = 'Ollama'
				newData.applyModelId = ''
			}
			if (newData.embeddingModelProvider === 'Infio') {
				newData.embeddingModelProvider = 'LocalProvider'
				// same value as localProviderDefaultEmbeddingModelId in utils/api.ts;
				// hardcoded because migrations must not depend on live code
				newData.embeddingModelId = 'TaylorAI/bge-micro-v2'
			}
			if (newData.defaultProvider === 'Infio') {
				newData.defaultProvider = 'Ollama'
			}
			if (newData.activeProviderTab === 'Infio') {
				newData.activeProviderTab = 'Ollama'
			}

			// zod would discard the WHOLE array if a single entry referenced the
			// removed provider, so filter the collected model lists here
			for (const key of ['collectedChatModels', 'collectedInsightModels', 'collectedApplyModels', 'collectedEmbeddingModels']) {
				const list = newData[key]
				if (Array.isArray(list)) {
					newData[key] = list.filter((m) => !(m && typeof m === 'object' && 'provider' in m && m.provider === 'Infio'))
				}
			}

			// credentials/config of the removed provider
			delete newData.infioProvider
			delete newData.infioApiKey

			return newData
		},
	},
]

function migrateSettings(
	data: Record<string, unknown>,
): Record<string, unknown> {
	let currentData = { ...data }

	for (const migration of MIGRATIONS) {
		// re-read after every step so migrations chain (0.4 -> 0.5 -> 0.6)
		const currentVersion = (currentData.version as number) ?? 0
		if (
			currentVersion >= migration.fromVersion &&
			currentVersion < migration.toVersion &&
			migration.toVersion <= SETTINGS_SCHEMA_VERSION
		) {
			logger.debug(
				`Migrating settings from ${migration.fromVersion} to ${migration.toVersion}`,
			)
			currentData = migration.migrate(currentData)
		}
	}

	return currentData
}

export function parseInfioSettings(data: unknown): InfioSettings {
	try {
		const migratedData = migrateSettings(data as Record<string, unknown>)
		return InfioSettingsSchema.parse(migratedData)
	} catch (error) {
		logger.error("Failed to parse settings with migrated data, using default settings instead: ", error);
		return InfioSettingsSchema.parse({ ...DEFAULT_SETTINGS })
	}
}

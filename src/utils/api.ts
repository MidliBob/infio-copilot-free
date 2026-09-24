import { ApiProvider } from '../types/llm/model'
import { InfioSettings } from '../types/settings'
import { getOllamaEmbeddingModels, getOllamaModels } from './ollama'

export interface ModelInfo {
	maxTokens?: number
	contextWindow?: number
	supportsImages?: boolean
	supportsComputerUse?: boolean
	supportsPromptCache: boolean // this value is hardcoded for now
	inputPrice?: number
	outputPrice?: number
	cacheWritesPrice?: number
	cacheReadsPrice?: number
	description?: string
	reasoningEffort?: string,
	thinking?: boolean
	maxThinkingTokens?: number
	supportsReasoningBudget?: boolean
	requiredReasoningBudget?: boolean
	tiers?: readonly {
		readonly contextWindow: number,
		readonly inputPrice: number,
		readonly outputPrice: number,
		readonly cacheReadsPrice: number,
	}[]
}

export interface EmbeddingModelInfo {
	dimensions: number
	description?: string
}

// DeepSeek
// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekModelId = keyof typeof deepSeekModels
export const deepSeekDefaultModelId: DeepSeekModelId = "deepseek-chat"
export const deepSeekDefaultInsightModelId: DeepSeekModelId = "deepseek-chat"
export const deepSeekDefaultAutoCompleteModelId: DeepSeekModelId = "deepseek-chat"
export const deepSeekDefaultEmbeddingModelId = null // this is not supported embedding model

export const deepSeekModels = {
	"deepseek-chat": {
		maxTokens: 8_000,
		contextWindow: 64_000,
		supportsImages: false,
		supportsPromptCache: true, // supports context caching, but not in the way anthropic does it (deepseek reports input tokens and reads/writes in the same usage report) FIXME: we need to show users cache stats how deepseek does it
		inputPrice: 0.272, // technically there is no input price, it's all either a cache hit or miss (ApiOptions will not show this)
		outputPrice: 1.088,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
	},
	"deepseek-reasoner": {
		maxTokens: 8_000,
		contextWindow: 64_000,
		supportsImages: false,
		supportsPromptCache: true, // supports context caching, but not in the way anthropic does it (deepseek reports input tokens and reads/writes in the same usage report) FIXME: we need to show users cache stats how deepseek does it
		inputPrice: 0, // technically there is no input price, it's all either a cache hit or miss (ApiOptions will not show this)
		outputPrice: 2.19,
		cacheWritesPrice: 0.55,
		cacheReadsPrice: 0.14,
	},
} as const satisfies Record<string, ModelInfo>

// Qwen
// https://help.aliyun.com/zh/model-studio/getting-started/
export type QwenModelId = keyof typeof qwenModels
export const qwenDefaultModelId: QwenModelId = "qwen3-235b-a22b"
export const qwenDefaultInsightModelId: QwenModelId = "qwen3-32b"
export const qwenDefaultAutoCompleteModelId: QwenModelId = "qwen3-32b"
export const qwenDefaultEmbeddingModelId: keyof typeof qwenEmbeddingModels = "text-embedding-v3"

export const qwenModels = {
	"qwen3-235b-a22b": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
		cacheWritesPrice: 0.002,
		cacheReadsPrice: 0.006,
	},
	"qwen3-32b": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
	},
	"qwen3-30b-a3b": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
	},
	"qwen3-14b": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
	},
	"qwen3-8b": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
	},
	"qwen2.5-coder-32b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
		cacheWritesPrice: 0.002,
		cacheReadsPrice: 0.006,
	},
	"qwen2.5-coder-14b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
		cacheWritesPrice: 0.002,
		cacheReadsPrice: 0.006,
	},
	"qwen2.5-coder-7b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.001,
		outputPrice: 0.002,
		cacheWritesPrice: 0.001,
		cacheReadsPrice: 0.002,
	},
	"qwen2.5-coder-3b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen2.5-coder-1.5b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen2.5-coder-0.5b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen-coder-plus-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.5,
		outputPrice: 7,
		cacheWritesPrice: 3.5,
		cacheReadsPrice: 7,
	},
	"qwen-plus-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.8,
		outputPrice: 2,
		cacheWritesPrice: 0.8,
		cacheReadsPrice: 0.2,
	},
	"qwen-turbo-latest": {
		maxTokens: 1_000_000,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.8,
		outputPrice: 2,
		cacheWritesPrice: 0.8,
		cacheReadsPrice: 2,
	},
	"qwen-max-latest": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.4,
		outputPrice: 9.6,
		cacheWritesPrice: 2.4,
		cacheReadsPrice: 9.6,
	},
	"qwq-plus-latest": {
		maxTokens: 8_192,
		contextWindow: 131_071,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwq-plus": {
		maxTokens: 8_192,
		contextWindow: 131_071,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen-coder-plus": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.5,
		outputPrice: 7,
		cacheWritesPrice: 3.5,
		cacheReadsPrice: 7,
	},
	"qwen-plus": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.8,
		outputPrice: 2,
		cacheWritesPrice: 0.8,
		cacheReadsPrice: 0.2,
	},
	"qwen-turbo": {
		maxTokens: 1_000_000,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 0.6,
	},
	"qwen-max": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.4,
		outputPrice: 9.6,
		cacheWritesPrice: 2.4,
		cacheReadsPrice: 9.6,
	},
	"deepseek-v3": {
		maxTokens: 8_000,
		contextWindow: 64_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.28,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
	},
	"deepseek-r1": {
		maxTokens: 8_000,
		contextWindow: 64_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 2.19,
		cacheWritesPrice: 0.55,
		cacheReadsPrice: 0.14,
	},
	"qwen-vl-max": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3,
		outputPrice: 9,
		cacheWritesPrice: 3,
		cacheReadsPrice: 9,
	},
	"qwen-vl-max-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3,
		outputPrice: 9,
		cacheWritesPrice: 3,
		cacheReadsPrice: 9,
	},
	"qwen-vl-plus": {
		maxTokens: 6_000,
		contextWindow: 8_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.5,
		outputPrice: 4.5,
		cacheWritesPrice: 1.5,
		cacheReadsPrice: 4.5,
	},
	"qwen-vl-plus-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.5,
		outputPrice: 4.5,
		cacheWritesPrice: 1.5,
		cacheReadsPrice: 4.5,
	},
} as const satisfies Record<string, ModelInfo>
export const qwenEmbeddingModels = {
	"text-embedding-v4": {
		dimensions: 1024,
		description: "Supports 50+ major languages including Chinese, English, Spanish, French, Portuguese, Indonesian, Japanese, Korean, German and Russian. Up to 20 rows, up to 8,192 tokens per row. Optional dimensions: 1,024 (default), 768 or 512. Pricing: 0.0007 CNY per 1k tokens; free quota: 500,000 tokens (valid for 180 days)."
	},
	"text-embedding-v3": {
		dimensions: 1024,
		description: "Supports 50+ major languages including Chinese, English, Spanish, French, Portuguese, Indonesian, Japanese, Korean, German and Russian. Up to 20 rows, up to 8,192 tokens per row. Optional dimensions: 1,024 (default), 768 or 512. Pricing: 0.0007 CNY per 1k tokens; free quota: 500,000 tokens (valid for 180 days)."
	},
	"text-embedding-v2": {
		dimensions: 1536,
		description: "Multilingual: Chinese, English, Spanish, French, Portuguese, Indonesian, Japanese, Korean, German and Russian. Up to 25 rows, up to 2,048 tokens per row."
	},
	"text-embedding-v1": {
		dimensions: 1536,
		description: "Supports Chinese, English, Spanish, French, Portuguese and Indonesian."
	},
	"text-embedding-async-v2": {
		dimensions: 1536,
		description: "Asynchronous processing for large-scale text. Supports Chinese, English, Spanish, French, Portuguese, Indonesian, Japanese, Korean, German and Russian."
	},
	"text-embedding-async-v1": {
		dimensions: 1536,
		description: "Asynchronous processing for large-scale text. Supports Chinese, English, Spanish, French, Portuguese and Indonesian."
	}
} as const satisfies Record<string, EmbeddingModelInfo>

// bytedance volcengine
//https://api.volcengine.com/api-docs/view/overview


// SiliconFlow
// https://docs.siliconflow.cn/
export type SiliconFlowModelId = keyof typeof siliconFlowModels
export const siliconFlowDefaultModelId: SiliconFlowModelId = "deepseek-ai/DeepSeek-V3"
export const siliconFlowDefaultInsightModelId: SiliconFlowModelId = "deepseek-ai/DeepSeek-V3"
export const siliconFlowDefaultAutoCompleteModelId: SiliconFlowModelId = "deepseek-ai/DeepSeek-V3"
export const siliconFlowDefaultEmbeddingModelId: keyof typeof siliconFlowEmbeddingModels = "BAAI/bge-m3"

export const siliconFlowModels = {
	"01-ai/Yi-1.5-9B-Chat-16K": {
		maxTokens: 8192,
		contextWindow: 16_384,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"01-ai/Yi-1.5-34B-Chat-16K": {
		maxTokens: 8192,
		contextWindow: 16_384,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 2.0,
	},
	"google/gemma-2-9b-it": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"google/gemma-2-27b-it": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 2.0,
	},
	"Pro/google/gemma-2-9b-it": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"meta-llama/Meta-Llama-3.1-8B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"Pro/meta-llama/Meta-Llama-3.1-8B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"meta-llama/Meta-Llama-3.1-70B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 4.0,
	},
	"meta-llama/Meta-Llama-3.1-405B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 5.0,
		outputPrice: 10.0,
	},
	"internlm/internlm2_5-20b-chat": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.8,
		outputPrice: 1.6,
	},
	"Qwen/Qwen2.5-72B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 4.0,
	},
	"Qwen/Qwen2.5-7B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.4,
		outputPrice: 0.8,
	},
	"Qwen/Qwen2.5-14B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.6,
		outputPrice: 1.2,
	},
	"Qwen/Qwen2.5-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 2.0,
	},
	"Qwen/Qwen2.5-Coder-7B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.4,
		outputPrice: 0.8,
	},
	"Qwen/Qwen2.5-VL-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.4,
		outputPrice: 0.8,
	},
	"Qwen/Qwen2.5-VL-72B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.4,
		outputPrice: 0.8,
	},
	"TeleAI/TeleChat2": {
		maxTokens: 4096,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
	},
	"Pro/Qwen/Qwen2.5-7B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.4,
		outputPrice: 0.8,
	},
	"Qwen/Qwen2.5-72B-Instruct-128K": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 4.0,
	},
	"Qwen/Qwen2-VL-72B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 2.5,
		outputPrice: 5.0,
	},
	"OpenGVLab/InternVL2-26B": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 2.0,
	},
	"Pro/BAAI/bge-m3": {
		maxTokens: 4096,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
	},
	"Pro/OpenGVLab/InternVL2-8B": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"Vendor-A/Qwen/Qwen2.5-72B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 4.0,
	},
	"Pro/Qwen/Qwen2-VL-7B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"LoRA/Qwen/Qwen2.5-7B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.4,
		outputPrice: 0.8,
	},
	"Pro/Qwen/Qwen2.5-Coder-7B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.4,
		outputPrice: 0.8,
	},
	"LoRA/Qwen/Qwen2.5-72B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 4.0,
	},
	"Qwen/Qwen2.5-Coder-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 2.0,
	},
	"Pro/BAAI/bge-reranker-v2-m3": {
		maxTokens: 4096,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
	},
	"Qwen/QwQ-32B": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 2.0,
	},
	"Qwen/QwQ-32B-Preview": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 2.0,
	},
	"AIDC-AI/Marco-o1": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"LoRA/Qwen/Qwen2.5-14B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.6,
		outputPrice: 1.2,
	},
	"LoRA/Qwen/Qwen2.5-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 2.0,
	},
	"meta-llama/Llama-3.3-70B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 4.0,
	},
	"LoRA/meta-llama/Meta-Llama-3.1-8B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"deepseek-ai/deepseek-vl2": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.0,
	},
	"Qwen/QVQ-72B-Preview": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 2.5,
		outputPrice: 5.0,
	},
	"deepseek-ai/DeepSeek-V3": {
		maxTokens: 8000,
		contextWindow: 64000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.28,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
	},
	"deepseek-ai/DeepSeek-R1": {
		maxTokens: 8000,
		contextWindow: 64000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 2.19,
		cacheWritesPrice: 0.55,
		cacheReadsPrice: 0.14,
	},
	"Pro/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B": {
		maxTokens: 4096,
		contextWindow: 16_384,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.2,
		cacheWritesPrice: 0.1,
		cacheReadsPrice: 0.01,
	},
	"Pro/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B": {
		maxTokens: 8000,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.4,
		cacheWritesPrice: 0.2,
		cacheReadsPrice: 0.02,
	},
	"Pro/deepseek-ai/DeepSeek-R1-Distill-Llama-8B": {
		maxTokens: 8000,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.4,
		cacheWritesPrice: 0.2,
		cacheReadsPrice: 0.02,
	},
	"deepseek-ai/DeepSeek-R1-Distill-Qwen-14B": {
		maxTokens: 8000,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.6,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 0.03,
	},
	"deepseek-ai/DeepSeek-R1-Distill-Qwen-32B": {
		maxTokens: 8000,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 1.0,
		cacheWritesPrice: 0.5,
		cacheReadsPrice: 0.05,
	},
	"deepseek-ai/DeepSeek-R1-Distill-Llama-70B": {
		maxTokens: 8000,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 2.0,
		cacheWritesPrice: 1.0,
		cacheReadsPrice: 0.1,
	},
	"deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B": {
		maxTokens: 4096,
		contextWindow: 16_384,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.2,
		cacheWritesPrice: 0.1,
		cacheReadsPrice: 0.01,
	},
	"deepseek-ai/DeepSeek-R1-Distill-Qwen-7B": {
		maxTokens: 8000,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.4,
		cacheWritesPrice: 0.2,
		cacheReadsPrice: 0.02,
	},
	"deepseek-ai/DeepSeek-R1-Distill-Llama-8B": {
		maxTokens: 8000,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.4,
		cacheWritesPrice: 0.2,
		cacheReadsPrice: 0.02,
	},
	"Pro/deepseek-ai/DeepSeek-R1": {
		maxTokens: 8000,
		contextWindow: 64000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 2.19,
		cacheWritesPrice: 0.55,
		cacheReadsPrice: 0.14,
	},
	"Pro/deepseek-ai/DeepSeek-V3": {
		maxTokens: 8000,
		contextWindow: 64000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.28,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
	}
} as const satisfies Record<string, ModelInfo>

export const siliconFlowEmbeddingModels = {
	"BAAI/bge-m3": {
		dimensions: 1024,
		description: "BGE-M3 is a versatile, multilingual, multi-granularity text embedding model. It supports three common retrieval functions: dense retrieval, multi-vector retrieval and sparse retrieval. It handles 100+ languages and inputs of different granularity, from short sentences to long documents of up to 8,192 tokens. BGE-M3 excels at multilingual and cross-lingual retrieval, achieving leading results on benchmarks such as MIRACL and MKQA, and shows strong long-document retrieval performance on the MLDR and NarrativeQA datasets"
	},
	"netease-youdao/bce-embedding-base_v1": {
		dimensions: 768,
		description: "bce-embedding-base_v1 is a bilingual and cross-lingual embedding model developed by NetEase Youdao. It excels at Chinese-English semantic representation and retrieval tasks, especially in cross-lingual scenarios. Optimized for retrieval-augmented generation (RAG) systems, it can be applied directly in education, healthcare, legal and other domains. It requires no special instruction and efficiently generates semantic vectors, providing key support for semantic search and question-answering systems"
	},
	"BAAI/bge-large-zh-v1.5": {
		dimensions: 1024,
		description: "BAAI/bge-large-zh-v1.5 is a large Chinese text embedding model, part of the BGE (BAAI General Embedding) family. It performs strongly on the C-MTEB benchmark with an average score of 64.53 across 31 datasets, achieving excellent results in retrieval, semantic similarity, sentence-pair classification and other tasks. It supports input lengths of up to 512 tokens and is suitable for a wide range of Chinese NLP tasks such as text retrieval and semantic similarity computation"
	},
	"BAAI/bge-large-en-v1.5": {
		dimensions: 1024,
		description: "BAAI/bge-large-en-v1.5 is a large English text embedding model, part of the BGE (BAAI General Embedding) family. It performs strongly on the MTEB benchmark with an average score of 64.23 across 56 datasets, achieving excellent results in retrieval, clustering, sentence-pair classification and other tasks. It supports input lengths of up to 512 tokens and is suitable for a wide range of NLP tasks such as text retrieval and semantic similarity computation"
	},
	"Pro/BAAI/bge-m3": {
		dimensions: 1024,
		description: "BGE-M3 is a versatile, multilingual, multi-granularity text embedding model. It supports three common retrieval functions: dense retrieval, multi-vector retrieval and sparse retrieval. It handles 100+ languages and inputs of different granularity, from short sentences to long documents of up to 8,192 tokens. BGE-M3 excels at multilingual and cross-lingual retrieval, achieving leading results on benchmarks such as MIRACL and MKQA, and shows strong long-document retrieval performance on the MLDR and NarrativeQA datasets"
	}
} as const satisfies Record<string, EmbeddingModelInfo>

// Moonshot
// https://platform.moonshot.cn/docs/pricing
export type MoonshotModelId = keyof typeof moonshotModels
export const moonshotDefaultModelId: MoonshotModelId = "kimi-k2-0711-preview"
export const moonshotDefaultInsightModelId: MoonshotModelId = "kimi-latest"
export const moonshotDefaultAutoCompleteModelId: MoonshotModelId = "kimi-latest"
export const moonshotDefaultEmbeddingModelId = null // this is not supported embedding model

export const moonshotModels = {
	"kimi-k2-0711-preview": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "128k context length MoE architecture foundation model with strong coding and Agent capabilities, total parameters 1T, active parameters 32B"
	},
	"kimi-latest": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: true,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "Latest Kimi model version with 128k context length and image understanding capabilities"
	},
	"kimi-thinking-preview": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: true,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "Multimodal reasoning model with 128k context length, excels at deep reasoning tasks"
	},
	"moonshot-v1-8k": {
		maxTokens: 8192,
		contextWindow: 8_000,
		supportsImages: false,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "8k context length model optimized for short text generation"
	},
	"moonshot-v1-32k": {
		maxTokens: 8192,
		contextWindow: 32_000,
		supportsImages: false,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "32k context length model optimized for longer text generation"
	},
	"moonshot-v1-128k": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "128k context length model optimized for very long text generation"
	},
	"moonshot-v1-8k-vision-preview": {
		maxTokens: 8192,
		contextWindow: 8_000,
		supportsImages: true,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "8k context length vision model with image understanding capabilities"
	},
	"moonshot-v1-32k-vision-preview": {
		maxTokens: 8192,
		contextWindow: 32_000,
		supportsImages: true,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "32k context length vision model with image understanding capabilities"
	},
	"moonshot-v1-128k-vision-preview": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: true,
		supportsComputerUse: true,
		supportsPromptCache: true,
		description: "128k context length vision model with image understanding capabilities"
	}
} as const satisfies Record<string, ModelInfo>

// LocalProvider (local embedding models)
export const localProviderDefaultModelId = null // this is not supported for chat/autocomplete
export const localProviderDefaultInsightModelId = null // this is not supported for insight
export const localProviderDefaultAutoCompleteModelId = null // this is not supported for chat/autocomplete  
export const localProviderDefaultEmbeddingModelId: keyof typeof localProviderEmbeddingModels = "TaylorAI/bge-micro-v2"

export const localProviderEmbeddingModels = {
	'TaylorAI/bge-micro-v2': { dimensions: 384, description: 'BGE-micro-v2 (local, 512 tokens, 384-dim)' },
	'Xenova/all-MiniLM-L6-v2': { dimensions: 384, description: 'All-MiniLM-L6-v2 (recommended, lightweight)' },
	'Xenova/bge-small-en-v1.5': { dimensions: 384, description: 'BGE-small-en-v1.5' },
	'Xenova/bge-base-en-v1.5': { dimensions: 768, description: 'BGE-base-en-v1.5 (higher quality)' },
	'Xenova/jina-embeddings-v2-base-zh': { dimensions: 768, description: 'Jina-v2-base-zh (Chinese-English bilingual)' },
	'Xenova/jina-embeddings-v2-small-en': { dimensions: 512, description: 'Jina-v2-small-en' },
	'Xenova/multilingual-e5-small': { dimensions: 384, description: 'E5-small (multilingual)' },
	'Xenova/multilingual-e5-base': { dimensions: 768, description: 'E5-base (multilingual, higher quality)' },
	'Xenova/gte-small': { dimensions: 384, description: 'GTE-small' },
	'Xenova/e5-small-v2': { dimensions: 384, description: 'E5-small-v2' },
	'Xenova/e5-base-v2': { dimensions: 768, description: 'E5-base-v2 (higher quality)' },
	'Snowflake/snowflake-arctic-embed-xs': { dimensions: 384, description: 'Snowflake Arctic Embed XS (local, 512 tokens, 384-dim)' },
	'Snowflake/snowflake-arctic-embed-s': { dimensions: 384, description: 'Snowflake Arctic Embed Small (local, 512 tokens, 384-dim)' },
	'Snowflake/snowflake-arctic-embed-m': { dimensions: 768, description: 'Snowflake Arctic Embed Medium (local, 512 tokens, 768-dim)' },
	'TaylorAI/gte-tiny': { dimensions: 384, description: 'GTE-tiny (local, 512 tokens, 384-dim)' },
	'Mihaiii/Ivysaur': { dimensions: 384, description: 'Ivysaur (local, 512 tokens, 384-dim)' },
	'andersonbcdefg/bge-small-4096': { dimensions: 384, description: 'BGE-small-4K (local, 4096 tokens, 384-dim)' },
	'nomic-ai/nomic-embed-text-v1.5': { dimensions: 768, description: 'Nomic-embed-text-v1.5 (local, 2048 tokens, 768-dim)' },
	'nomic-ai/nomic-embed-text-v1': { dimensions: 768, description: 'Nomic-embed-text (local, 2048 tokens, 768-dim)' }
} as const satisfies Record<string, EmbeddingModelInfo>

// Ollama
// The local server exposes its model list at /api/tags (no API key needed).
// An empty base URL keeps the picker in free-text mode - chat requests
// require an explicit address anyway (see LLMBaseUrlNotSetException).
let ollamaModelsCache: { url: string; models: Record<string, ModelInfo> } | null = null;
async function fetchOllamaModels(baseUrl?: string): Promise<Record<string, ModelInfo>> {
	const url = (baseUrl ?? '').trim().replace(/\/+$/, '');
	if (!url) {
		return {};
	}
	if (ollamaModelsCache && ollamaModelsCache.url === url) {
		return ollamaModelsCache.models;
	}

	// getOllamaModels() swallows request errors and resolves to []
	const names = await getOllamaModels(url);
	const models: Record<string, ModelInfo> = {};
	for (const name of names) {
		models[name] = {
			supportsPromptCache: false,
		};
	}
	if (names.length > 0) {
		// only cache successful responses so a stopped server is retried later
		ollamaModelsCache = { url, models };
	}
	return models;
}

// Ollama embedding models: modern servers report `capabilities` in
// /api/tags, so the embedding pickers can list embedding-capable models
// (older servers fall back to the full list - see getOllamaEmbeddingModels).
let ollamaEmbeddingModelsCache: { url: string; ids: string[] } | null = null;
async function fetchOllamaEmbeddingModelIds(baseUrl?: string): Promise<string[]> {
	const url = (baseUrl ?? '').trim().replace(/\/+$/, '');
	if (!url) {
		return [];
	}
	if (ollamaEmbeddingModelsCache && ollamaEmbeddingModelsCache.url === url) {
		return ollamaEmbeddingModelsCache.ids;
	}
	const ids = await getOllamaEmbeddingModels(url);
	if (ids.length > 0) {
		// only cache successful responses so a stopped server is retried later
		ollamaEmbeddingModelsCache = { url, ids };
	}
	return ids;
}

/// helper functions
// get all providers, used for the provider dropdown
export const GetAllProviders = (): ApiProvider[] => {
	return [
		ApiProvider.Ollama,
		ApiProvider.Deepseek,
		ApiProvider.SiliconFlow,
		ApiProvider.AlibabaQwen,
		ApiProvider.Moonshot,
		ApiProvider.LocalProvider,
	]
}

export const GetEmbeddingProviders = (): ApiProvider[] => {
	return [
		ApiProvider.AlibabaQwen,
		ApiProvider.SiliconFlow,
		ApiProvider.Ollama,
		ApiProvider.LocalProvider,
	]
}

// Get all models for a provider
export const GetProviderModels = async (provider: ApiProvider, settings?: InfioSettings): Promise<Record<string, ModelInfo>> => {
	switch (provider) {
		case ApiProvider.AlibabaQwen:
			return qwenModels
		case ApiProvider.SiliconFlow:
			return siliconFlowModels
		case ApiProvider.Deepseek:
			return deepSeekModels
		case ApiProvider.Moonshot:
			return moonshotModels
		case ApiProvider.Ollama:
			return await fetchOllamaModels(settings?.ollamaProvider.baseUrl)
		case ApiProvider.LocalProvider:
			return {} 
		default:
			return {}
	}
}

// Get all models for a provider with settings (needed for providers that require API keys)
export const GetProviderModelsWithSettings = async (provider: ApiProvider, settings?: InfioSettings): Promise<Record<string, ModelInfo>> => {
	switch (provider) {
		case ApiProvider.AlibabaQwen:
			return qwenModels
		case ApiProvider.SiliconFlow:
			return siliconFlowModels
		case ApiProvider.Deepseek:
			return deepSeekModels
		case ApiProvider.Moonshot:
			return moonshotModels
		case ApiProvider.Ollama:
			return await fetchOllamaModels(settings?.ollamaProvider.baseUrl)
		case ApiProvider.LocalProvider:
			return {} // LocalProvider only supports embedding models
		default:
			return {}
	}
}

// Get all model ids for a provider
export const GetProviderModelIds = async (provider: ApiProvider, settings?: InfioSettings): Promise<string[]> => {
	const models = await GetProviderModels(provider, settings)
	return Object.keys(models)
}

/// Embedding models

// Get all embedding models for a provider
export const GetEmbeddingProviderModels = (provider: ApiProvider): Record<string, EmbeddingModelInfo> => {
	switch (provider) {
		case ApiProvider.SiliconFlow:
			return siliconFlowEmbeddingModels
		case ApiProvider.AlibabaQwen:
			return qwenEmbeddingModels;
		case ApiProvider.LocalProvider:
			return localProviderEmbeddingModels;
		default:
			return {}
	}
}
// Get all embedding model ids for a provider
export const GetEmbeddingProviderModelIds = (provider: ApiProvider): string[] => {
	return Object.keys(GetEmbeddingProviderModels(provider))
}

// Embedding model ids including server-side catalogs: Ollama's list lives
// on the user's machine, so it is fetched like the chat pickers do; other
// providers keep their static maps.
export const GetEmbeddingProviderModelIdsAsync = async (
	provider: ApiProvider,
	settings?: InfioSettings
): Promise<string[]> => {
	if (provider === ApiProvider.Ollama) {
		return await fetchOllamaEmbeddingModelIds(settings?.ollamaProvider.baseUrl)
	}
	return GetEmbeddingProviderModelIds(provider)
}
// Get embedding model info for a provider and model id
export const GetEmbeddingModelInfo = (provider: ApiProvider, modelId: string): EmbeddingModelInfo | undefined => {
	const models = GetEmbeddingProviderModels(provider)
	return models[modelId]
}

// Get default model id for a provider
export const GetDefaultModelId = (provider: ApiProvider): { chat: string, insight: string, autoComplete: string, embedding: string } => {
	switch (provider) {
		case ApiProvider.Deepseek:
			return {
				"chat": deepSeekDefaultModelId,
				"insight": deepSeekDefaultInsightModelId,
				"autoComplete": deepSeekDefaultAutoCompleteModelId,
				"embedding": deepSeekDefaultEmbeddingModelId,
			}
		case ApiProvider.AlibabaQwen:
			return {
				"chat": qwenDefaultModelId,
				"insight": qwenDefaultInsightModelId,
				"autoComplete": qwenDefaultAutoCompleteModelId,
				"embedding": qwenDefaultEmbeddingModelId,
			}
		case ApiProvider.SiliconFlow:
			return {
				"chat": siliconFlowDefaultModelId,
				"insight": siliconFlowDefaultInsightModelId,
				"autoComplete": siliconFlowDefaultAutoCompleteModelId,
				"embedding": siliconFlowDefaultEmbeddingModelId,
			}
		case ApiProvider.Moonshot:
			return {
				"chat": moonshotDefaultModelId,
				"insight": moonshotDefaultInsightModelId,
				"autoComplete": moonshotDefaultAutoCompleteModelId,
				"embedding": moonshotDefaultEmbeddingModelId,
			}
		case ApiProvider.Ollama:
			return {
				"chat": null, // user-configured
				"insight": null, // user-configured
				"autoComplete": null, // user-configured
				"embedding": null, // not supported
			}
		case ApiProvider.LocalProvider:
			return {
				"chat": localProviderDefaultModelId,
				"insight": localProviderDefaultInsightModelId,
				"autoComplete": localProviderDefaultAutoCompleteModelId,
				"embedding": localProviderDefaultEmbeddingModelId,
			}
		default:
			return {
				"chat": null,
				"insight": null,
				"autoComplete": null,
				"embedding": null,
			}
	}
}

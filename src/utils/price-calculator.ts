import { LLMModel } from '../types/llm/model'
import { ResponseUsage } from '../types/llm/response'
import { InfioSettings } from '../types/settings'

import { GetProviderModels } from './api'

// Returns the cost in dollars. Returns null if the model is not supported.
export const calculateLLMCost = async ({
	model,
	usage,
	settings,
}: {
	model: LLMModel
	usage: ResponseUsage
	settings?: InfioSettings
}): Promise<number | null> => {
	const providerModels = await GetProviderModels(model.provider, settings)
	if (!providerModels) {
		return null
	}
	const modelInfo = providerModels[model.modelId]
	if (!modelInfo) {
		return null
	}
	if (modelInfo.inputPrice === undefined || modelInfo.outputPrice === undefined) {
		return null
	}
	const cost = modelInfo.inputPrice * usage.prompt_tokens + modelInfo.outputPrice * usage.completion_tokens
	return cost
}

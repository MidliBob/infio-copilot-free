import { ALIBABA_QWEN_BASE_URL, DEEPSEEK_BASE_URL, MOONSHOT_BASE_URL, SILICONFLOW_BASE_URL } from '../../constants'
import { ApiProvider, LLMModel } from '../../types/llm/model'
import {
	LLMOptions,
	LLMRequestNonStreaming,
	LLMRequestStreaming,
} from '../../types/llm/request'
import {
	LLMResponseNonStreaming,
	LLMResponseStreaming,
} from '../../types/llm/response'
import { InfioSettings } from '../../types/settings'

import { OllamaProvider } from './ollama'
import { OpenAICompatibleProvider } from './openai-compatible'


export type LLMManagerInterface = {
	generateResponse(
		model: LLMModel,
		request: LLMRequestNonStreaming,
		options?: LLMOptions,
	): Promise<LLMResponseNonStreaming>
	streamResponse(
		model: LLMModel,
		request: LLMRequestStreaming,
		options?: LLMOptions,
	): Promise<AsyncIterable<LLMResponseStreaming>>
}

class LLMManager implements LLMManagerInterface {
	private deepseekProvider: OpenAICompatibleProvider
	private moonshotProvider: OpenAICompatibleProvider
	private siliconflowProvider: OpenAICompatibleProvider
	private alibabaQwenProvider: OpenAICompatibleProvider
	private ollamaProvider: OllamaProvider

	constructor(settings: InfioSettings) {
		this.siliconflowProvider = new OpenAICompatibleProvider(
			settings.siliconflowProvider.apiKey,
			settings.siliconflowProvider.baseUrl && settings.siliconflowProvider.useCustomUrl ?
				settings.siliconflowProvider.baseUrl
				: SILICONFLOW_BASE_URL
		)
		this.alibabaQwenProvider = new OpenAICompatibleProvider(
			settings.alibabaQwenProvider.apiKey,
			settings.alibabaQwenProvider.baseUrl && settings.alibabaQwenProvider.useCustomUrl ?
				settings.alibabaQwenProvider.baseUrl
				: ALIBABA_QWEN_BASE_URL
		)
		this.deepseekProvider = new OpenAICompatibleProvider(
			settings.deepseekProvider.apiKey,
			settings.deepseekProvider.baseUrl && settings.deepseekProvider.useCustomUrl ?
				settings.deepseekProvider.baseUrl
				: DEEPSEEK_BASE_URL
		)
		this.moonshotProvider = new OpenAICompatibleProvider(
			settings.moonshotProvider.apiKey,
			settings.moonshotProvider.baseUrl && settings.moonshotProvider.useCustomUrl ?
				settings.moonshotProvider.baseUrl
				: MOONSHOT_BASE_URL
		)
		this.ollamaProvider = new OllamaProvider(settings.ollamaProvider.baseUrl)
	}

	async generateResponse(
		model: LLMModel,
		request: LLMRequestNonStreaming,
		options?: LLMOptions,
	): Promise<LLMResponseNonStreaming> {
		switch (model.provider) {
			case ApiProvider.SiliconFlow:
				return await this.siliconflowProvider.generateResponse(
					model,
					request,
					options,
				)
			case ApiProvider.AlibabaQwen:
				return await this.alibabaQwenProvider.generateResponse(
					model,
					request,
					options,
				)
			case ApiProvider.Deepseek:
				return await this.deepseekProvider.generateResponse(
					model,
					request,
					options,
				)
			case ApiProvider.Ollama:
				return await this.ollamaProvider.generateResponse(
					model,
					request,
					options,
				)
			case ApiProvider.Moonshot:
				return await this.moonshotProvider.generateResponse(
					model,
					request,
					options,
				)
			default:
				throw new Error(`Unsupported model provider: ${model.provider}`)
		}
	}

	async streamResponse(
		model: LLMModel,
		request: LLMRequestStreaming,
		options?: LLMOptions,
	): Promise<AsyncIterable<LLMResponseStreaming>> {
		switch (model.provider) {
			case ApiProvider.SiliconFlow:
				return await this.siliconflowProvider.streamResponse(model, request, options)
			case ApiProvider.AlibabaQwen:
				return await this.alibabaQwenProvider.streamResponse(model, request, options)
			case ApiProvider.Deepseek:
				return await this.deepseekProvider.streamResponse(model, request, options)
			case ApiProvider.Moonshot:
				return await this.moonshotProvider.streamResponse(model, request, options)
			case ApiProvider.Ollama:
				return await this.ollamaProvider.streamResponse(model, request, options)
		}
	}
}

export default LLMManager

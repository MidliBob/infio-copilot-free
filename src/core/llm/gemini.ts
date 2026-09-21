import {
	Content,
	GoogleGenAI,
	Part,
	type GenerateContentConfig,
	type GenerateContentParameters,
	type GenerateContentResponse,
} from "@google/genai"

import { LLMModel } from '../../types/llm/model'
import {
	LLMOptions,
	LLMRequestNonStreaming,
	LLMRequestStreaming,
	RequestMessage,
} from '../../types/llm/request'
import {
	LLMResponseNonStreaming,
	LLMResponseStreaming,
} from '../../types/llm/response'
import {
	GeminiModelId,
	ModelInfo,
	geminiDefaultModelId,
	geminiModels
} from "../../utils/api"
import { parseImageDataUrl } from '../../utils/image'

import { BaseLLMProvider } from './base'
import {
	LLMAPIKeyInvalidException,
	LLMAPIKeyNotSetException,
} from './exception'

/**
 * Note on OpenAI Compatibility API:
 * Gemini provides an OpenAI-compatible endpoint (https://ai.google.dev/gemini-api/docs/openai)
 * which allows using the OpenAI SDK with Gemini models. However, there are currently CORS issues
 * preventing its use in Obsidian. Consider switching to this endpoint in the future once these
 * issues are resolved.
 */
export class GeminiProvider implements BaseLLMProvider {
	private client: GoogleGenAI
	private apiKey: string
	private baseUrl: string

	constructor(apiKey: string, baseUrl?: string) {
		this.apiKey = apiKey
		this.baseUrl = baseUrl
		this.client = new GoogleGenAI({ apiKey })
	}

	getModel(modelId: string) {
		let id = modelId
		let info: ModelInfo = geminiModels[id as GeminiModelId]

		if (id?.endsWith(":thinking")) {
			id = id.slice(0, -":thinking".length)

			if (geminiModels[id as GeminiModelId]) {
				info = geminiModels[id as GeminiModelId]

				return {
					id,
					info,
					thinkingConfig: undefined,
					maxOutputTokens: info.maxTokens ?? undefined,
				}
			}
		}

		if (!info) {
			id = geminiDefaultModelId
			info = geminiModels[geminiDefaultModelId]
		}

		return { id, info }
	}

	async generateResponse(
		model: LLMModel,
		request: LLMRequestNonStreaming,
		options?: LLMOptions,
	): Promise<LLMResponseNonStreaming> {
		if (!this.apiKey) {
			throw new LLMAPIKeyNotSetException(
				`Gemini API key is missing. Please set it in settings menu.`,
			)
		}

		const { id: modelName, thinkingConfig, maxOutputTokens } = this.getModel(model.modelId)

		const systemMessages = request.messages.filter((m) => m.role === 'system')
		const systemInstruction: string | undefined =
			systemMessages.length > 0
				? systemMessages.map((m) => m.content).join('\n')
				: undefined

		try {

			const config: GenerateContentConfig = {
				systemInstruction,
				httpOptions: this.baseUrl ? { baseUrl: this.baseUrl } : undefined,
				thinkingConfig,
				maxOutputTokens: maxOutputTokens ?? request.max_tokens,
				temperature: request.temperature ?? 0,
				topP: request.top_p ?? 1,
				presencePenalty: request.presence_penalty ?? 0,
				frequencyPenalty: request.frequency_penalty ?? 0,
			}
			const params: GenerateContentParameters = {
				model: modelName,
				contents: request.messages
					.map((message) => GeminiProvider.parseRequestMessage(message))
					.filter((m): m is Content => m !== null),
				config,
			}

			const result = await this.client.models.generateContent(params)
			const messageId = crypto.randomUUID() // Gemini does not return a message id
			return GeminiProvider.parseNonStreamingResponse(
				result,
				request.model,
				messageId,
			)
		} catch (error) {
			const isInvalidApiKey =
				error.message?.includes('API_KEY_INVALID') ||
				error.message?.includes('API key not valid')

			if (isInvalidApiKey) {
				throw new LLMAPIKeyInvalidException(
					`Gemini API key is invalid. Please update it in settings menu.`,
				)
			}

			throw error
		}
	}

	async streamResponse(
		model: LLMModel,
		request: LLMRequestStreaming,
		options?: LLMOptions,
	): Promise<AsyncIterable<LLMResponseStreaming>> {
		if (!this.apiKey) {
			throw new LLMAPIKeyNotSetException(
				`Gemini API key is missing. Please set it in settings menu.`,
			)
		}
		const { id: modelName, thinkingConfig, maxOutputTokens } = this.getModel(model.modelId)

		const systemMessages = request.messages.filter((m) => m.role === 'system')
		const systemInstruction: string | undefined =
			systemMessages.length > 0
				? systemMessages.map((m) => m.content).join('\n')
				: undefined

		try {
			const config: GenerateContentConfig = {
				systemInstruction,
				httpOptions: this.baseUrl ? { baseUrl: this.baseUrl } : undefined,
				thinkingConfig,
				maxOutputTokens: maxOutputTokens ?? request.max_tokens,
				temperature: request.temperature ?? 0,
				topP: request.top_p ?? 1,
				presencePenalty: request.presence_penalty ?? 0,
				frequencyPenalty: request.frequency_penalty ?? 0,
			}
			const params: GenerateContentParameters = {
				model: modelName,
				contents: request.messages
					.map((message) => GeminiProvider.parseRequestMessage(message))
					.filter((m): m is Content => m !== null),
				config,
			}

			const stream = await this.client.models.generateContentStream(params)
			const messageId = crypto.randomUUID() // Gemini does not return a message id
			return this.streamResponseGenerator(stream, request.model, messageId)
		} catch (error) {
			const isInvalidApiKey =
				error.message?.includes('API_KEY_INVALID') ||
				error.message?.includes('API key not valid')

			if (isInvalidApiKey) {
				throw new LLMAPIKeyInvalidException(
					`Gemini API key is invalid. Please update it in settings menu.`,
				)
			}

			throw error
		}
	}

	private async *streamResponseGenerator(
		stream: AsyncGenerator<GenerateContentResponse>,
		model: string,
		messageId: string,
	): AsyncIterable<LLMResponseStreaming> {
		for await (const chunk of stream) {
			yield GeminiProvider.parseStreamingResponseChunk(chunk, model, messageId)
		}
	}

	static parseRequestMessage(message: RequestMessage): Content | null {
		if (message.role === 'system') {
			return null
		}

		if (Array.isArray(message.content)) {
			return {
				role: message.role === 'user' ? 'user' : 'model',
				parts: message.content.map((part) => {
					switch (part.type) {
						case 'text':
							return { text: part.text }
						case 'image_url': {
							const { mimeType, base64Data } = parseImageDataUrl(
								part.image_url.url,
							)
							GeminiProvider.validateImageType(mimeType)

							return {
								inlineData: {
									data: base64Data,
									mimeType,
								},
							}
						}
					}
				}) as Part[],
			}
		}

		return {
			role: message.role === 'user' ? 'user' : 'model',
			parts: [
				{
					text: message.content,
				},
			],
		}
	}

	static parseNonStreamingResponse(
		response: GenerateContentResponse,
		model: string,
		messageId: string,
	): LLMResponseNonStreaming {
		return {
			id: messageId,
			choices: [
				{
					finish_reason:
						response.candidates?.[0]?.finishReason ?? null,
					message: {
						content: response.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
						role: 'assistant',
					},
				},
			],
			created: Date.now(),
			model: model,
			object: 'chat.completion',
			usage: response.usageMetadata
				? {
					prompt_tokens: response.usageMetadata.promptTokenCount,
					completion_tokens:
						response.usageMetadata.candidatesTokenCount,
					total_tokens: response.usageMetadata.totalTokenCount,
				}
				: undefined,
		}
	}

	static parseStreamingResponseChunk(
		chunk: GenerateContentResponse,
		model: string,
		messageId: string,
	): LLMResponseStreaming {
		const firstCandidate = chunk.candidates?.[0]
		const textContent = firstCandidate?.content?.parts?.[0]?.text || ''
		
		return {
			id: messageId,
			choices: [
				{
					finish_reason: firstCandidate?.finishReason ?? null,
					delta: {
						content: textContent,
					},
				},
			],
			created: Date.now(),
			model: model,
			object: 'chat.completion.chunk',
			usage: chunk.usageMetadata
				? {
					prompt_tokens: chunk.usageMetadata.promptTokenCount,
					completion_tokens: chunk.usageMetadata.candidatesTokenCount,
					total_tokens: chunk.usageMetadata.totalTokenCount,
				}
				: undefined,
		}
	}

	private static validateImageType(mimeType: string) {
		const SUPPORTED_IMAGE_TYPES = [
			'image/png',
			'image/jpeg',
			'image/webp',
			'image/heic',
			'image/heif',
		]
		if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
			throw new Error(
				`Gemini does not support image type ${mimeType}. Supported types: ${SUPPORTED_IMAGE_TYPES.join(
					', ',
				)}`,
			)
		}
	}
}

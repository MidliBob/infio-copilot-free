// @ts-nocheck
/**
 * This provider is nearly identical to OpenAICompatibleProvider, but uses a custom OpenAI client
 * (NoStainlessOpenAI) to work around CORS issues specific to Ollama.
 */

import OpenAI from 'openai'
import { FinalRequestOptions } from 'openai/core'

import { LLMModel } from '../../types/llm/model'
import {
	LLMOptions,
	LLMRequestNonStreaming,
	LLMRequestStreaming,
} from '../../types/llm/request'
import {
	LLMResponseNonStreaming,
	LLMResponseStreaming,
} from '../../types/llm/response'

import { BaseLLMProvider } from './base'
import { LLMBaseUrlNotSetException } from './exception'
import { OpenAIMessageAdapter } from './openai-message-adapter'

export class NoStainlessOpenAI extends OpenAI {
	defaultHeaders() {
		// 获取父类的默认头部，包含 Authorization
		const parentHeaders = super.defaultHeaders()
		return {
			...parentHeaders,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		}
	}

	buildRequest<Req>(
		options: FinalRequestOptions<Req>,
		{ retryCount = 0 }: { retryCount?: number } = {},
	): { req: RequestInit; url: string; timeout: number } {
		const req = super.buildRequest(options, { retryCount })
		const headers: Record<string, string> = req.req.headers
		Object.keys(headers).forEach((k) => {
			if (k.startsWith('x-stainless')) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- key is computed at runtime
				delete headers[k]
			}
		})
		return req
	}
}

export class OllamaProvider implements BaseLLMProvider {
	private adapter: OpenAIMessageAdapter
	private baseUrl: string

	constructor(baseUrl: string) {
		this.adapter = new OpenAIMessageAdapter()
		this.baseUrl = baseUrl
	}

	async generateResponse(
		model: LLMModel,
		request: LLMRequestNonStreaming,
		options?: LLMOptions,
	): Promise<LLMResponseNonStreaming> {
		if (!this.baseUrl) {
			throw new LLMBaseUrlNotSetException(
				'Ollama base URL is missing. Please set it in settings menu.',
			)
		}

		const client = new NoStainlessOpenAI({
			baseURL: `${this.baseUrl}/v1`,
			apiKey: 'ollama',
			dangerouslyAllowBrowser: true,
		})
		return this.adapter.generateResponse(client, request, options)
	}

	async streamResponse(
		model: LLMModel,
		request: LLMRequestStreaming,
		options?: LLMOptions,
	): Promise<AsyncIterable<LLMResponseStreaming>> {
		if (!this.baseUrl) {
			throw new LLMBaseUrlNotSetException(
				'Ollama base URL is missing. Please set it in settings menu.',
			)
		}

		const client = new NoStainlessOpenAI({
			baseURL: `${this.baseUrl}/v1`,
			apiKey: 'ollama',
			dangerouslyAllowBrowser: true,
		})
		return this.adapter.streamResponse(client, request, options)
	}
}

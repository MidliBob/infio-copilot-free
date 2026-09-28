// 导入完整的嵌入 Worker
// @ts-nocheck
import { requestUrl } from 'obsidian'

import { logger } from '../utils/logger'
import EmbedWorker from './embed.worker';
import {
	FetchRequestMessage,
	isFetchRequestMessage,
	performFetchProxyRequest,
} from './fetch-proxy-protocol';

// 类型定义
export interface EmbedResult {
	vec: number[];
	tokens: number;
	embed_input?: string;
}

export interface ModelLoadResult {
	model_loaded: boolean;
	/** Actual backend the worker settled on (e.g. webgpu-fp16, wasm-q8). */
	backend?: string;
}

export interface ModelUnloadResult {
	model_unloaded: boolean;
}

export interface TokenCountResult {
	tokens: number;
}

// Worker 消息类型定义
interface WorkerMessage {
	id: number;
	result?: unknown;
	error?: string;
}

interface WorkerRequest {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
}

export class EmbeddingManager {
	private worker: Worker;
	private requests = new Map<number, WorkerRequest>();
	private nextRequestId = 0;
	private isModelLoaded = false;
	private currentModelId: string | null = null;
	// The GPU flag the current session was loaded with. The worker bakes the
	// device into the ONNX session at load time, so a flipped toggle must
	// trigger unload+load - comparing only the model id (as before) made the
	// setting apply exclusively at plugin start.
	private currentUseGpu: boolean | null = null;
	// In-flight load, so concurrent callers coalesce into one worker round
	// trip instead of racing several load/unload sequences.
	private loadInFlight: Promise<ModelLoadResult> | null = null;

	constructor() {
		// 创建 Worker，使用与 pgworker 相同的模式
		this.worker = new EmbedWorker();

		// 统一监听来自 Worker 的所有消息
		this.worker.onmessage = (event) => {
			// Fetch-proxy requests from the worker are served here, on the
			// main thread, through requestUrl (native HTTP, CORS-free).
			if (isFetchRequestMessage(event.data)) {
				void this.handleFetchProxy(event.data)
				return
			}
			try {
				const { id, result, error } = event.data as WorkerMessage;

				// 根据返回的 id 找到对应的 Promise 回调
				const request = this.requests.get(id);

				if (request) {
					if (error) {
						request.reject(new Error(error));
					} else {
						request.resolve(result);
					}
					// 完成后从 Map 中删除
					this.requests.delete(id);
				}
			} catch (err) {
				logger.error("Error processing worker message:", err);
				// 拒绝所有待处理的请求
				this.requests.forEach(request => {
					request.reject(new Error(`Worker message processing error: ${(err as Error).message}`));
				});
				this.requests.clear();
			}
		};

		this.worker.onerror = (error) => {
			logger.error("EmbeddingWorker error:", error);
			// 拒绝所有待处理的请求
			this.requests.forEach(request => {
				request.reject(new Error(`Worker error: ${error.message || 'Unknown worker error'}`));
			});
			this.requests.clear();

			// 重置状态
			this.isModelLoaded = false;
			this.currentModelId = null;
			this.currentUseGpu = null;
		};
	}

	private postRequest<T>(method: string, params: unknown): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const id = this.nextRequestId++;
			this.requests.set(id, { resolve, reject });
			this.worker.postMessage({ method, params, id });
		});
	}

	public loadModel(modelId: string, useGpu: boolean = false): Promise<ModelLoadResult> {
		// Idempotent fast path: the very same model AND backend (GPU flag) is
		// already live - nothing to do. embedding.ts calls loadModel before
		// every batch, so this path must stay cheap and silent.
		if (this.isModelLoaded && this.currentModelId === modelId && this.currentUseGpu === useGpu) {
			return Promise.resolve({ model_loaded: true });
		}

		// Another load is in flight (possibly for a different configuration):
		// wait for it to settle, then re-evaluate against the fresh state.
		if (this.loadInFlight !== null) {
			const inFlight = this.loadInFlight;
			return inFlight.then(
				() => this.loadModel(modelId, useGpu),
				() => this.loadModel(modelId, useGpu),
			);
		}

		const loadPromise = this.performLoadModel(modelId, useGpu).finally(() => {
			if (this.loadInFlight === loadPromise) {
				this.loadInFlight = null;
			}
		});
		this.loadInFlight = loadPromise;
		return loadPromise;
	}

	private async performLoadModel(modelId: string, useGpu: boolean): Promise<ModelLoadResult> {
		logger.debug(`Loading embedding model: ${modelId}, GPU: ${useGpu}`);

		try {
			// A different model or a different backend (GPU toggle) is
			// loaded: unload first, then load the requested configuration.
			if (this.isModelLoaded && (this.currentModelId !== modelId || this.currentUseGpu !== useGpu)) {
				logger.debug(`Unloading previous model: ${this.currentModelId} (GPU: ${this.currentUseGpu})`);
				await this.unloadModel();
			}

			const result = await this.postRequest<ModelLoadResult>('load', {
				model_key: modelId,
				use_gpu: useGpu
			});

			this.isModelLoaded = result.model_loaded;
			this.currentModelId = result.model_loaded ? modelId : null;
			this.currentUseGpu = result.model_loaded ? useGpu : null;

			if (result.model_loaded) {
				logger.debug(`Model ${modelId} loaded successfully (GPU: ${useGpu}, backend: ${result.backend ?? 'unknown'})`);
			}

			return result;
		} catch (error) {
			logger.error(`Failed to load model ${modelId}:`, error);
			this.isModelLoaded = false;
			this.currentModelId = null;
			this.currentUseGpu = null;
			throw error;
		}
	}

	/**
	 * 为一批文本生成嵌入向量。
	 * @param texts 要处理的文本数组
	 * @returns 返回一个包含向量和 token 信息的对象数组
	 */
	public async embedBatch(texts: string[]): Promise<EmbedResult[]> {
		if (!this.isModelLoaded) {
			throw new Error('Model not loaded. Please call loadModel() first.');
		}

		if (!texts || texts.length === 0) {
			return [];
		}

		logger.debug(`Generating embeddings for ${texts.length} texts`);

		try {
			const inputs = texts.map(text => ({ embed_input: text }));
			const results = await this.postRequest<EmbedResult[]>('embed_batch', { inputs });

			logger.debug(`Generated ${results.length} embeddings`);
			return results;
		} catch (error) {
			logger.error('Failed to generate embeddings:', error);
			throw error;
		}
	}

	/**
	 * 为单个文本生成嵌入向量。
	 * @param text 要处理的文本
	 * @returns 返回包含向量和 token 信息的对象
	 */
	public async embed(text: string): Promise<EmbedResult> {
		if (!text || text.trim().length === 0) {
			throw new Error('Text cannot be empty');
		}

		const results = await this.embedBatch([text]);
		if (results.length === 0) {
			throw new Error('Failed to generate embedding');
		}

		return results[0];
	}

	/**
	 * 计算文本的 token 数量。
	 * @param text 要计算的文本
	 */
	public async countTokens(text: string): Promise<TokenCountResult> {
		if (!this.isModelLoaded) {
			throw new Error('Model not loaded. Please call loadModel() first.');
		}

		if (!text) {
			return { tokens: 0 };
		}

		try {
			return await this.postRequest<TokenCountResult>('count_tokens', text);
		} catch (error) {
			logger.error('Failed to count tokens:', error);
			throw error;
		}
	}

	/**
	 * 卸载模型，释放内存。
	 */
	public async unloadModel(): Promise<ModelUnloadResult> {
		if (!this.isModelLoaded) {
			logger.debug('No model to unload');
			return { model_unloaded: true };
		}

		try {
			logger.debug(`Unloading model: ${this.currentModelId}`);
			const result = await this.postRequest<ModelUnloadResult>('unload', {});

			this.isModelLoaded = false;
			this.currentModelId = null;
			this.currentUseGpu = null;

			logger.debug('Model unloaded successfully');
			return result;
		} catch (error) {
			logger.error('Failed to unload model:', error);
			// 即使卸载失败，也重置状态
			this.isModelLoaded = false;
			this.currentModelId = null;
			this.currentUseGpu = null;
			throw error;
		}
	}

	/**
	 * 检查模型是否已加载。
	 */
	public get modelLoaded(): boolean {
		return this.isModelLoaded;
	}

	/**
	 * 获取当前加载的模型ID。
	 */
	public get currentModel(): string | null {
		return this.currentModelId;
	}

	/**
	 * 获取支持的模型列表。
	 */
	public getSupportedModels(): string[] {
		return [
			'TaylorAI/bge-micro-v2',
			'Xenova/all-MiniLM-L6-v2',
			'Xenova/bge-small-en-v1.5',
			'Xenova/bge-base-en-v1.5',
			'Xenova/jina-embeddings-v2-base-zh',
			'Xenova/jina-embeddings-v2-small-en',
			'Xenova/multilingual-e5-small',
			'Xenova/multilingual-e5-base',
			'Xenova/gte-small',
			'Xenova/e5-small-v2',
			'Xenova/e5-base-v2'
		];
	}

	/**
	 * 获取模型信息。
	 */
	public getModelInfo(modelId: string): { dims: number; maxTokens: number; description: string } | null {
		const modelInfoMap: Record<string, { dims: number; maxTokens: number; description: string }> = {
			'Xenova/all-MiniLM-L6-v2': { dims: 384, maxTokens: 512, description: 'All-MiniLM-L6-v2 (推荐，轻量级)' },
			'Xenova/bge-small-en-v1.5': { dims: 384, maxTokens: 512, description: 'BGE-small-en-v1.5' },
			'Xenova/bge-base-en-v1.5': { dims: 768, maxTokens: 512, description: 'BGE-base-en-v1.5 (更高质量)' },
			'Xenova/jina-embeddings-v2-base-zh': { dims: 768, maxTokens: 8192, description: 'Jina-v2-base-zh (中英双语)' },
			'Xenova/jina-embeddings-v2-small-en': { dims: 512, maxTokens: 8192, description: 'Jina-v2-small-en' },
			'Xenova/multilingual-e5-small': { dims: 384, maxTokens: 512, description: 'E5-small (多语言)' },
			'Xenova/multilingual-e5-base': { dims: 768, maxTokens: 512, description: 'E5-base (多语言，更高质量)' },
			'Xenova/gte-small': { dims: 384, maxTokens: 512, description: 'GTE-small' },
			'Xenova/e5-small-v2': { dims: 384, maxTokens: 512, description: 'E5-small-v2' },
			'Xenova/e5-base-v2': { dims: 768, maxTokens: 512, description: 'E5-base-v2 (更高质量)' }
		};

		return modelInfoMap[modelId] || null;
	}

	/**
	 * 终止 Worker，释放资源。
	 */
	public terminate() {
		this.worker.terminate();
		this.requests.clear();
		this.isModelLoaded = false;
		this.currentModelId = null;
		this.currentUseGpu = null;
	}

	/**
	 * Serve one worker fetch-request via requestUrl and post the bytes back
	 * (ArrayBuffer transferred, not copied).
	 */
	private async handleFetchProxy(msg: FetchRequestMessage): Promise<void> {
		const response = await performFetchProxyRequest(msg, async (url, timeoutMs) => {
			const http = await requestUrl({
				url,
				responseType: 'arraybuffer',
				timeout: timeoutMs,
			})
			// Forward the headers transformers.js and the WASM streaming
			// compiler rely on: Content-Type (application/wasm, application/json)
			// and Content-Length (download progress). The body is already
			// decoded by requestUrl, so only these two are safe to replay.
			const headers: Record<string, string> = {}
			const contentLength = http.headers['content-length']
			if (typeof contentLength === 'string') {
				headers['Content-Length'] = contentLength
			}
			const contentType = http.headers['content-type']
			if (typeof contentType === 'string') {
				headers['Content-Type'] = contentType
			}
			return { status: http.status, headers, body: http.arrayBuffer }
		})
		if (response.body !== undefined) {
			this.worker.postMessage(response, [response.body])
		} else {
			this.worker.postMessage(response)
		}
	}
}

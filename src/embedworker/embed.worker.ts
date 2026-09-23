console.log('Embedding worker loaded');

// --- Electron `process` shim neutralization -----------------------------
// Obsidian desktop runs inside Electron, which exposes a `process` shim
// (including `versions.node`) even inside blob workers. The wasm loader
// module that onnxruntime-web fetches from the CDN at RUNTIME
// (ort-wasm-simd-threaded.jsep.mjs) never passes through our esbuild
// `process` define, and its Node detection
//   typeof globalThis.process?.versions?.node == 'string'
// is fooled by that shim: it then executes `await import('worker_threads')`,
// which cannot resolve in a browser worker and kills the whole wasm backend
// init ("no available backend found ... Failed to resolve module specifier
// 'worker_threads'"). Removing the shim makes every runtime-loaded module
// take its browser code path. Modules inside THIS bundle are unaffected:
// esbuild already replaced their bare `process` references via define.
(function neutralizeElectronProcessShim() {
	const probe: { process?: unknown } = globalThis;
	const shimPresent = probe.process !== undefined;
	if (shimPresent) {
		try {
			Object.defineProperty(globalThis, 'process', {
				value: undefined,
				configurable: true,
				writable: true,
			});
		} catch (error) {
			console.warn('[worker] Failed to neutralize the Electron process shim:', error);
		}
	}
	const after: { process?: unknown } = globalThis;
	console.log(`[worker] Electron process shim: present=${shimPresent} neutralized=${after.process === undefined}`);
})();

interface EmbedInput {
	embed_input: string;
}

interface EmbedResult {
	vec: number[];
	tokens: number;
	embed_input?: string;
	error?: string;
}

// 定义工作器消息的参数类型
interface LoadParams {
	model_key: string;
	use_gpu?: boolean;
}

interface EmbedBatchParams {
	inputs: EmbedInput[];
}

type WorkerParams = LoadParams | EmbedBatchParams | string | undefined;

interface WorkerMessage {
	method: string;
	params: WorkerParams;
	id: number;
	worker_id?: string;
}

interface WorkerResponse {
	id: number;
	result?: unknown;
	error?: string;
	worker_id?: string;
}

// 定义 Transformers.js 相关类型
interface ModelInfo {
	loaded: boolean;
	model_key: string;
	use_gpu: boolean;
}

interface TokenizerResult {
	input_ids: {
		data: number[];
	};
}

// 全局变量
// The v3 module is kept in module-level state with its native types
// (the old globalThis indirection from the v2 era is gone).
let transformersModule: typeof import('@huggingface/transformers') | null = null;
let model: ModelInfo | null = null;
let pipeline: unknown = null;
let tokenizer: unknown = null;
let processing_message = false;
let transformersLoaded = false;

/**
 * 测试一个网络端点是否可访问
 * @param {string} url 要测试的 URL
 * @param {number} timeout 超时时间 (毫秒)
 * @returns {Promise<boolean>} 如果可访问则返回 true，否则返回 false
 */
async function testEndpoint(url: string, timeout = 3000): Promise<boolean> {
	// AbortController 用于在超时后取消 fetch 请求
	const controller = new AbortController();
	const signal = controller.signal;

	const timeoutId = setTimeout(() => {
		console.log(`Request to ${url} timed out.`);
		controller.abort();
	}, timeout);

	try {
		console.log(`Testing endpoint: ${url}`);
		// 我们使用 'HEAD' 方法，因为它只请求头部信息，非常快速，适合做存活检测。
		// 'no-cors' 模式允许我们在浏览器环境中进行跨域请求以进行简单的可达性测试，
		// 即使我们不能读取响应内容，请求成功也意味着网络是通的。
		await fetch(url, { method: 'HEAD', mode: 'no-cors', signal });
		
		// 如果 fetch 成功，清除超时定时器并返回 true
		clearTimeout(timeoutId);
		console.log(`Endpoint ${url} is reachable.`);
		return true;
	} catch (error) {
		// 如果发生网络错误或请求被中止 (超时)，则进入 catch 块
		clearTimeout(timeoutId); // 同样需要清除定时器
		console.warn(`Cannot reach endpoint ${url}:`, error instanceof Error && error.name === 'AbortError' ? 'timeout' : (error as Error).message);
		return false;
	}
}

/**
 * 选择 Hugging Face 端点：默认不可达时切换到备用镜像。
 * 返回 null 表示使用默认端点。
 */
async function pickRemoteHost(): Promise<string | null> {
	const defaultEndpoint = 'https://huggingface.co';
	const fallbackEndpoint = 'https://hf-mirror.com/';

	const isDefaultReachable = await testEndpoint(defaultEndpoint);

	if (!isDefaultReachable) {
		console.log(`Default endpoint is unreachable, switching to the fallback mirror: ${fallbackEndpoint}`);
		return fallbackEndpoint;
	}
	console.log(`Using the default endpoint: ${defaultEndpoint}`);
	return null;
}

// 动态导入 Transformers.js
async function loadTransformers(): Promise<void> {
	if (transformersLoaded) return;

	try {
		console.log('Loading Transformers.js...');

		// Transformers.js v3 (@huggingface/transformers) - maintained successor of
		// the deprecated @xenova/transformers v2, with real WebGPU support
		const transformers = await import('@huggingface/transformers');
		const env = transformers.env;

		// 端点选择：默认 HF 不可达时切换备用镜像（必须在加载模型前设置）
		const fallbackHost = await pickRemoteHost();
		if (fallbackHost) {
			env.remoteHost = fallbackHost;
		}

		// 配置环境以适应浏览器 Worker
		env.allowLocalModels = false;
		env.allowRemoteModels = true;

		// 配置 WASM 后端 - 修复线程配置
		env.backends.onnx.wasm.numThreads = 1; // 在 Worker 中使用单线程，避免竞态条件
		env.backends.onnx.wasm.simd = true;

		env.useBrowserCache = true;

		transformersModule = transformers;
		transformersLoaded = true;
		console.log('Transformers.js loaded successfully');
	} catch (error) {
		console.error('Failed to load Transformers.js:', error);
		throw new Error(`Failed to load Transformers.js: ${error}`);
	}
}

async function loadModel(modelKey: string, useGpu: boolean = false): Promise<{ model_loaded: boolean }> {
	try {
		console.log(`Loading model: ${modelKey}, GPU: ${useGpu}`);

		// 确保 Transformers.js 已加载
		await loadTransformers();

		if (!transformersModule) {
			throw new Error('Transformers.js not loaded');
		}

		const { pipeline: pipelineFactory, AutoTokenizer } = transformersModule;

		// v3: dtype 取代 v2 的 quantized；q8 加载与旧版 quantized:true
		// 相同的 model_quantized.onnx，嵌入向量保持一致。
		// 修复进度回调，添加错误处理
		const progress_callback = (progress: unknown) => {
			try {
				if (progress && typeof progress === 'object') {
					// console.log('Model loading progress:', progress);
				}
			} catch (error) {
				// 忽略进度回调错误，避免中断模型加载
				console.warn('Progress callback error (ignored):', error);
			}
		};

		// Backend pinned to WASM (q8) - the backend v2 effectively used, so
		// embedding vectors stay consistent with existing indexes. WebGPU is
		// NOT attempted: ORT's webgpu EP crashes during session creation in
		// this inline blob worker, and because navigator.gpu exists in
		// Obsidian desktop, v3's 'auto' device would keep selecting webgpu
		// and keep failing the load. device:'wasm' (plus env.device above)
		// makes the choice explicit. Phase 1 revisits WebGPU bundling.
		if (useGpu) {
			console.log('[Transformers] GPU requested; staying on WASM CPU (q8) until phase-1 WebGPU work');
		}
		pipeline = await pipelineFactory('feature-extraction', modelKey, {
			device: 'wasm',
			dtype: 'q8',
			progress_callback,
		});

		// 创建分词器
		tokenizer = await AutoTokenizer.from_pretrained(modelKey);

		model = {
			loaded: true,
			model_key: modelKey,
			use_gpu: useGpu
		};

		console.log(`Model ${modelKey} loaded successfully`);
		return { model_loaded: true };

	} catch (error) {
		console.error('Error loading model:', error);
		throw new Error(`Failed to load model: ${error}`);
	}
}

async function unloadModel(): Promise<{ model_unloaded: boolean }> {
	try {
		console.log('Unloading model...');

		if (pipeline && typeof pipeline === 'object' && 'destroy' in pipeline) {
			const pipelineWithDestroy = pipeline as { destroy: () => void };
			pipelineWithDestroy.destroy();
		}
		pipeline = null;

		tokenizer = null;
		model = null;

		console.log('Model unloaded successfully');
		return { model_unloaded: true };

	} catch (error) {
		console.error('Error unloading model:', error);
		throw new Error(`Failed to unload model: ${error}`);
	}
}

async function countTokens(input: string): Promise<{ tokens: number }> {
	try {
		if (!tokenizer) {
			throw new Error('Tokenizer not loaded');
		}

		const tokenizerWithCall = tokenizer as (input: string) => Promise<TokenizerResult>;
		const { input_ids } = await tokenizerWithCall(input);
		return { tokens: input_ids.data.length };

	} catch (error) {
		console.error('Error counting tokens:', error);
		throw new Error(`Failed to count tokens: ${error}`);
	}
}

async function embedBatch(inputs: EmbedInput[]): Promise<EmbedResult[]> {
	try {
		if (!pipeline || !tokenizer) {
			throw new Error('Model not loaded');
		}

		console.log(`Processing ${inputs.length} inputs`);

		// 过滤空输入
		const filteredInputs = inputs.filter(item => item.embed_input && item.embed_input.length > 0);

		if (filteredInputs.length === 0) {
			return [];
		}

		// 批处理大小（可以根据需要调整）
		const batchSize = 1;

		if (filteredInputs.length > batchSize) {
			console.log(`Processing ${filteredInputs.length} inputs in batches of ${batchSize}`);
			const results: EmbedResult[] = [];

			for (let i = 0; i < filteredInputs.length; i += batchSize) {
				const batch = filteredInputs.slice(i, i + batchSize);
				const batchResults = await processBatch(batch);
				results.push(...batchResults);
			}

			return results;
		}

		return await processBatch(filteredInputs);

	} catch (error) {
		console.error('Error in embed batch:', error);
		throw new Error(`Failed to generate embeddings: ${error}`);
	}
}

async function processBatch(batchInputs: EmbedInput[]): Promise<EmbedResult[]> {
	try {
		// 计算每个输入的 token 数量
		const tokens = await Promise.all(
			batchInputs.map(item => countTokens(item.embed_input))
		);

		// 准备嵌入输入（处理超长文本）
		const maxTokens = 512; // 大多数模型的最大 token 限制
		const embedInputs = await Promise.all(
			batchInputs.map(async (item, i) => {
				if (tokens[i].tokens < maxTokens) {
					return item.embed_input;
				}

				// 截断超长文本
				let tokenCt = tokens[i].tokens;
				let truncatedInput = item.embed_input;

				while (tokenCt > maxTokens) {
					const pct = maxTokens / tokenCt;
					const maxChars = Math.floor(truncatedInput.length * pct * 0.9);
					truncatedInput = truncatedInput.substring(0, maxChars) + '...';
					tokenCt = (await countTokens(truncatedInput)).tokens;
				}

				tokens[i].tokens = tokenCt;
				return truncatedInput;
			})
		);

		// 生成嵌入向量
		const pipelineCall = pipeline as (inputs: string[], options: { pooling: string; normalize: boolean }) => Promise<{ data: number[] }[]>;
		const resp = await pipelineCall(embedInputs, { pooling: 'mean', normalize: true });

		// 处理结果
		return batchInputs.map((item, i) => ({
			vec: Array.from(resp[i].data).map((val: number) => Math.round(val * 1e8) / 1e8),
			tokens: tokens[i].tokens,
			embed_input: item.embed_input
		}));

	} catch (error) {
		console.error('Error processing batch:', error);

		// 如果批处理失败，尝试逐个处理
		const results = await Promise.all(
			batchInputs.map(async (item): Promise<EmbedResult> => {
				try {
					const pipelineCall = pipeline as (input: string, options: { pooling: string; normalize: boolean }) => Promise<{ data: number[] }[]>;
					const result = await pipelineCall(item.embed_input, { pooling: 'mean', normalize: true });
					const tokenCount = await countTokens(item.embed_input);

					return {
						vec: Array.from(result[0].data).map((val: number) => Math.round(val * 1e8) / 1e8),
						tokens: tokenCount.tokens,
						embed_input: item.embed_input
					};
				} catch (singleError) {
					console.error('Error processing single item:', singleError);
					return {
						vec: [],
						tokens: 0,
						embed_input: item.embed_input,
						error: singleError instanceof Error ? singleError.message : 'Unknown error'
					};
				}
			})
		);
		
		return results;
	}
}

async function processMessage(data: WorkerMessage): Promise<WorkerResponse> {
	const { method, params, id, worker_id } = data;

	try {
		let result: unknown;

		switch (method) {
			case 'load': {
				console.log('Load method called with params:', params);
				const loadParams = params as LoadParams;
				result = await loadModel(loadParams.model_key, loadParams.use_gpu || false);
				break;
			}

			case 'unload':
				console.log('Unload method called');
				result = await unloadModel();
				break;

			case 'embed_batch': {
				console.log('Embed batch method called');
				if (!model) {
					throw new Error('Model not loaded');
				}

				// 等待之前的处理完成
				if (processing_message) {
					while (processing_message) {
						await new Promise(resolve => setTimeout(resolve, 100));
					}
				}

				processing_message = true;
				const embedParams = params as EmbedBatchParams;
				result = await embedBatch(embedParams.inputs);
				processing_message = false;
				break;
			}

			case 'count_tokens': {
				console.log('Count tokens method called');
				if (!model) {
					throw new Error('Model not loaded');
				}

				// 等待之前的处理完成
				if (processing_message) {
					while (processing_message) {
						await new Promise(resolve => setTimeout(resolve, 100));
					}
				}

				processing_message = true;
				const tokenParams = params as string;
				result = await countTokens(tokenParams);
				processing_message = false;
				break;
			}

			default:
				throw new Error(`Unknown method: ${method}`);
		}

		return { id, result, worker_id };

	} catch (error) {
		console.error('Error processing message:', error);
		processing_message = false;
		return { id, error: error instanceof Error ? error.message : 'Unknown error', worker_id };
	}
}

self.addEventListener('message', async (event) => {
	try {
		console.log('Worker received message:', event.data);

		// 验证消息格式
		if (!event.data || typeof event.data !== 'object') {
			console.error('Invalid message format received');
			self.postMessage({
				id: -1,
				error: 'Invalid message format'
			});
			return;
		}

		const response = await processMessage(event.data as WorkerMessage);
		console.log('Worker sending response:', response);
		self.postMessage(response);
	} catch (error) {
		console.error('Unhandled error in worker message handler:', error);
		self.postMessage({
			id: (event.data as { id?: number })?.id || -1,
			error: `Worker error: ${error instanceof Error ? error.message : 'Unknown error'}`
		});
	}
});

self.addEventListener('error', (event) => {
	console.error('Worker global error:', event);
	self.postMessage({
		id: -1,
		error: `Worker global error: ${event.message || 'Unknown error'}`
	});
});

self.addEventListener('unhandledrejection', (event) => {
	console.error('Worker unhandled promise rejection:', event);
	self.postMessage({
		id: -1,
		error: `Worker unhandled rejection: ${event.reason || 'Unknown error'}`
	});
	event.preventDefault(); // 防止默认的控制台错误
});

console.log('Embedding worker ready'); 

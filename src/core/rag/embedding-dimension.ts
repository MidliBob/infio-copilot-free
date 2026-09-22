import { SUPPORT_EMBEDDING_SIMENTION } from '../../constants'
import { logger } from '../../utils/logger'

import { EmbeddingModel } from '../../types/embedding'

/**
 * Session-scoped cache of probed embedding dimensions, keyed by model id.
 *
 * Providers such as Ollama and OpenAI-Compatible do not declare an embedding
 * dimension statically (their EmbeddingModel is created with dimension === 0).
 * Multiple subsystems (RAGEngine, VectorManager, TransEngine/InsightRepository)
 * each hold their own EmbeddingModel instance for the same configured model,
 * so probing one instance is not enough: the dimension has to be resolved
 * (and memoized) centrally, otherwise table lookups fail with dimension 0.
 *
 * The cache stores the in-flight promise so concurrent callers share a single
 * probe request. Failed probes are evicted so a later call can retry (e.g.
 * once the Ollama server becomes reachable).
 */
const dimensionProbes = new Map<string, Promise<number>>()

async function probeDimension(embeddingModel: EmbeddingModel): Promise<number> {
	let vec: number[]
	try {
		vec = await embeddingModel.getEmbedding('Infio Copilot dimension probe')
	} catch (error) {
		throw new Error(
			`Failed to detect the embedding dimension of model "${embeddingModel.id}": ${error instanceof Error ? error.message : String(error)}`
		)
	}
	const dimension = vec?.length ?? 0
	if (dimension <= 0) {
		throw new Error(`Model "${embeddingModel.id}" returned an empty embedding; cannot determine its dimension.`)
	}
	if (!SUPPORT_EMBEDDING_SIMENTION.includes(dimension)) {
		throw new Error(
			`Embedding dimension ${dimension} of model "${embeddingModel.id}" is not supported. Supported dimensions: ${SUPPORT_EMBEDDING_SIMENTION.join(', ')}. Please choose an embedding model with one of these dimensions.`
		)
	}
	logger.info(`Detected embedding dimension ${dimension} for model "${embeddingModel.id}"`)
	return dimension
}

/**
 * Ensure `embeddingModel.dimension` holds the real vector size.
 *
 * Models with a statically known dimension (> 0) are returned untouched.
 * For providers that report dimension 0, the dimension is probed once with a
 * single tiny embedding call, validated against SUPPORT_EMBEDDING_SIMENTION,
 * memoized for the session and written onto the model object.
 */
export async function resolveEmbeddingDimension(embeddingModel: EmbeddingModel): Promise<void> {
	if (embeddingModel.dimension > 0) return

	let probe = dimensionProbes.get(embeddingModel.id)
	if (!probe) {
		probe = probeDimension(embeddingModel)
		dimensionProbes.set(embeddingModel.id, probe)
		// Evict failed probes so subsequent calls retry instead of reusing the rejection.
		probe.catch(() => {
			dimensionProbes.delete(embeddingModel.id)
		})
	}
	embeddingModel.dimension = await probe
}

/** Test helper: drop all memoized dimensions. */
export function clearEmbeddingDimensionCache(): void {
	dimensionProbes.clear()
}

import { logger } from '../../utils/logger'
import { clearEmbeddingDimensionCache, resolveEmbeddingDimension } from './embedding-dimension'
import { EmbeddingModel } from '../../types/embedding'

// Every successful probe is reported through logger.info; the mock records the
// message so the suite stays quiet and can assert on it.
jest.mock('../../utils/logger')

const loggerMock = jest.mocked(logger)

function createMockModel(id: string, dimension: number, getEmbedding: jest.Mock): EmbeddingModel {
	return {
		id,
		dimension,
		supportsBatch: false,
		getEmbedding,
		getBatchEmbeddings: jest.fn(),
	}
}

describe('resolveEmbeddingDimension', () => {
	beforeEach(() => {
		clearEmbeddingDimensionCache()
		jest.clearAllMocks()
	})

	it('does not probe models with a statically known dimension', async () => {
		const getEmbedding = jest.fn()
		const model = createMockModel('bge-micro-v2', 384, getEmbedding)

		await resolveEmbeddingDimension(model)

		expect(model.dimension).toBe(384)
		expect(getEmbedding).not.toHaveBeenCalled()
		expect(loggerMock.info).not.toHaveBeenCalled()
	})

	it('probes and sets the dimension for providers reporting 0', async () => {
		const getEmbedding = jest.fn().mockResolvedValue(new Array(768).fill(0.1))
		const model = createMockModel('nomic-embed-text', 0, getEmbedding)

		await resolveEmbeddingDimension(model)

		expect(model.dimension).toBe(768)
		expect(getEmbedding).toHaveBeenCalledTimes(1)
		expect(loggerMock.info).toHaveBeenCalledWith(
			'Detected embedding dimension 768 for model "nomic-embed-text"',
		)
	})

	it('reuses the probed dimension for other instances of the same model id', async () => {
		const first = jest.fn().mockResolvedValue(new Array(1024).fill(0.1))
		const second = jest.fn().mockResolvedValue(new Array(1024).fill(0.1))
		const modelA = createMockModel('bge-m3', 0, first)
		const modelB = createMockModel('bge-m3', 0, second)

		await resolveEmbeddingDimension(modelA)
		await resolveEmbeddingDimension(modelB)

		expect(modelA.dimension).toBe(1024)
		expect(modelB.dimension).toBe(1024)
		expect(first).toHaveBeenCalledTimes(1)
		expect(second).not.toHaveBeenCalled()
		expect(loggerMock.info).toHaveBeenCalledTimes(1)
	})

	it('shares a single probe between concurrent callers', async () => {
		let resolveProbe: (value: number[]) => void = () => undefined
		const getEmbedding = jest.fn().mockImplementation(
			() => new Promise<number[]>((resolve) => {
				resolveProbe = resolve
			}),
		)
		const modelA = createMockModel('mxbai-embed-large', 0, getEmbedding)
		const modelB = createMockModel('mxbai-embed-large', 0, getEmbedding)

		const pending = Promise.all([
			resolveEmbeddingDimension(modelA),
			resolveEmbeddingDimension(modelB),
		])
		resolveProbe(new Array(512).fill(0.1))
		await pending

		expect(modelA.dimension).toBe(512)
		expect(modelB.dimension).toBe(512)
		expect(getEmbedding).toHaveBeenCalledTimes(1)
	})

	it('rejects unsupported dimensions with an explanatory error', async () => {
		const getEmbedding = jest.fn().mockResolvedValue(new Array(4096).fill(0.1))
		const model = createMockModel('some-huge-model', 0, getEmbedding)

		await expect(resolveEmbeddingDimension(model)).rejects.toThrow(
			/Embedding dimension 4096 of model "some-huge-model" is not supported/,
		)
		expect(model.dimension).toBe(0)
	})

	it('rejects empty embeddings', async () => {
		const getEmbedding = jest.fn().mockResolvedValue([])
		const model = createMockModel('broken-model', 0, getEmbedding)

		await expect(resolveEmbeddingDimension(model)).rejects.toThrow(
			/returned an empty embedding/,
		)
	})

	it('wraps probe failures with the model id and allows a retry afterwards', async () => {
		const getEmbedding = jest
			.fn()
			.mockRejectedValueOnce(new Error('Failed to fetch'))
			.mockResolvedValueOnce(new Array(384).fill(0.1))
		const model = createMockModel('flaky-model', 0, getEmbedding)

		await expect(resolveEmbeddingDimension(model)).rejects.toThrow(
			/Failed to detect the embedding dimension of model "flaky-model": Failed to fetch/,
		)

		// failed probes must not poison the cache: a retry succeeds
		await resolveEmbeddingDimension(model)
		expect(model.dimension).toBe(384)
		expect(getEmbedding).toHaveBeenCalledTimes(2)
		expect(loggerMock.info).toHaveBeenCalledWith(
			'Detected embedding dimension 384 for model "flaky-model"',
		)
	})
})

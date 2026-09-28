// Unit tests for the EmbeddingManager load/reload logic - in particular the
// runtime GPU-toggle regression: the worker bakes the device into the ONNX
// session at load time, so flipping settings.localEmbeddingsWebgpu must
// trigger unload+load without a plugin restart. The real worker is replaced
// with a fake that records postMessage calls and answers them asynchronously
// (id-correlated), exactly like the real one.

type MockPostedMessage = {
	method: string
	params: unknown
	id: number
}

type MockWorkerRecord = {
	posted: MockPostedMessage[]
	terminated: boolean
}

// jest.mock factories may only reference out-of-scope variables whose name
// starts with "mock"; the array is filled from the fake's constructor, which
// runs after module initialization (no TDZ issues).
const mockWorkers: MockWorkerRecord[] = []
let mockFailLoads = false

jest.mock('./embed.worker', () => {
	class MockEmbedWorker {
		public posted: MockPostedMessage[] = []
		public onmessage: ((event: { data: unknown }) => void) | null = null
		public onerror: ((event: { message?: string }) => void) | null = null
		public terminated = false

		constructor() {
			mockWorkers.push(this)
		}

		public postMessage(message: MockPostedMessage): void {
			this.posted.push(message)
			// Answer asynchronously, like a real worker round-trip.
			setTimeout(() => {
				if (message.method === 'load' && mockFailLoads) {
					this.onmessage?.({ data: { id: message.id, error: 'boom' } })
					return
				}
				const result: unknown =
					message.method === 'load'
						? { model_loaded: true, backend: 'wasm-q8' }
						: message.method === 'unload'
							? { model_unloaded: true }
							: []
				this.onmessage?.({ data: { id: message.id, result } })
			}, 0)
		}

		public terminate(): void {
			this.terminated = true
		}
	}
	return { __esModule: true, default: MockEmbedWorker }
})

// The manager imports requestUrl (fetch proxy) and the logger facade; both
// are mocked away: the proxy is never exercised here, and the logger must
// stay silent to keep the jest console clean.
jest.mock('obsidian')
jest.mock('../utils/logger')

import { EmbeddingManager } from './EmbeddingManager'

function lastWorker(): MockWorkerRecord {
	const worker = mockWorkers[mockWorkers.length - 1]
	if (worker === undefined) {
		throw new Error('No worker instance was created')
	}
	return worker
}

function methodsOf(worker: MockWorkerRecord): string[] {
	return worker.posted.map(message => message.method)
}

describe('EmbeddingManager backend switching', () => {
	beforeEach(() => {
		mockWorkers.length = 0
		mockFailLoads = false
	})

	it('does not reload when the same model is requested with the same GPU flag', async () => {
		const manager = new EmbeddingManager()
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', false)
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', false)
		expect(methodsOf(lastWorker())).toEqual(['load'])
	})

	it('reloads through unload when the GPU flag is turned ON at runtime', async () => {
		const manager = new EmbeddingManager()
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', false)
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', true)
		const worker = lastWorker()
		expect(methodsOf(worker)).toEqual(['load', 'unload', 'load'])
		expect(worker.posted[2].params).toEqual({
			model_key: 'Xenova/all-MiniLM-L6-v2',
			use_gpu: true,
		})
		expect(manager.modelLoaded).toBe(true)
		expect(manager.currentModel).toBe('Xenova/all-MiniLM-L6-v2')
	})

	it('reloads through unload when the GPU flag is turned OFF at runtime', async () => {
		const manager = new EmbeddingManager()
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', true)
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', false)
		const worker = lastWorker()
		expect(methodsOf(worker)).toEqual(['load', 'unload', 'load'])
		expect(worker.posted[2].params).toEqual({
			model_key: 'Xenova/all-MiniLM-L6-v2',
			use_gpu: false,
		})
	})

	it('reloads when the model id changes (pre-existing behavior)', async () => {
		const manager = new EmbeddingManager()
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', false)
		await manager.loadModel('Xenova/gte-small', false)
		const worker = lastWorker()
		expect(methodsOf(worker)).toEqual(['load', 'unload', 'load'])
		expect(worker.posted[2].params).toEqual({
			model_key: 'Xenova/gte-small',
			use_gpu: false,
		})
		expect(manager.currentModel).toBe('Xenova/gte-small')
	})

	it('deduplicates concurrent load requests for the same configuration', async () => {
		const manager = new EmbeddingManager()
		await Promise.all([
			manager.loadModel('Xenova/all-MiniLM-L6-v2', true),
			manager.loadModel('Xenova/all-MiniLM-L6-v2', true),
			manager.loadModel('Xenova/all-MiniLM-L6-v2', true),
		])
		expect(methodsOf(lastWorker())).toEqual(['load'])
	})

	it('keeps embedding working after a backend switch', async () => {
		const manager = new EmbeddingManager()
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', false)
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', true)
		await manager.embedBatch(['hello'])
		expect(methodsOf(lastWorker())).toEqual(['load', 'unload', 'load', 'embed_batch'])
	})

	it('resets backend state after a failed load so the next call retries', async () => {
		mockFailLoads = true
		const manager = new EmbeddingManager()
		await expect(manager.loadModel('Xenova/all-MiniLM-L6-v2', true)).rejects.toThrow('boom')
		expect(manager.modelLoaded).toBe(false)
		expect(manager.currentModel).toBeNull()
		mockFailLoads = false
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', true)
		expect(manager.modelLoaded).toBe(true)
		expect(methodsOf(lastWorker())).toEqual(['load', 'load'])
	})

	it('terminate() clears the loaded state', async () => {
		const manager = new EmbeddingManager()
		await manager.loadModel('Xenova/all-MiniLM-L6-v2', true)
		manager.terminate()
		expect(manager.modelLoaded).toBe(false)
		expect(manager.currentModel).toBeNull()
		expect(lastWorker().terminated).toBe(true)
	})
})

import { PGlite } from '@electric-sql/pglite'
import { PGliteWorkerOptions, worker } from '@electric-sql/pglite/worker'

import { migrations } from '../database/sql'
import { extractErrorMessage } from '../utils/network-errors'

/**
 * Build-time entry point of this file. `esbuild-plugin-inline-worker`
 * intercepts any module whose path matches `.worker.(ts|tsx)` and replaces its
 * contents with
 *
 *   export default function Worker() { return inlineWorker(<bundled script>) }
 *
 * so the factory below never reaches a bundle. Its only job is to give
 * TypeScript the `() => Worker` shape the plugin exports (see the call site in
 * `pgworker/index.ts`), and to fail loudly if this module is ever loaded without
 * the plugin (jest, plain node).
 */
export default function createPgliteWorker(): Worker {
	throw new Error(
		'pglite.worker is bundled by esbuild-plugin-inline-worker and cannot be imported directly',
	)
}

export type PgliteAssets = {
	wasm: ArrayBuffer
	data: ArrayBuffer
	vector: ArrayBuffer
}

/**
 * Mirrors of the `@electric-sql/pglite@0.2.14` dist assets, used only when the
 * plugin folder does not ship its own copies. The plugin normally passes the
 * assets in (see `loadLocalPgliteAssets` in database-manager.ts), so no network
 * request is needed at start-up.
 */
const PGLITE_CDN_BASES = [
	'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.14/dist/',
	'https://registry.npmmirror.com/@electric-sql/pglite/0.2.14/files/dist/',
	'https://unpkg.com/@electric-sql/pglite@0.2.14/dist/',
]

async function fetchAssetsFromCdn(): Promise<PgliteAssets> {
	let lastError: unknown
	for (const base of PGLITE_CDN_BASES) {
		try {
			const [wasmRes, dataRes, vectorRes] = await Promise.all([
				fetch(`${base}postgres.wasm`),
				fetch(`${base}postgres.data`),
				fetch(`${base}vector.tar.gz`),
			])
			if (!wasmRes.ok || !dataRes.ok || !vectorRes.ok) {
				throw new Error(
					`HTTP ${String(wasmRes.status)}/${String(dataRes.status)}/${String(vectorRes.status)} from ${base}`,
				)
			}
			return {
				wasm: await wasmRes.arrayBuffer(),
				data: await dataRes.arrayBuffer(),
				vector: await vectorRes.arrayBuffer(),
			}
		} catch (error) {
			lastError = error
		}
	}
	throw new Error(
		'Failed to obtain PGlite assets. Either place postgres.wasm, postgres.data and ' +
			'vector.tar.gz (from @electric-sql/pglite@0.2.14 dist) into the plugin folder, ' +
			'or check your network connection. Last error: ' +
			extractErrorMessage(lastError),
	)
}

const loadPGliteResources = async (
	assets?: PgliteAssets,
): Promise<{
	fsBundle: Blob
	wasmModule: WebAssembly.Module
	vectorExtensionBundlePath: URL
}> => {
	const { wasm, data, vector } = assets ?? (await fetchAssetsFromCdn())

	const wasmModule = await WebAssembly.compile(wasm)

	const fsBundle = new Blob([data], {
		type: 'application/octet-stream',
	})

	const vectorBlob = new Blob([vector], {
		type: 'application/gzip',
	})

	return {
		fsBundle,
		wasmModule,
		vectorExtensionBundlePath: new URL(URL.createObjectURL(vectorBlob)),
	}
}

// The worker() helper installs the message loop; the promise it returns settles
// per message and is intentionally not awaited at module scope.
void worker({
	async init(
		options: PGliteWorkerOptions & { pgliteAssets?: PgliteAssets },
	) {
		// `pgliteAssets` is our own transport field (structured-cloned by
		// PGliteWorker); strip it before handing options to PGlite.
		const { pgliteAssets, ...pgOptions } = options
		const { fsBundle, wasmModule, vectorExtensionBundlePath } =
			await loadPGliteResources(pgliteAssets)
		// The storage engine is fixed: PGliteWorker calls init() with the options
		// only (no filesystem argument), so a "choose idb or opfs" setting could
		// never reach the worker. OPFS is what the plugin has always opened.
		const db = await PGlite.create('opfs-ahp://infio-db', {
			relaxedDurability: true,
			fsBundle: fsBundle,
			wasmModule: wasmModule,
			...pgOptions,
			extensions: {
				...pgOptions.extensions,
				vector: vectorExtensionBundlePath,
			},
		})

		// Execute SQL migrations
		for (const migration of Object.values(migrations)) {
			// Split SQL into individual commands and execute them one by one
			const commands = migration.sql.split('\n\n').filter(cmd => cmd.trim());
			for (const command of commands) {
				await db.exec(command);
			}
		}

		return db
	},
})

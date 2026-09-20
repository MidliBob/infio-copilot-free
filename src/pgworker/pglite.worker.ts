import { PGlite } from '@electric-sql/pglite'
// @ts-expect-error: types for '@electric-sql/pglite/worker' not resolved under current moduleResolution
import { PGliteWorkerOptions, worker } from '@electric-sql/pglite/worker'

import { migrations } from '../database/sql'

export { }

export interface PgliteAssets {
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
					`HTTP ${wasmRes.status}/${dataRes.status}/${vectorRes.status} from ${base}`,
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
			(lastError instanceof Error ? lastError.message : String(lastError)),
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

worker({
	async init(options: PGliteWorkerOptions, filesystem: string) {
		let db: PGlite;
		// `pgliteAssets` is our own transport field (structured-cloned by
		// PGliteWorker); strip it before handing options to PGlite.
		const { pgliteAssets, ...pgOptions } = (options ?? {}) as PGliteWorkerOptions & {
			pgliteAssets?: PgliteAssets
		}
		const { fsBundle, wasmModule, vectorExtensionBundlePath } =
			await loadPGliteResources(pgliteAssets)
		if (filesystem === 'idb') {
			db = await PGlite.create('idb://infio-db', {
				relaxedDurability: true,
				fsBundle: fsBundle,
				wasmModule: wasmModule,
				...pgOptions,
				extensions: {
					...pgOptions.extensions,
					vector: vectorExtensionBundlePath,
				},
			})
		} else {
			db = await PGlite.create('opfs-ahp://infio-db', {
				relaxedDurability: true,
				fsBundle: fsBundle,
				wasmModule: wasmModule,
				...pgOptions,
				extensions: {
					...pgOptions.extensions,
					vector: vectorExtensionBundlePath,
				},
			})
		}

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

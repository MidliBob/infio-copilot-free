import { live } from '@electric-sql/pglite/live'
import { PGliteWorker } from '@electric-sql/pglite/worker'

import { logger } from '../utils/logger'

import createPgliteWorker from './pglite.worker'

export type PgliteAssets = {
	wasm: ArrayBuffer;
	data: ArrayBuffer;
	vector: ArrayBuffer;
}

/**
 * `PGliteWorker.create` options plus this plugin's own transport field: the
 * worker reads `pgliteAssets` and strips it before handing the options to
 * PGlite (see `pglite.worker.ts`).
 *
 * The object is built untyped (and only then passed to `create`) so the SDK's
 * generic can infer the precise `extensions` shape — annotating it as
 * `PGliteWorkerOptions` would widen `extensions` to the index-signature type
 * and collapse the resulting `live` namespace to `never`.
 */
export const createAndInitDb = async (assets?: PgliteAssets) => {
	const worker = createPgliteWorker()

	const options = {
		extensions: {
			live,
		},
		// Transport field for the worker init (see pglite.worker.ts);
		// undefined is fine — the worker falls back to CDN mirrors.
		pgliteAssets: assets,
	}

	// `PGliteWorker.create` takes exactly `(worker, options)`; the database
	// engine is fixed inside the worker (OPFS), so nothing else is passed.
	const pg = await PGliteWorker.create(worker, options)
	logger.debug('PGlite DB created in opfs-ahp://infio-db')
	return pg
}

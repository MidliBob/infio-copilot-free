// @ts-nocheck

import { live } from '@electric-sql/pglite/live';
import { PGliteWorker } from '@electric-sql/pglite/worker';

import PGWorker from './pglite.worker';

export interface PgliteAssets {
	wasm: ArrayBuffer;
	data: ArrayBuffer;
	vector: ArrayBuffer;
}

export const createAndInitDb = async (filesystem: string, assets?: PgliteAssets) => {
	const worker = new PGWorker();

	const pg = await PGliteWorker.create(
		worker,
		{
			extensions: {
				live,
			},
			// Transport field for the worker init (see pglite.worker.ts);
			// undefined is fine — the worker falls back to CDN mirrors.
			pgliteAssets: assets,
		},
		filesystem, 
	)
	console.log(`PGlite DB created in ${filesystem}://infio-db`)
	return pg
}

/* eslint-disable */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Keep in sync with PGLITE_CDN_BASES in src/pgworker/pglite.worker.ts
const PGLITE_VERSION = '0.2.14'
const FILES = ['postgres.wasm', 'postgres.data', 'vector.tar.gz']

async function copyPgliteAssets() {
	const src = path.resolve(__dirname, '../node_modules/@electric-sql/pglite/dist')
	const dest = path.resolve(__dirname, '../pglite-assets')
	await fs.mkdir(dest, { recursive: true })
	for (const file of FILES) {
		await fs.copyFile(path.join(src, file), path.join(dest, file))
		const { size } = await fs.stat(path.join(dest, file))
		console.log(`copied ${file} (${size} bytes)`)
	}
	console.log(
		`PGlite ${PGLITE_VERSION} assets are in pglite-assets/ — ship them next to main.js in the plugin folder`,
	)
}

copyPgliteAssets().catch((error) => {
	console.error(error)
	process.exit(1)
})

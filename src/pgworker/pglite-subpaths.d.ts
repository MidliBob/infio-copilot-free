/**
 * `@electric-sql/pglite` 0.2.14 exposes its `live` and `worker` entry points
 * through a package `exports` map. The repository compiles with
 * `moduleResolution: node` (node10), which ignores `exports`, so these two
 * documented subpath imports do not resolve for tsc — even though esbuild
 * resolves them through the map at build time. The shim re-exports the real
 * declaration files (the deep paths do exist on disk), so the imports stay
 * honest instead of being suppressed with @ts-expect-error.
 *
 * Remove this file when tsconfig moves to `moduleResolution: bundler|node16`.
 */
declare module '@electric-sql/pglite/worker' {
	export * from '@electric-sql/pglite/dist/worker/index'
}

declare module '@electric-sql/pglite/live' {
	export * from '@electric-sql/pglite/dist/live/index'
}

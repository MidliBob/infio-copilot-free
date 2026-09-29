'use strict'
/**
 * Build-time vendor patch for @modelcontextprotocol/sdk `client/stdio.js`.
 *
 * Why: MCP SDK 1.30.0 closes a spawned child process with
 *
 *     await Promise.race([closePromise, new Promise(resolve => setTimeout(resolve, 2000).unref())])
 *
 * In Node `setTimeout` returns a Timeout object that has `unref()`. In the
 * Obsidian renderer the bundle sees the DOM `setTimeout`, which returns a
 * number, so the bare `.unref()` call throws
 * "setTimeout(...).unref is not a function". The exception aborts
 * StdioClientTransport.close() before the kill sequence runs, so restarting or
 * deleting an stdio MCP server orphans the previous npx/uvx child process
 * (McpHub catches the error and logs "Failed to close transport for <name>").
 *
 * The esbuild plugin below rewrites every unguarded `setTimeout(...).unref()`
 * in the SDK's stdio transport into a guarded helper at bundle time:
 * no node_modules mutation, no pnpm patch to maintain. If a future SDK
 * release changes the shape of the call, the plugin emits a build warning
 * instead of silently shipping the bug again; once the SDK guards the call
 * itself the plugin becomes a no-op and can be deleted.
 *
 * Unit-tested in scripts/mcp-stdio-unref-patch.test.js (jest).
 */

const HELPER =
	'const __unrefTimer = (timer) => { if (timer && typeof timer.unref === "function") { timer.unref(); } return timer; };'

// setTimeout(...) allowing one level of nested parentheses, then .unref()
const UNGUARDED_UNREF = /setTimeout\((?:[^()]|\([^()]*\))*\)\.unref\(\)/g
const ANY_UNREF = /\.unref\(\)/g
const REF_SUFFIX = '.unref()'

// The SDK path inside node_modules (pnpm store paths included); matches both
// dist layouts and both path separator styles (Windows builds).
const STDIO_FILE =
	/[\\/]@modelcontextprotocol[\\/]sdk[\\/]dist[\\/](?:esm|cjs)[\\/]client[\\/]stdio\.js$/

function countMatches(source, regex) {
	const matches = source.match(regex)
	return matches === null ? 0 : matches.length
}

function prependHelper(source) {
	// Keep a leading "use strict"; directive first so the CJS dist does not
	// silently lose strict mode.
	const strict = /^(\s*["']use strict["'];?[ \t]*\r?\n?)/.exec(source)
	if (strict !== null) {
		return strict[1] + HELPER + '\n' + source.slice(strict[1].length)
	}
	return HELPER + '\n' + source
}

/**
 * Pure transform of the SDK source.
 *
 * @param {unknown} contents original file contents
 * @returns {{ contents: string | null, patchedCount: number, warnings: string[] }}
 *   `contents` is the patched source, or null when the file needs no patch
 *   (no unguarded pattern present). `warnings` is non-empty when some
 *   `.unref()` call has an unrecognized shape and stays unpatched.
 */
function patchMcpStdioSource(contents) {
	if (typeof contents !== 'string' || contents === '') {
		return { contents: null, patchedCount: 0, warnings: [] }
	}
	const before = countMatches(contents, ANY_UNREF)
	let patchedCount = 0
	const replaced = contents.replace(UNGUARDED_UNREF, (match) => {
		patchedCount += 1
		return `__unrefTimer(${match.slice(0, match.length - REF_SUFFIX.length)})`
	})
	const leftovers = countMatches(replaced, ANY_UNREF)
	const warnings = []
	if (leftovers > 0) {
		warnings.push(
			`mcp-stdio-unref-patch: ${leftovers} .unref() call(s) in the MCP SDK stdio transport have an unrecognized shape and were NOT patched - StdioClientTransport.close() may throw in the Obsidian renderer; update scripts/mcp-stdio-unref-patch.js`,
		)
	}
	if (patchedCount === 0) {
		return { contents: null, patchedCount: 0, warnings }
	}
	return { contents: prependHelper(replaced), patchedCount, warnings }
}

/**
 * esbuild plugin: applies patchMcpStdioSource to the SDK's client/stdio.js
 * (esm and cjs dists) while bundling.
 */
function mcpStdioUnrefPlugin() {
	const fsp = require('fs/promises')
	return {
		name: 'mcp-stdio-unref-patch',
		setup(build) {
			build.onLoad({ filter: STDIO_FILE }, async (args) => {
				const source = await fsp.readFile(args.path, 'utf8')
				const report = patchMcpStdioSource(source)
				const warnings = report.warnings.map((text) => ({ text }))
				if (report.contents === null) {
					if (warnings.length === 0) {
						return undefined
					}
					return { contents: source, loader: 'js', warnings }
				}
				return { contents: report.contents, loader: 'js', warnings }
			})
		},
	}
}

module.exports = { patchMcpStdioSource, mcpStdioUnrefPlugin, HELPER, STDIO_FILE }

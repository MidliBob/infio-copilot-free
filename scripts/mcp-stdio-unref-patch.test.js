/**
 * Regression suite for the build-time vendor patch of the MCP SDK stdio
 * transport (scripts/mcp-stdio-unref-patch.js). The bug it pins: SDK 1.30.0
 * calls `setTimeout(resolve, 2000).unref()` unguarded; in the Obsidian
 * renderer setTimeout returns a number, so closing an stdio MCP server threw
 * "setTimeout(...).unref is not a function" and orphaned the child process.
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { patchMcpStdioSource, HELPER } = require('./mcp-stdio-unref-patch.js')

const sdkDist = (...parts) =>
	path.join(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', ...parts)
const CJS_STDIO = sdkDist('cjs', 'client', 'stdio.js')
const ESM_STDIO = sdkDist('esm', 'client', 'stdio.js')

describe('patchMcpStdioSource (real SDK 1.30.0 sources)', () => {
	it('patches both unguarded call sites in the cjs dist', () => {
		const source = fs.readFileSync(CJS_STDIO, 'utf8')
		const report = patchMcpStdioSource(source)
		expect(report.patchedCount).toBe(2)
		expect(report.warnings).toEqual([])
		expect(report.contents).not.toBeNull()
		expect(report.contents).toContain('__unrefTimer(setTimeout(resolve, 2000))')
		expect(report.contents).not.toContain(').unref()')
	})

	it('keeps the patched cjs source syntactically valid and strict', () => {
		const source = fs.readFileSync(CJS_STDIO, 'utf8')
		const report = patchMcpStdioSource(source)
		// Compiling (not running) proves the rewrite did not break the syntax.
		expect(() => new vm.Script(report.contents)).not.toThrow()
		// The "use strict" directive must stay the first statement.
		expect(report.contents.startsWith('"use strict";')).toBe(true)
		expect(report.contents).toContain(HELPER)
	})

	it('patches both unguarded call sites in the esm dist', () => {
		const source = fs.readFileSync(ESM_STDIO, 'utf8')
		const report = patchMcpStdioSource(source)
		expect(report.patchedCount).toBe(2)
		expect(report.warnings).toEqual([])
		expect(report.contents).not.toContain(').unref()')
		// ESM has no "use strict" prologue - the helper goes first.
		expect(report.contents.startsWith(HELPER)).toBe(true)
	})
})

describe('patchMcpStdioSource (drift and no-op contract)', () => {
	it('patches a changed timeout value', () => {
		const report = patchMcpStdioSource(
			'await Promise.race([p, new Promise(resolve => setTimeout(resolve, 5000).unref())]);',
		)
		expect(report.patchedCount).toBe(1)
		expect(report.contents).toContain('__unrefTimer(setTimeout(resolve, 5000))')
		expect(report.warnings).toEqual([])
	})

	it('patches an arrow callback inside setTimeout (one nesting level)', () => {
		const report = patchMcpStdioSource(
			'new Promise(resolve => setTimeout(() => resolve(undefined), 2000).unref())',
		)
		expect(report.patchedCount).toBe(1)
		expect(report.contents).toContain(
			'__unrefTimer(setTimeout(() => resolve(undefined), 2000))',
		)
		expect(report.warnings).toEqual([])
	})

	it('leaves already-guarded sources untouched without warnings', () => {
		// `unref?.()` is the guarded idiom the SDK itself uses elsewhere
		// (server/sseKeepAlive.js); it must not be touched nor warned about.
		const report = patchMcpStdioSource('const t = setTimeout(fn, 10); t.unref?.();')
		expect(report.contents).toBeNull()
		expect(report.patchedCount).toBe(0)
		expect(report.warnings).toEqual([])
	})

	it('leaves sources without any unref untouched', () => {
		const report = patchMcpStdioSource('const a = setTimeout(fn, 10); clearTimeout(a);')
		expect(report).toEqual({ contents: null, patchedCount: 0, warnings: [] })
	})

	it('tolerates non-string input', () => {
		expect(patchMcpStdioSource(undefined)).toEqual({ contents: null, patchedCount: 0, warnings: [] })
		expect(patchMcpStdioSource('')).toEqual({ contents: null, patchedCount: 0, warnings: [] })
	})

	it('warns when an unknown .unref() shape is the only occurrence', () => {
		const report = patchMcpStdioSource('this._timer.unref();')
		expect(report.contents).toBeNull()
		expect(report.patchedCount).toBe(0)
		expect(report.warnings).toHaveLength(1)
		expect(report.warnings[0]).toContain('unrecognized shape')
	})

	it('warns about an unknown shape while still patching the known one', () => {
		const report = patchMcpStdioSource(
			'setTimeout(resolve, 2000).unref(); this._keepAlive.unref();',
		)
		expect(report.patchedCount).toBe(1)
		expect(report.contents).toContain('__unrefTimer(setTimeout(resolve, 2000))')
		expect(report.contents).toContain('this._keepAlive.unref();')
		expect(report.warnings).toHaveLength(1)
	})
})

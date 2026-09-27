#!/usr/bin/env node
/**
 * TypeScript suppression scanner (roadmap phase 2, pass 2 - item 3).
 *
 * Counts @ts-nocheck / @ts-ignore / @ts-expect-error markers under src/
 * and maintains ts-suppressions-baseline.json, the frozen debt ledger that
 * src/ts-suppressions.test.ts enforces in CI (counts must match exactly:
 * new suppressions fail, burn-downs require a baseline update in the same
 * commit).
 *
 * Usage:
 *   node scripts/ts-suppressions.mjs            print the report table
 *   node scripts/ts-suppressions.mjs --update   rewrite the baseline
 *   node scripts/ts-suppressions.mjs --json     print the counts as JSON
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = join(repoRoot, 'ts-suppressions-baseline.json')

const MARKERS = [
	['nocheck', /@ts-nocheck/g],
	['ignore', /@ts-ignore/g],
	['expectError', /@ts-expect-error/g],
]

function listSourceFiles() {
	const out = []
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
		}
	}
	walk(join(repoRoot, 'src'))
	return out.sort()
}

function scan() {
	const files = {}
	for (const full of listSourceFiles()) {
		const text = readFileSync(full, 'utf8')
		const counts = {}
		let total = 0
		for (const [name, pattern] of MARKERS) {
			const n = (text.match(pattern) ?? []).length
			if (n > 0) {
				counts[name] = n
				total += n
			}
		}
		if (total > 0) files[relative(repoRoot, full).split(sep).join('/')] = counts
	}
	return files
}

function totalsOf(files) {
	const totals = { nocheck: 0, ignore: 0, expectError: 0, all: 0 }
	for (const counts of Object.values(files)) {
		for (const [name, n] of Object.entries(counts)) {
			totals[name] += n
			totals.all += n
		}
	}
	return totals
}

const files = scan()
const totals = totalsOf(files)

if (process.argv.includes('--update')) {
	const payload = {
		$comment:
			'Frozen TypeScript suppression debt per file. Regenerate ONLY with: node scripts/ts-suppressions.mjs --update. Enforced by src/ts-suppressions.test.ts; policy and cleanup plan: docs/ts-suppressions.md.',
		files,
	}
	writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, '\t') + '\n')
	console.log(
		`ts-suppressions: baseline written (${totals.all} markers in ${Object.keys(files).length} files: nocheck=${totals.nocheck}, ignore=${totals.ignore}, expect-error=${totals.expectError})`,
	)
} else if (process.argv.includes('--json')) {
	console.log(JSON.stringify({ files, totals }, null, '\t'))
} else {
	const rows = Object.entries(files)
		.map(([file, c]) => [file, c.nocheck ?? 0, c.ignore ?? 0, c.expectError ?? 0])
		.sort((a, b) => b[1] + b[2] + b[3] - (a[1] + a[2] + a[3]) || a[0].localeCompare(b[0]))
	console.log('file'.padEnd(58) + 'nocheck'.padStart(8) + 'ignore'.padStart(8) + 'expect'.padStart(8))
	for (const [file, n, i, e] of rows) {
		console.log(file.padEnd(58) + String(n).padStart(8) + String(i).padStart(8) + String(e).padStart(8))
	}
	console.log(
		`\nTOTAL: ${totals.all} markers in ${rows.length} files (nocheck=${totals.nocheck}, ignore=${totals.ignore}, expect-error=${totals.expectError})`,
	)
}

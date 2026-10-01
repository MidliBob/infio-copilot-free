#!/usr/bin/env node
/**
 * stylelint violation ratchet (CSS twin of lint-ratchet.mjs).
 *
 * styles.css carries a large pre-existing debt — above all the 311
 * `!important` declarations that phase 3 of the roadmap burns down (frozen
 * in stylelint-baseline.json). This gate makes the debt strictly
 * non-growing:
 *
 *   node scripts/stylelint-ratchet.mjs            check current errors vs baseline
 *   node scripts/stylelint-ratchet.mjs --update   rewrite the baseline (shrink it
 *                                                 after a burn-down commit, commit
 *                                                 the result)
 *
 * The rule set lives in .stylelintrc.json: correctness rules (invalid hex,
 * duplicate selectors, empty blocks, unknown units/properties/at-rules, ...)
 * plus `declaration-no-important` — the phase-3 target. Rules that are
 * already at zero stay enabled: the baseline only freezes what exists, and
 * any new violation of any enabled rule fails the check.
 *
 * Only error-severity violations are tracked (the config sets no warnings).
 * Parse errors are tracked under the pseudo-rule "(parse)".
 *
 * Exit codes: 0 = no regressions, 1 = regressions found, 2 = tooling failure.
 */
import stylelint from 'stylelint'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(scriptPath), '..')
const BASELINE_PATH = join(repoRoot, 'stylelint-baseline.json')

function parseArgs(argv) {
	const args = { update: false }
	for (const arg of argv) {
		if (arg === '--update') args.update = true
		else {
			console.error(`Unknown argument: ${arg}`)
			process.exit(2)
		}
	}
	return args
}

function listCssFiles() {
	const out = []
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
			const full = join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (entry.name.endsWith('.css')) out.push(full)
		}
	}
	walk(repoRoot)
	return out.sort()
}

function toRepoPath(filePath) {
	return relative(repoRoot, filePath).split(sep).join('/')
}

function countResults(results) {
	const counts = {}
	const add = (file, rule) => {
		counts[file] = counts[file] || {}
		counts[file][rule] = (counts[file][rule] ?? 0) + 1
	}
	for (const result of results) {
		const file = toRepoPath(result.source)
		for (const warning of result.warnings) {
			if (warning.severity !== 'error') continue
			add(file, warning.rule ?? '(parse)')
		}
		for (const parseError of result.parseErrors ?? []) add(file, '(parse)')
	}
	return counts
}

function sortCounts(counts) {
	const sorted = {}
	for (const file of Object.keys(counts).sort()) {
		const rules = {}
		for (const rule of Object.keys(counts[file]).sort()) rules[rule] = counts[file][rule]
		sorted[file] = rules
	}
	return sorted
}

function total(counts) {
	let sum = 0
	for (const file of Object.keys(counts)) {
		for (const rule of Object.keys(counts[file])) sum += counts[file][rule]
	}
	return sum
}

async function lintAll() {
	const files = listCssFiles().map(toRepoPath)
	if (files.length === 0) {
		console.error('stylelint-ratchet: no CSS files found under the repository root')
		process.exit(2)
	}
	const run = await stylelint.lint({ files, cwd: repoRoot })
	const invalidOptions = run.results.flatMap((result) =>
		result.invalidOptionWarnings.map((warning) => `${toRepoPath(result.source)}: ${warning.text}`),
	)
	if (invalidOptions.length > 0) {
		console.error(
			'stylelint-ratchet: invalid rule options in .stylelintrc.json:\n  ' + invalidOptions.join('\n  '),
		)
		process.exit(2)
	}
	return countResults(run.results)
}

function writeBaseline(counts) {
	const payload = {
		$comment:
			'Frozen stylelint error debt per file/rule. Regenerate ONLY with: node scripts/stylelint-ratchet.mjs --update. See scripts/stylelint-ratchet.mjs header and MAINTAINING.md.',
		files: sortCounts(counts),
	}
	writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, '\t') + '\n')
	console.log(
		`stylelint-ratchet: baseline written to stylelint-baseline.json (${total(counts)} errors in ${Object.keys(counts).length} files)`,
	)
}

function diffAgainstBaseline(current, baselineFiles) {
	const regressions = []
	const improvements = []
	const files = new Set([...Object.keys(current), ...Object.keys(baselineFiles)])
	for (const file of [...files].sort()) {
		const cur = current[file] ?? {}
		const base = baselineFiles[file] ?? {}
		const rules = new Set([...Object.keys(cur), ...Object.keys(base)])
		for (const rule of [...rules].sort()) {
			const c = cur[rule] ?? 0
			const b = base[rule] ?? 0
			if (c > b) regressions.push({ file, rule, baseline: b, current: c })
			else if (c < b) improvements.push({ file, rule, baseline: b, current: c })
		}
	}
	return { regressions, improvements }
}

async function main() {
	const args = parseArgs(process.argv.slice(2))

	const current = await lintAll()

	if (args.update) {
		writeBaseline(current)
		return
	}

	if (!existsSync(BASELINE_PATH)) {
		console.error(
			'stylelint-ratchet: stylelint-baseline.json is missing.\n' +
				'Generate it once with: node scripts/stylelint-ratchet.mjs --update (then commit it).',
		)
		process.exit(2)
	}
	const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
	const { regressions, improvements } = diffAgainstBaseline(current, baseline.files ?? {})

	for (const item of improvements) {
		console.log(`improved: ${item.file} ${item.rule}: ${item.baseline} -> ${item.current}`)
	}
	if (improvements.length > 0) {
		console.log(
			`\nstylelint-ratchet: ${improvements.length} improvement(s). Shrink the baseline: node scripts/stylelint-ratchet.mjs --update && git add stylelint-baseline.json`,
		)
	}

	if (regressions.length > 0) {
		console.error('')
		for (const item of regressions) {
			console.error(
				`REGRESSION: ${item.file} ${item.rule}: baseline ${item.baseline}, now ${item.current}`,
			)
		}
		console.error(
			`\nstylelint-ratchet: ${regressions.length} regression(s) - new stylelint errors are not allowed.\n` +
				'Fix the reported violations (preferred), or, if a rule was intentionally relaxed,\n' +
				'update the baseline explicitly: node scripts/stylelint-ratchet.mjs --update',
		)
		process.exit(1)
	}

	console.log(
		`stylelint-ratchet: OK - ${total(current)} errors in ${Object.keys(current).length} files, no regressions vs baseline.`,
	)
}

main().catch((error) => {
	console.error('stylelint-ratchet: tooling failure:', error)
	process.exit(2)
})

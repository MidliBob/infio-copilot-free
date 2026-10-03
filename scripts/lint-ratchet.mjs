#!/usr/bin/env node
/**
 * ESLint violation ratchet.
 *
 * The repository carries a large pre-existing lint debt (frozen in
 * eslint-baseline.json). This gate makes the debt strictly non-growing:
 *
 *   node scripts/lint-ratchet.mjs            check current errors vs baseline
 *   node scripts/lint-ratchet.mjs --update   rewrite the baseline (shrink it
 *                                            after a burn-down commit, commit
 *                                            the result)
 *   node scripts/lint-ratchet.mjs --batch=14 lint files in chunks of 14,
 *                                            each chunk in a fresh child
 *                                            process - slower, but every
 *                                            process stays under ~1 GB of
 *                                            heap; use on small machines or
 *                                            when the single-process run dies
 *                                            with OOM (NODE_OPTIONS applies
 *                                            to the children as well)
 *
 * Rules that are switched off in eslint.config.mjs but tracked here (the
 * phase-2/phase-3 ratchet scope): no-unsafe-assignment,
 * no-unsafe-member-access, no-unsafe-call (frozen since 1.5.5) plus
 * no-misused-promises and no-unnecessary-condition (added to the freeze in
 * 1.7.9 — they had never been measured before). They are force-enabled for
 * this run only, so the baseline already accounts for them and enabling a
 * rule in eslint.config.mjs later is a no-op for the ratchet.
 * (no-floating-promises graduated from this list in 1.7.10: its last four
 * findings were fixed and the rule is enabled in eslint.config.mjs.)
 *
 * Only error-severity violations are tracked (warnings never failed CI and
 * still don't). Parse errors are tracked under the pseudo-rule "(parse)".
 *
 * Exit codes: 0 = no regressions, 1 = regressions found, 2 = tooling failure.
 */
import { ESLint } from 'eslint'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(scriptPath), '..')
const BASELINE_PATH = join(repoRoot, 'eslint-baseline.json')

const TRACKED_FORCED_RULES = {
	'@typescript-eslint/no-unsafe-assignment': 'error',
	'@typescript-eslint/no-unsafe-member-access': 'error',
	'@typescript-eslint/no-unsafe-call': 'error',
	'@typescript-eslint/no-misused-promises': 'error',
	'@typescript-eslint/no-unnecessary-condition': 'error',
}

function parseArgs(argv) {
	const args = { update: false, batch: 0, filesFrom: null, emitJson: null }
	for (const arg of argv) {
		if (arg === '--update') args.update = true
		else if (arg.startsWith('--files-from=')) args.filesFrom = arg.slice('--files-from='.length)
		else if (arg.startsWith('--emit-json=')) args.emitJson = arg.slice('--emit-json='.length)
		else if (arg.startsWith('--batch=')) {
			args.batch = Number.parseInt(arg.slice('--batch='.length), 10)
			if (!Number.isInteger(args.batch) || args.batch < 1) {
				console.error(`Invalid --batch value: ${arg}`)
				process.exit(2)
			}
		} else {
			console.error(`Unknown argument: ${arg}`)
			process.exit(2)
		}
	}
	return args
}

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

function toRepoPath(filePath) {
	return relative(repoRoot, filePath).split(sep).join('/')
}

function countResults(results) {
	const counts = {}
	for (const result of results) {
		const file = toRepoPath(result.filePath)
		for (const message of result.messages) {
			if (message.severity !== 2) continue
			const rule = message.ruleId ?? '(parse)'
			counts[file] = counts[file] || {}
			counts[file][rule] = (counts[file][rule] ?? 0) + 1
		}
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

function makeEngine() {
	return new ESLint({
		cwd: repoRoot,
		overrideConfig: { rules: TRACKED_FORCED_RULES },
	})
}

async function lintPaths(paths) {
	return countResults(await makeEngine().lintFiles(paths))
}

function mergeCounts(target, source) {
	for (const [file, rules] of Object.entries(source)) {
		target[file] = target[file] || {}
		for (const [rule, n] of Object.entries(rules)) {
			target[file][rule] = (target[file][rule] ?? 0) + n
		}
	}
	return target
}

/**
 * Child mode: lint exactly the files listed in --files-from and write the
 * per-file/rule counts to --emit-json. One TypeScript program per child keeps
 * peak memory bounded, which is what --batch is for.
 */
async function runChild(args) {
	const paths = readFileSync(args.filesFrom, 'utf8').trim().split('\n').filter(Boolean)
	const counts = await lintPaths(paths)
	writeFileSync(args.emitJson, JSON.stringify(counts))
}

async function lintAll(args) {
	const files = listSourceFiles().map((f) => toRepoPath(f))

	if (!args.batch) {
		return lintPaths(files)
	}

	const tmpDir = mkdtempSync(join(tmpdir(), 'lint-ratchet-'))
	const counts = {}
	try {
		const batches = Math.ceil(files.length / args.batch)
		for (let i = 0, done = 0; i < files.length; i += args.batch) {
			const chunk = files.slice(i, i + args.batch)
			const tag = `${process.pid}-${done}`
			const listPath = join(tmpDir, `files-${tag}.txt`)
			const outPath = join(tmpDir, `counts-${tag}.json`)
			writeFileSync(listPath, chunk.join('\n') + '\n')
			const child = spawnSync(
				process.execPath,
				[scriptPath, `--files-from=${listPath}`, `--emit-json=${outPath}`],
				{ cwd: repoRoot, stdio: ['ignore', 'ignore', 'inherit'] },
			)
			if (child.status !== 0) {
				console.error(
					`lint-ratchet: child lint process failed (exit ${child.status}, signal ${child.signal ?? 'none'}) on batch ${done + 1}/${batches}:\n  ` +
						chunk.map((f) => basename(f)).join(', ') +
						'\nRetry with a smaller --batch, or raise the heap: NODE_OPTIONS=--max-old-space-size=4096',
				)
				process.exit(2)
			}
			mergeCounts(counts, JSON.parse(readFileSync(outPath, 'utf8')))
			done++
			process.stderr.write(`\rlint-ratchet: batch ${done}/${batches}`)
		}
		process.stderr.write('\n')
	} finally {
		rmSync(tmpDir, { recursive: true, force: true })
	}
	return counts
}

function writeBaseline(counts) {
	const payload = {
		$comment:
			'Frozen ESLint error debt per file/rule. Regenerate ONLY with: node scripts/lint-ratchet.mjs --update. See scripts/lint-ratchet.mjs header and MAINTAINING.md.',
		files: sortCounts(counts),
	}
	writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, '\t') + '\n')
	console.log(`lint-ratchet: baseline written to eslint-baseline.json (${total(counts)} errors in ${Object.keys(counts).length} files)`)
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

	if (args.filesFrom) {
		if (!args.emitJson) {
			console.error('lint-ratchet: --files-from requires --emit-json')
			process.exit(2)
		}
		await runChild(args)
		return
	}

	const current = await lintAll(args)

	if (args.update) {
		writeBaseline(current)
		return
	}

	if (!existsSync(BASELINE_PATH)) {
		console.error(
			'lint-ratchet: eslint-baseline.json is missing.\n' +
				'Generate it once with: node scripts/lint-ratchet.mjs --update (then commit it).',
		)
		process.exit(2)
	}
	const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
	const { regressions, improvements } = diffAgainstBaseline(current, baseline.files ?? {})

	for (const item of improvements) {
		console.log(
			`improved: ${item.file} ${item.rule}: ${item.baseline} -> ${item.current}`,
		)
	}
	if (improvements.length > 0) {
		console.log(
			`\nlint-ratchet: ${improvements.length} improvement(s). Shrink the baseline: node scripts/lint-ratchet.mjs --update && git add eslint-baseline.json`,
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
			`\nlint-ratchet: ${regressions.length} regression(s) - new ESLint errors are not allowed.\n` +
				'Fix the reported violations (preferred), or, if a rule was intentionally relaxed,\n' +
				'update the baseline explicitly: node scripts/lint-ratchet.mjs --update',
		)
		process.exit(1)
	}

	console.log(
		`lint-ratchet: OK - ${total(current)} errors in ${Object.keys(current).length} files, no regressions vs baseline.`,
	)
}

main().catch((error) => {
	console.error('lint-ratchet: tooling failure:', error)
	process.exit(2)
})

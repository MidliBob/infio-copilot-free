#!/usr/bin/env node
/**
 * strictNullChecks migration probe (1.7.20 spike; NOT a gate).
 *
 * Measures, without changing any committed configuration, what a
 * `strictNullChecks: true` migration would cost:
 *
 *   1. tsc side    — `tsc --noEmit --skipLibCheck --strictNullChecks`:
 *                    total errors, per-code and per-file breakdown (the code
 *                    fixes the migration must land before the flag flips).
 *   2. ESLint side — temporarily flips `"strictNullChecks": false` to `true`
 *                    in tsconfig.json (string surgery on the JSONC source,
 *                    restored in a finally block), then runs the same engine
 *                    as scripts/lint-ratchet.mjs (repo flat config + the four
 *                    force-tracked rules) PLUS the two rules parked in 1.7.10
 *                    (no-useless-default-assignment and
 *                    no-unnecessary-boolean-literal-compare emit real
 *                    findings only under SNC), in child batches. The report
 *                    answers:
 *                     - how much of the frozen no-unnecessary-condition pool
 *                       (1367 at 1.7.19) evaporates because "unnecessary"
 *                       null-checks become necessary;
 *                     - what the two parked rules would freeze as new debt;
 *                     - every other per-file/per-rule drift — i.e. the exact
 *                       re-freeze preview (same method as the 1.7.9 re-freeze:
 *                       flip, measure everything honestly, freeze, burn).
 *
 * Usage:
 *   node scripts/snc-probe.mjs                        full probe, console report
 *   node scripts/snc-probe.mjs --skip-tsc             ESLint side only
 *   node scripts/snc-probe.mjs --skip-eslint          tsc side only
 *   node scripts/snc-probe.mjs --batch=10             child batch size (default 12)
 *   node scripts/snc-probe.mjs --report-json=out.json machine-readable report
 *   node scripts/snc-probe.mjs --files-from=list.txt  SUBSET probe (parent mode:
 *                                                     only the listed files are
 *                                                     linted; the re-freeze
 *                                                     preview is then partial)
 *   node scripts/snc-probe.mjs --files-from=list.txt --emit-json=out.json
 *                                                     INTERNAL child mode
 *
 * Memory: on small machines run
 *   NODE_OPTIONS=--max-old-space-size=950 node scripts/snc-probe.mjs
 * (the option applies to the children as well); the tsc side needs a similar
 * heap under SNC. The ESLint side spawns one child per batch, each child
 * builds exactly one TypeScript program, like lint-ratchet's --batch mode.
 *
 * The probe never fails the build: exit 0 on success, 2 on tooling error.
 * If it is killed mid-run, restore the config with `git checkout tsconfig.json`.
 */
import { ESLint } from 'eslint'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(scriptPath), '..')
const BASELINE_PATH = join(repoRoot, 'eslint-baseline.json')
const TSCONFIG_PATH = join(repoRoot, 'tsconfig.json')
const SNC_OFF_MARKER = '"strictNullChecks": false'
const SNC_ON_MARKER = '"strictNullChecks": true'

// The four force-tracked debt rules (scripts/lint-ratchet.mjs).
const TRACKED_FORCED_RULES = {
	'@typescript-eslint/no-unsafe-assignment': 'error',
	'@typescript-eslint/no-unsafe-member-access': 'error',
	'@typescript-eslint/no-unsafe-call': 'error',
	'@typescript-eslint/no-unnecessary-condition': 'error',
}

// Parked in eslint.config.mjs (1.7.10): without strictNullChecks they emit
// only "This rule requires strictNullChecks" meta errors.
const PARKED_RULES = {
	'@typescript-eslint/no-useless-default-assignment': 'error',
	'@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
}

function parseArgs(argv) {
	const args = {
		batch: 12,
		skipTsc: false,
		skipEslint: false,
		filesFrom: null,
		emitJson: null,
		reportJson: null,
	}
	for (const arg of argv) {
		if (arg === '--skip-tsc') args.skipTsc = true
		else if (arg === '--skip-eslint') args.skipEslint = true
		else if (arg.startsWith('--batch=')) {
			args.batch = Number.parseInt(arg.slice('--batch='.length), 10)
			if (!Number.isInteger(args.batch) || args.batch < 1) {
				console.error(`snc-probe: invalid --batch value: ${arg}`)
				process.exit(2)
			}
		} else if (arg.startsWith('--files-from=')) args.filesFrom = arg.slice('--files-from='.length)
		else if (arg.startsWith('--emit-json=')) args.emitJson = arg.slice('--emit-json='.length)
		else if (arg.startsWith('--report-json=')) args.reportJson = arg.slice('--report-json='.length)
		else {
			console.error(`snc-probe: unknown argument: ${arg}`)
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

function mergeCounts(target, source) {
	for (const [file, rules] of Object.entries(source)) {
		target[file] = target[file] || {}
		for (const [rule, n] of Object.entries(rules)) {
			target[file][rule] = (target[file][rule] ?? 0) + n
		}
	}
	return target
}

function totalOf(counts) {
	let sum = 0
	for (const file of Object.keys(counts)) {
		for (const rule of Object.keys(counts[file])) sum += counts[file][rule]
	}
	return sum
}

/** Child mode: lint exactly the listed files with forced + parked rules. */
async function runChild(args) {
	const paths = readFileSync(args.filesFrom, 'utf8').trim().split('\n').filter(Boolean)
	const engine = new ESLint({
		cwd: repoRoot,
		overrideConfig: { rules: { ...TRACKED_FORCED_RULES, ...PARKED_RULES } },
	})
	const counts = countResults(await engine.lintFiles(paths))
	writeFileSync(args.emitJson, JSON.stringify(counts))
}

/** tsc side: error total, per-code and per-file breakdown under SNC. */
function runTscProbe() {
	const tscBin = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')
	const run = spawnSync(
		process.execPath,
		[tscBin, '--noEmit', '--skipLibCheck', '--strictNullChecks', '--pretty', 'false'],
		{ cwd: repoRoot, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
	)
	if (run.status === null || run.status > 2) {
		console.error(`snc-probe: tsc failed to run (exit ${run.status}, signal ${run.signal ?? 'none'})`)
		if (run.stderr) console.error(run.stderr.slice(0, 2000))
		process.exit(2)
	}
	const byCode = {}
	const byFile = {}
	let total = 0
	for (const line of (run.stdout || '').split('\n')) {
		const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+):/.exec(line)
		if (!m) continue
		total += 1
		byCode[m[4]] = (byCode[m[4]] || 0) + 1
		byFile[m[1]] = (byFile[m[1]] || 0) + 1
	}
	return { total, byCode, byFile }
}

/**
 * ESLint side: flip tsconfig to SNC, lint every src file in child batches,
 * restore tsconfig no matter what.
 */
function runEslintProbe(args) {
	const original = readFileSync(TSCONFIG_PATH, 'utf8')
	const occurrences = original.split(SNC_OFF_MARKER).length - 1
	if (occurrences !== 1) {
		console.error(
			`snc-probe: expected exactly one \`${SNC_OFF_MARKER}\` in tsconfig.json (found ${occurrences}); ` +
				'refusing to touch the file',
		)
		process.exit(2)
	}

	const files = args.filesFrom
		? readFileSync(args.filesFrom, 'utf8').trim().split('\n').filter(Boolean)
		: listSourceFiles().map((f) => toRepoPath(f))
	const tmpDir = mkdtempSync(join(tmpdir(), 'snc-probe-'))
	const counts = {}
	// NOTE: never process.exit() inside the try - it skips the finally block
	// and leaves tsconfig.json flipped. Failures are recorded and exited after
	// the restore.
	let childFailure = null
	try {
		writeFileSync(TSCONFIG_PATH, original.replace(SNC_OFF_MARKER, SNC_ON_MARKER))
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
				childFailure =
					`snc-probe: child lint process failed (exit ${child.status}, signal ${child.signal ?? 'none'}) ` +
					`on batch ${done + 1}/${batches}:\n  ${chunk.map((f) => basename(f)).join(', ')}\n` +
					'Retry with a smaller --batch, or raise the heap: NODE_OPTIONS=--max-old-space-size=950'
				break
			}
			mergeCounts(counts, JSON.parse(readFileSync(outPath, 'utf8')))
			done += 1
			process.stderr.write(`\rsnc-probe: eslint batch ${done}/${batches}`)
		}
		process.stderr.write('\n')
	} finally {
		writeFileSync(TSCONFIG_PATH, original)
		rmSync(tmpDir, { recursive: true, force: true })
	}
	if (childFailure) {
		console.error(childFailure)
		process.exit(2)
	}
	if (args.filesFrom) {
		console.error(`snc-probe: SUBSET probe - ${files.length} file(s) from ${args.filesFrom}`)
	}
	return { counts, files }
}

function buildReport(tsc, eslint, fullRun) {
	const counts = eslint ? eslint.counts : null
	const probedFiles = eslint ? eslint.files : null
	const report = { generatedAt: new Date().toISOString(), tsc: null, eslint: null }
	if (tsc) {
		const topFiles = Object.entries(tsc.byFile)
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, 15)
		report.tsc = {
			total: tsc.total,
			files: Object.keys(tsc.byFile).length,
			byCode: Object.fromEntries(Object.entries(tsc.byCode).sort((a, b) => b[1] - a[1])),
			topFiles: Object.fromEntries(topFiles),
		}
	}
	if (counts) {
		const fullBaseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files
		// In subset mode the comparison is scoped to the probed files -
		// counting unprobed baseline files as "vanished" would be a lie.
		const baseline = {}
		for (const f of probedFiles) {
			if (fullBaseline[f]) baseline[f] = fullBaseline[f]
		}
		const UNC = '@typescript-eslint/no-unnecessary-condition'
		const parked = Object.keys(PARKED_RULES)

		const ruleTotals = {}
		for (const rules of Object.values(counts)) {
			for (const [rule, n] of Object.entries(rules)) ruleTotals[rule] = (ruleTotals[rule] ?? 0) + n
		}
		const baselineTotals = {}
		for (const rules of Object.values(baseline)) {
			for (const [rule, n] of Object.entries(rules)) baselineTotals[rule] = (baselineTotals[rule] ?? 0) + n
		}

		// Per-file/per-rule drift, excluding the unc pool and the parked rules
		// (reported separately): everything else is what a re-freeze would
		// have to absorb on top of the shrunken unc pool.
		const driftIncreases = []
		const driftDecreases = []
		const files = new Set([...Object.keys(counts), ...Object.keys(baseline)])
		for (const file of [...files].sort()) {
			const cur = counts[file] ?? {}
			const base = baseline[file] ?? {}
			for (const rule of new Set([...Object.keys(cur), ...Object.keys(base)])) {
				if (rule === UNC || parked.includes(rule)) continue
				const c = cur[rule] ?? 0
				const b = base[rule] ?? 0
				if (c > b) driftIncreases.push({ file, rule, baseline: b, now: c })
				else if (c < b) driftDecreases.push({ file, rule, baseline: b, now: c })
			}
		}

		report.eslint = {
			unnecessaryCondition: {
				baseline: baselineTotals[UNC] ?? 0,
				underSnc: ruleTotals[UNC] ?? 0,
				vanished: (baselineTotals[UNC] ?? 0) - (ruleTotals[UNC] ?? 0),
			},
			parkedRulesUnderSnc: Object.fromEntries(parked.map((r) => [r, ruleTotals[r] ?? 0])),
			drift: {
				increases: driftIncreases,
				increasesTotal: driftIncreases.reduce((a, d) => a + (d.now - d.baseline), 0),
				decreases: driftDecreases,
				decreasesTotal: driftDecreases.reduce((a, d) => a + (d.baseline - d.now), 0),
			},
			refreezePreview: {
				scope: fullRun ? `full src (${probedFiles.length} files)` : `SUBSET (${probedFiles.length} probed files)`,
				total: totalOf(counts),
				files: Object.keys(counts).length,
				baselineTotal: totalOf(baseline),
				baselineFiles: Object.keys(baseline).length,
			},
		}
	}
	return report
}

function printReport(report) {
	console.log('=== strictNullChecks probe ===')
	if (report.tsc) {
		const t = report.tsc
		console.log(`\ntsc --strictNullChecks: ${t.total} errors in ${t.files} files`)
		console.log('  by code:')
		for (const [code, n] of Object.entries(t.byCode)) console.log(`    ${n.toString().padStart(4)}  ${code}`)
		console.log('  top files:')
		for (const [file, n] of Object.entries(t.topFiles)) console.log(`    ${n.toString().padStart(4)}  ${file}`)
	}
	if (report.eslint) {
		const e = report.eslint
		console.log('\nESLint under SNC (repo config + forced four + two parked rules):')
		console.log(
			`  no-unnecessary-condition pool (probed scope): ${e.unnecessaryCondition.baseline} -> ${e.unnecessaryCondition.underSnc} ` +
				`(${e.unnecessaryCondition.vanished} vanish as null-checks become necessary)`,
		)
		for (const [rule, n] of Object.entries(e.parkedRulesUnderSnc)) {
			console.log(`  parked rule ${rule}: ${n} real findings under SNC`)
		}
		console.log(
			`  other-rule drift: +${e.drift.increasesTotal} new / -${e.drift.decreasesTotal} gone ` +
				`(${e.drift.increases.length} increases, ${e.drift.decreases.length} decreases across files)`,
		)
		const preview = e.refreezePreview
		console.log(
			`  RE-FREEZE PREVIEW [${preview.scope}]: ${preview.total} errors in ${preview.files} files ` +
				`vs baseline ${preview.baselineTotal} in ${preview.baselineFiles} (same scope)`,
		)
		if (e.drift.increases.length > 0) {
			console.log('  drift increases (top 20):')
			for (const d of e.drift.increases.slice(0, 20)) {
				console.log(`    ${d.file} ${d.rule}: ${d.baseline} -> ${d.now}`)
			}
		}
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2))

	if (args.filesFrom && args.emitJson) {
		await runChild(args)
		return
	}
	if (!args.filesFrom && args.emitJson) {
		console.error('snc-probe: --emit-json requires --files-from (child mode)')
		process.exit(2)
	}

	const tsc = args.skipTsc ? null : runTscProbe()
	const eslint = args.skipEslint ? null : runEslintProbe(args)
	const report = buildReport(tsc, eslint, !args.filesFrom)
	printReport(report)
	if (args.reportJson) {
		writeFileSync(args.reportJson, JSON.stringify(report, null, '\t') + '\n')
		console.log(`\nsnc-probe: report written to ${args.reportJson}`)
	}
}

main().catch((error) => {
	console.error('snc-probe: tooling failure:', error)
	process.exit(2)
})

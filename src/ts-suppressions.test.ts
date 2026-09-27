/**
 * TypeScript suppression debt ratchet (ROADMAP phase 2, pass 2 - item 3).
 *
 * Every `ts-nocheck` / `ts-ignore` / `ts-expect-error` marker under src/ is
 * counted and compared against the frozen ledger in
 * ts-suppressions-baseline.json. The match must be EXACT:
 *
 *   - a new suppression (or a new count) fails the build - suppressions may
 *     not grow, full stop;
 *   - a burned-down suppression fails too, until the baseline is shrunk in
 *     the same commit: `node scripts/ts-suppressions.mjs --update`.
 *
 * Policy (docs/ts-suppressions.md): blanket nocheck is forbidden in new
 * files and is being removed from core modules; targeted expect-error must
 * carry a description.
 *
 * NOTE: the marker strings below are assembled at runtime on purpose - this
 * test lives under src/ and is scanned by itself, so literal markers here
 * would count as debt.
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, relative, resolve, sep } from 'path'
import { z } from 'zod'

const repoRoot = resolve(__dirname, '..')
const baselinePath = join(repoRoot, 'ts-suppressions-baseline.json')

const markerNames = ['nocheck', 'ignore', 'expectError'] as const
type MarkerName = (typeof markerNames)[number]
type Counts = Partial<Record<MarkerName, number>>

const markers: ReadonlyArray<readonly [MarkerName, RegExp]> = [
	['nocheck', new RegExp(['@ts', 'nocheck'].join('-'), 'g')],
	['ignore', new RegExp(['@ts', 'ignore'].join('-'), 'g')],
	['expectError', new RegExp(['@ts', 'expect', 'error'].join('-'), 'g')],
]

const countsSchema = z.object({
	nocheck: z.number().int().min(0).optional(),
	ignore: z.number().int().min(0).optional(),
	expectError: z.number().int().min(0).optional(),
})
const baselineSchema = z.object({
	$comment: z.string().optional(),
	files: z.record(z.string(), countsSchema),
})

function listSourceFiles(): string[] {
	const out: string[] = []
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name)
			if (entry.isDirectory()) {
				walk(full)
			} else if (/\.(ts|tsx)$/.test(entry.name)) {
				out.push(full)
			}
		}
	}
	walk(join(repoRoot, 'src'))
	return out.sort()
}

function scan(): Record<string, Counts> {
	const files: Record<string, Counts> = {}
	for (const full of listSourceFiles()) {
		const text = readFileSync(full, 'utf8')
		const counts: Counts = {}
		for (const [name, pattern] of markers) {
			const found = text.match(pattern)
			if (found !== null && found.length > 0) {
				counts[name] = found.length
			}
		}
		if (Object.keys(counts).length > 0) {
			files[relative(repoRoot, full).split(sep).join('/')] = counts
		}
	}
	return files
}

function totalOf(counts: Counts): number {
	let sum = 0
	for (const name of markerNames) {
		sum += counts[name] ?? 0
	}
	return sum
}

describe('TypeScript suppression debt ratchet', () => {
	it('has a committed baseline file', () => {
		expect(existsSync(baselinePath)).toBe(true)
	})

	const rawJson: unknown = existsSync(baselinePath)
		? JSON.parse(readFileSync(baselinePath, 'utf8'))
		: { files: {} }
	const baseline = baselineSchema.parse(rawJson)
	const current = scan()

	it('matches the frozen baseline exactly (no new suppressions, no stale entries)', () => {
		const problems: string[] = []
		const paths = new Set([...Object.keys(current), ...Object.keys(baseline.files)])
		for (const path of [...paths].sort()) {
			const cur = current[path] ?? {}
			const base = baseline.files[path] ?? {}
			for (const name of markerNames) {
				const c = cur[name] ?? 0
				const b = base[name] ?? 0
				if (c > b) {
					problems.push(
						`NEW suppression: ${path} ts-${name === 'expectError' ? 'expect-error' : name}: baseline ${b}, now ${c}`,
					)
				} else if (c < b) {
					problems.push(
						`stale baseline: ${path} ts-${name === 'expectError' ? 'expect-error' : name}: baseline ${b}, now ${c} - shrink it with: node scripts/ts-suppressions.mjs --update`,
					)
				}
			}
		}
		expect(problems).toEqual([])
	})

	it('baseline carries no zero-total or empty entries', () => {
		const offenders = Object.entries(baseline.files)
			.filter(([, counts]) => Object.keys(counts).length === 0 || totalOf(counts) === 0)
			.map(([path]) => path)
		expect(offenders).toEqual([])
	})
})

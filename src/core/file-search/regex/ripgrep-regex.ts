import { Platform } from 'obsidian'
import * as childProcess from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import { z } from 'zod'

import {
	MAX_RESULTS,
	SearchResult,
	formatResults,
	truncateLine
} from '../search-common'
import { logger } from '../../../utils/logger'

const isWindows = /^win/.test(process.platform)
const binName = isWindows ? "rg.exe" : "rg"

async function getBinPath(ripgrepPath: string): Promise<string | undefined> {
	const binPath = path.join(ripgrepPath, binName)
	return (await pathExists(binPath)) ? binPath : undefined
}

async function pathExists(path: string): Promise<boolean> {
	return new Promise((resolve) => {
		fs.access(path, (err) => {
			resolve(err === null)
		})
	})
}

/**
 * The most common real-world cause of a spawn failure: ripgrep is simply
 * not installed (the field case on Windows). Name the install command.
 */
function ripgrepInstallHint(): string {
	if (Platform.isWin) {
		return (
			'If ripgrep is not installed on this machine, install it with: ' +
			'winget install BurntSushi.ripgrep.MSVC (PowerShell), then set the ' +
			'path again or restart Obsidian.'
		)
	}
	return (
		'If ripgrep is not installed on this machine, install it with your ' +
		'package manager (brew install ripgrep on macOS, apt/dnf/pacman install ' +
		'ripgrep on Linux), then set the path again.'
	)
}

async function execRipgrep(bin: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const rgProcess = childProcess.spawn(bin, args)
		// cross-platform alternative to head, which is ripgrep author's recommendation for limiting output.
		const rl = readline.createInterface({
			input: rgProcess.stdout,
			crlfDelay: Infinity, // treat \r\n as a single line break even if it's split across chunks. This ensures consistent behavior across different operating systems.
		})

		let output = ""
		let lineCount = 0
		const maxLines = MAX_RESULTS * 5 // limiting ripgrep output with max lines since there's no other way to limit results. it's okay that we're outputting as json, since we're parsing it line by line and ignore anything that's not part of a match. This assumes each result is at most 5 lines.

		rl.on("line", (line) => {
			if (lineCount < maxLines) {
				output += line + "\n"
				lineCount++
			} else {
				rl.close()
				rgProcess.kill()
			}
		})

		let errorOutput = ""
		rgProcess.stderr.on("data", (data: unknown) => {
			// stderr is a Buffer stream by default; keep the previous utf8 text
			// accumulation without going through `any` (EventEmitter listeners
			// are typed loosely by Node, so the parameter is narrowed here).
			if (typeof data === 'string') {
				errorOutput += data
			} else if (Buffer.isBuffer(data)) {
				errorOutput += data.toString('utf8')
			}
		})
		rl.on("close", () => {
			if (errorOutput) {
				reject(new Error(`ripgrep process error: ${errorOutput}`))
			} else {
				resolve(output)
			}
		})
		rgProcess.on("error", (error) => {
			reject(new Error(
				`ripgrep process error: ${error.message} (binary: ${bin}). ` +
				'Check Settings -> Infio Copilot Free -> Files search: the ripgrep ' +
				'path must point to a runnable rg executable, or switch the regex ' +
				'search backend to the built-in plugin. ' +
				ripgrepInstallHint(),
			))
		})
	})
}

/**
 * ripgrep `--json` writes one record per line. Every record shares the
 * `{ type, data }` envelope; only `match` (a hit) and `context` (the
 * `--context 1` neighbours) carry a `lines.text` payload this module uses,
 * while `begin`/`end`/`summary` are skipped. The two shapes are narrowed by
 * Zod at the process boundary so `JSON.parse`'s `any` never reaches the
 * result builder (phase 2, "types at the boundaries").
 */
const RipgrepMatchSchema = z.object({
	type: z.literal('match'),
	data: z.object({
		path: z.object({ text: z.string() }),
		lines: z.object({ text: z.string() }),
		line_number: z.number(),
		// ripgrep always reports at least one submatch per match record; an
		// empty list would have thrown on `submatches[0].start` before, so the
		// schema treats it as a malformed record instead.
		submatches: z.array(z.object({ start: z.number() })).min(1),
	}),
})

const RipgrepContextSchema = z.object({
	type: z.literal('context'),
	data: z.object({
		lines: z.object({ text: z.string() }),
		line_number: z.number(),
	}),
})

/**
 * Turns raw `rg --json` output into the result list consumed by
 * `formatResults`. Context lines are attached to the preceding match: those
 * below its line number go to `beforeContext`, the rest to `afterContext`.
 *
 * Malformed JSON lines are logged and skipped (same fallback as before);
 * well-formed records of other types are ignored silently.
 */
export function parseRipgrepOutput(output: string): SearchResult[] {
	const results: SearchResult[] = []
	let currentResult: SearchResult | null = null

	for (const line of output.split('\n')) {
		if (!line) continue

		let payload: unknown
		try {
			payload = JSON.parse(line)
		} catch (error) {
			logger.error("Error parsing ripgrep output:", error)
			continue
		}

		const match = RipgrepMatchSchema.safeParse(payload)
		if (match.success) {
			if (currentResult !== null) {
				results.push(currentResult)
			}
			currentResult = {
				file: match.data.data.path.text,
				// Safety check: truncate extremely long lines to prevent excessive output
				match: truncateLine(match.data.data.lines.text),
				line: match.data.data.line_number,
				column: match.data.data.submatches[0].start,
				beforeContext: [],
				afterContext: [],
			}
			continue
		}

		const context = RipgrepContextSchema.safeParse(payload)
		if (!context.success || currentResult === null) continue

		const truncatedContext = truncateLine(context.data.data.lines.text)
		if (context.data.data.line_number < currentResult.line) {
			currentResult.beforeContext.push(truncatedContext)
		} else {
			currentResult.afterContext.push(truncatedContext)
		}
	}

	if (currentResult !== null) {
		results.push(currentResult)
	}

	return results
}

export async function regexSearchUsingRipgrep(
	directoryPath: string,
	regex: string,
	ripgrepPath: string,
	configDirName: string,
): Promise<string> {
	const rgPath = await getBinPath(ripgrepPath)

	if (!rgPath) {
		throw new Error("Could not find ripgrep binary")
	}

	// use --glob param to exclude .obsidian directory
	const args = [
		"--json", 
		"-e", 
		regex, 
		"--glob", 
		`!${configDirName}/**`, // exclude the vault config directory (not necessarily .obsidian)
		"--glob",
		"!.git/**",
		"--context", 
		"1", 
		directoryPath
	]

	let output: string
	try {
		output = await execRipgrep(rgPath, args)
	} catch (error) {
		logger.error("Error executing ripgrep:", error)
		return "No results found."
	}

	return formatResults(parseRipgrepOutput(output), directoryPath)
}

// import * as vscode from "vscode"
import * as childProcess from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import {
	MAX_RESULTS,
	truncateLine,
	SearchResult,
	formatResults
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
		rgProcess.stderr.on("data", (data) => {
			errorOutput += data.toString()
		})
		rl.on("close", () => {
			if (errorOutput) {
				reject(new Error(`ripgrep process error: ${errorOutput}`))
			} else {
				resolve(output)
			}
		})
		rgProcess.on("error", (error) => {
			reject(new Error(`ripgrep process error: ${error.message}`))
		})
	})
}

export async function regexSearchUsingRipgrep(
	directoryPath: string,
	regex: string,
	ripgrepPath: string,
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
		"!.obsidian/**", // exclude .obsidian directory and all its subdirectories
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
	const results: SearchResult[] = []
	let currentResult: Partial<SearchResult> | null = null

	output.split("\n").forEach((line) => {
		if (line) {
			try {
				const parsed = JSON.parse(line)
				if (parsed.type === "match") {
					if (currentResult) {
						results.push(currentResult as SearchResult)
					}

					// Safety check: truncate extremely long lines to prevent excessive output
					const matchText = parsed.data.lines.text
					const truncatedMatch = truncateLine(matchText)

					currentResult = {
						file: parsed.data.path.text,
						line: parsed.data.line_number,
						column: parsed.data.submatches[0].start,
						match: truncatedMatch,
						beforeContext: [],
						afterContext: [],
					}
				} else if (parsed.type === "context" && currentResult) {
					// Apply the same truncation logic to context lines
					const contextText = parsed.data.lines.text
					const truncatedContext = truncateLine(contextText)

					if (parsed.data.line_number < currentResult.line!) {
						currentResult.beforeContext!.push(truncatedContext)
					} else {
						currentResult.afterContext!.push(truncatedContext)
					}
				}
			} catch (error) {
				logger.error("Error parsing ripgrep output:", error)
			}
		}
	})

	if (currentResult) {
		results.push(currentResult as SearchResult)
	}
	
	return formatResults(results, directoryPath)
}

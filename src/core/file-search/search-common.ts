import * as path from "path"

// Constants
export const MAX_RESULTS = 300
export const MAX_LINE_LENGTH = 500

/**
 * Truncates a line if it exceeds the maximum length
 * @param line The line to truncate
 * @param maxLength The maximum allowed length (defaults to MAX_LINE_LENGTH)
 * @returns The truncated line, or the original line if it's shorter than maxLength
 */
export function truncateLine(line: string, maxLength: number = MAX_LINE_LENGTH): string {
	return line.length > maxLength ? line.substring(0, maxLength) + " [truncated...]" : line
}

/**
 * Finds the line number and content for a given character offset within a file's content.
 * @param lines All lines in the file.
 * @param offset The character offset of the match.
 * @returns An object with line number, column number, and the full line content.
 */
export function findLineDetails(
	lines: string[],
	offset: number
): { lineNumber: number; columnNumber: number; lineContent: string } {
	let charCount = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// The line ending length (1 for \n, 2 for \r\n) can vary.
		// A simple +1 is a reasonable approximation for this calculation.
		const lineEndOffset = charCount + line.length + 1; 

		if (offset < lineEndOffset) {
			const columnNumber = offset - charCount;
			return { lineNumber: i, columnNumber, lineContent: line };
		}
		charCount = lineEndOffset;
	}
	return { lineNumber: -1, columnNumber: -1, lineContent: "" };
}

export interface SearchResult {
	file: string
	line: number
	column?: number
	match?: string
	beforeContext: string[]
	afterContext: string[]
}

export function formatResults(results: SearchResult[], cwd: string): string {
	const groupedResults: { [key: string]: SearchResult[] } = {}

	let output = ""
	if (results.length >= MAX_RESULTS) {
		output += `Showing first ${String(MAX_RESULTS)} of ${String(MAX_RESULTS)}+ results. Use a more specific search if necessary.\n\n`
	} else {
		output += `Found ${results.length === 1 ? "1 result" : `${results.length.toLocaleString()} results`}.\n\n`
	}

	// Group results by file name
	results.slice(0, MAX_RESULTS).forEach((result) => {
		const relativeFilePath = path.relative(cwd, result.file)
		if (!groupedResults[relativeFilePath]) {
			groupedResults[relativeFilePath] = []
		}
		groupedResults[relativeFilePath].push(result)
	})

	for (const [filePath, fileResults] of Object.entries(groupedResults)) {
		output += `${filePath.toPosix()}\n│----\n`

		fileResults.forEach((result, index) => {
			const allLines = [...result.beforeContext, result.match, ...result.afterContext]
			allLines.forEach((line) => {
				output += `│${line?.trimEnd() ?? ""}\n`
			})

			if (index < fileResults.length - 1) {
				output += "│----\n"
			}
		})

		output += "│----\n\n"
	}

	return output.trim()
}
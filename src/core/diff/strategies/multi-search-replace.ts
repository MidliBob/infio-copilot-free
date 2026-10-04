import { distance } from "fastest-levenshtein"

import { addLineNumbers, everyLineHasLineNumbers, stripLineNumbers } from "../../../utils/extract-text"
// import { ToolProgressStatus } from "../../../shared/ExtensionMessage"
// import { ToolUse } from "../../assistant-message"
import { DiffResult, DiffStrategy } from "../types"

const BUFFER_LINES = 40 // Number of extra context lines to show before and after matches

function getSimilarity(original: string, search: string): number {
	if (search === "") {
		return 1
	}

	// Normalize strings by removing extra whitespace but preserve case
	const normalizeStr = (str: string) => str.replace(/\s+/g, " ").trim()

	const normalizedOriginal = normalizeStr(original)
	const normalizedSearch = normalizeStr(search)

	if (normalizedOriginal === normalizedSearch) {
		return 1
	}

	// Calculate Levenshtein distance using fastest-levenshtein's distance function
	const dist = distance(normalizedOriginal, normalizedSearch)

	// Calculate similarity ratio (0 to 1, where 1 is an exact match)
	const maxLength = Math.max(normalizedOriginal.length, normalizedSearch.length)
	return 1 - dist / maxLength
}

export class MultiSearchReplaceDiffStrategy implements DiffStrategy {
	private fuzzyThreshold: number
	private bufferLines: number

	getName(): string {
		return "MultiSearchReplace"
	}

	constructor(fuzzyThreshold?: number, bufferLines?: number) {
		// Use provided threshold or default to exact matching (1.0)
		// Note: fuzzyThreshold is inverted in UI (0% = 1.0, 10% = 0.9)
		// so we use it directly here
		this.fuzzyThreshold = fuzzyThreshold ?? 1.0
		this.bufferLines = bufferLines ?? BUFFER_LINES
	}

	getToolDescription(args: { cwd: string; toolOptions?: { [key: string]: string } }): string {
		return `## apply_diff
Description: Request to replace existing content in Markdown documents using a search and replace block.
This tool allows for precise modifications to Markdown files by specifying exactly what content to search for and what to replace it with.
The tool will maintain proper formatting while making changes to your Markdown documents.
Only a single operation is allowed per tool use.
The SEARCH section must exactly match existing content including whitespace and indentation.
If you're not confident in the exact content to search for, use the read_file tool first to get the exact content.
When applying changes to Markdown, be careful about maintaining list structures, heading levels, and other Markdown formatting.
**IMPORTANT STRATEGY**: Use this tool ONLY for modifying specific, contiguous blocks of text. 
- **STRICT 20-LINE LIMIT**: Each SEARCH block MUST NOT exceed 20 lines. This is a hard limit to ensure accuracy and avoid errors.
- **For larger changes**: If a single block of changes is more than 20 lines, or if you are rewriting most of the file, you MUST use \`write_to_file\` instead.
- **For scattered changes**: If you need to make the same small change in many different places, use \`search_and_replace\` as it is more efficient.

ALWAYS make as many changes in a single 'apply_diff' request as possible using multiple SEARCH/REPLACE blocks, but respect the 20-line limit per block.

Parameters:
- path: (required) The path of the file to modify
- diff: (required) The search/replace block defining the changes.

Diff format:
\`\`\`
<<<<<<< SEARCH
:start_line: (required) The line number of original content where the search block starts.
:end_line: (required) The line number of original content where the search block ends.
-------
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE

Usage:
<apply_diff>
<path>File path here</path>
<diff>
Your search/replace content here
Only use a single line of '=======' between search and replacement content.
</diff>
</apply_diff>

Example1: CORRECT - Making multiple, small, independent changes in one call.
This is efficient for applying several unrelated fixes. Notice that each block is very small and respects the 20-line limit.

<apply_diff>
<path>notes.md</path>
<diff>
<<<<<<< SEARCH
:start_line:1
:end_line:1
-------
# Meeting Notes
=======
# Strategic Meeting Notes
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line:4
:end_line:4
-------
- Discuss Q3 roadmap
=======
- Finalize Q3 roadmap
>>>>>>> REPLACE
</diff>
</apply_diff>

Example 2: INCORRECT USAGE (ANTI-PATTERN) - The diff block is too large.
This demonstrates what NOT to do. A diff block of this size MUST BE REJECTED.

<apply_diff>
<path>long_file.md</path>
<diff>
<<<<<<< SEARCH
:start_line:10
:end_line:45
-------
... (35 lines of text to be replaced) ...
=======
... (new content) ...
>>>>>>> REPLACE
</diff>
</apply_diff>
`
	}

	async applyDiff(
		originalContent: string,
		diffContent: string,
		_paramStartLine?: number,
		_paramEndLine?: number,
	): Promise<DiffResult> {
		const matches = [
			...diffContent.matchAll(
				/<<<<<<< SEARCH\n(:start_line:\s*(\d+)\n){0,1}(:end_line:\s*(\d+)\n){0,1}(-------\n){0,1}([\s\S]*?)\n?=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g,
			),
		]

		if (matches.length === 0) {
			return {
				success: false,
				error: `Invalid diff format - missing required sections\n\nDebug Info:\n- Expected Format: <<<<<<< SEARCH\\n:start_line: start line\\n:end_line: end line\\n-------\\n[search content]\\n=======\\n[replace content]\\n>>>>>>> REPLACE\n- Tip: Make sure to include start_line/end_line/SEARCH/REPLACE sections with correct markers`,
			}
		}
		// Detect line ending from original content
		const lineEnding = originalContent.includes("\r\n") ? "\r\n" : "\n"
		let resultLines = originalContent.split(/\r?\n/)
		let delta = 0
		const diffResults: DiffResult[] = []
		let appliedCount = 0
		const replacements = matches
			.map((match) => ({
				startLine: Number(match[2] ?? 0),
				endLine: Number(match[4] ?? resultLines.length),
				searchContent: match[6],
				replaceContent: match[7],
			}))
			.sort((a, b) => a.startLine - b.startLine)

		for (let { searchContent, replaceContent, startLine, endLine } of replacements) {
			startLine += startLine === 0 ? 0 : delta
			endLine += delta

			// Strip line numbers from search and replace content if every line starts with a line number
			if (everyLineHasLineNumbers(searchContent) && everyLineHasLineNumbers(replaceContent)) {
				searchContent = stripLineNumbers(searchContent)
				replaceContent = stripLineNumbers(replaceContent)
			}

			// Split content into lines, handling both \n and \r\n
			const searchLines = searchContent === "" ? [] : searchContent.split(/\r?\n/)
			const replaceLines = replaceContent === "" ? [] : replaceContent.split(/\r?\n/)

			// Validate that empty search requires start line
			if (searchLines.length === 0 && !startLine) {
				diffResults.push({
					success: false,
					error: `Empty search content requires start_line to be specified\n\nDebug Info:\n- Empty search content is only valid for insertions at a specific line\n- For insertions, specify the line number where content should be inserted`,
				})
				continue
			}

			// Validate that empty search requires same start and end line
			if (searchLines.length === 0 && startLine && endLine && startLine !== endLine) {
				diffResults.push({
					success: false,
					error: `Empty search content requires start_line and end_line to be the same (got ${String(startLine)}-${String(endLine)})\n\nDebug Info:\n- Empty search content is only valid for insertions at a specific line\n- For insertions, use the same line number for both start_line and end_line`,
				})
				continue
			}

			// Initialize search variables
			let matchIndex = -1
			let bestMatchScore = 0
			let bestMatchContent = ""
			const searchChunk = searchLines.join("\n")

			// Determine search bounds
			let searchStartIndex = 0
			let searchEndIndex = resultLines.length

			// Validate and handle line range if provided
			if (startLine && endLine) {
				// Convert to 0-based index
				const exactStartIndex = startLine - 1
				const exactEndIndex = endLine - 1

				if (exactStartIndex < 0 || exactEndIndex > resultLines.length || exactStartIndex > exactEndIndex) {
					diffResults.push({
						success: false,
						error: `Line range ${String(startLine)}-${String(endLine)} is invalid (file has ${String(resultLines.length)} lines)\n\nDebug Info:\n- Requested Range: lines ${String(startLine)}-${String(endLine)}\n- File Bounds: lines 1-${String(resultLines.length)}`,
					})
					continue
				}

				// Try exact match first
				const originalChunk = resultLines.slice(exactStartIndex, exactEndIndex + 1).join("\n")
				const similarity = getSimilarity(originalChunk, searchChunk)
				if (similarity >= this.fuzzyThreshold) {
					matchIndex = exactStartIndex
					bestMatchScore = similarity
					bestMatchContent = originalChunk
				} else {
					// Set bounds for buffered search
					searchStartIndex = Math.max(0, startLine - (this.bufferLines + 1))
					searchEndIndex = Math.min(resultLines.length, endLine + this.bufferLines)
				}
			}

			// If no match found yet, try middle-out search within bounds
			if (matchIndex === -1) {
				const midPoint = Math.floor((searchStartIndex + searchEndIndex) / 2)
				let leftIndex = midPoint
				let rightIndex = midPoint + 1

				// Search outward from the middle within bounds
				while (leftIndex >= searchStartIndex || rightIndex <= searchEndIndex - searchLines.length) {
					// Check left side if still in range
					if (leftIndex >= searchStartIndex) {
						const originalChunk = resultLines.slice(leftIndex, leftIndex + searchLines.length).join("\n")
						const similarity = getSimilarity(originalChunk, searchChunk)
						if (similarity > bestMatchScore) {
							bestMatchScore = similarity
							matchIndex = leftIndex
							bestMatchContent = originalChunk
						}
						leftIndex--
					}

					// Check right side if still in range
					if (rightIndex <= searchEndIndex - searchLines.length) {
						const originalChunk = resultLines.slice(rightIndex, rightIndex + searchLines.length).join("\n")
						const similarity = getSimilarity(originalChunk, searchChunk)
						if (similarity > bestMatchScore) {
							bestMatchScore = similarity
							matchIndex = rightIndex
							bestMatchContent = originalChunk
						}
						rightIndex++
					}
				}
			}

			// Require similarity to meet threshold
			if (matchIndex === -1 || bestMatchScore < this.fuzzyThreshold) {
				const searchChunk = searchLines.join("\n")
				const originalContentSection =
					startLine !== undefined && endLine !== undefined
						? `\n\nOriginal Content:\n${addLineNumbers(
							resultLines
								.slice(
									Math.max(0, startLine - 1 - this.bufferLines),
									Math.min(resultLines.length, endLine + this.bufferLines),
								)
								.join("\n"),
							Math.max(1, startLine - this.bufferLines),
						)}`
						: `\n\nOriginal Content:\n${addLineNumbers(resultLines.join("\n"))}`

				const bestMatchSection = bestMatchContent
					? `\n\nBest Match Found:\n${addLineNumbers(bestMatchContent, matchIndex + 1)}`
					: `\n\nBest Match Found:\n(no match)`

				const lineRange =
					startLine || endLine
						? ` at ${startLine ? `start: ${String(startLine)}` : "start"} to ${endLine ? `end: ${String(endLine)}` : "end"}`
						: ""

				diffResults.push({
					success: false,
					error: `No sufficiently similar match found${lineRange} (${String(Math.floor(bestMatchScore * 100))}% similar, needs ${String(Math.floor(this.fuzzyThreshold * 100))}%)\n\nDebug Info:\n- Similarity Score: ${String(Math.floor(bestMatchScore * 100))}%\n- Required Threshold: ${String(Math.floor(this.fuzzyThreshold * 100))}%\n- Search Range: ${startLine && endLine ? `lines ${String(startLine)}-${String(endLine)}` : "start to end"}\n- Tip: Use read_file to get the latest content of the file before attempting the diff again, as the file content may have changed\n\nSearch Content:\n${searchChunk}${bestMatchSection}${originalContentSection}`,
				})
				continue
			}

			// Get the matched lines from the original content
			const matchedLines = resultLines.slice(matchIndex, matchIndex + searchLines.length)

			// Get the exact indentation (preserving tabs/spaces) of each line
			const indentRegex = /^[\t ]*/
			const originalIndents = matchedLines.map((line) => {
				const match = indentRegex.exec(line)
				return match ? match[0] : ""
			})

			// Get the exact indentation of each line in the search block
			const searchIndents = searchLines.map((line) => {
				const match = indentRegex.exec(line)
				return match ? match[0] : ""
			})

			// Apply the replacement while preserving exact indentation
			const indentedReplaceLines = replaceLines.map((line) => {
				// Get the matched line's exact indentation
				const matchedIndent = originalIndents[0] || ""

				// Get the current line's indentation relative to the search content
				const currentIndentMatch = indentRegex.exec(line)
				const currentIndent = currentIndentMatch ? currentIndentMatch[0] : ""
				const searchBaseIndent = searchIndents[0] || ""

				// Calculate the relative indentation level
				const searchBaseLevel = searchBaseIndent.length
				const currentLevel = currentIndent.length
				const relativeLevel = currentLevel - searchBaseLevel

				// If relative level is negative, remove indentation from matched indent
				// If positive, add to matched indent
				const finalIndent =
					relativeLevel < 0
						? matchedIndent.slice(0, Math.max(0, matchedIndent.length + relativeLevel))
						: matchedIndent + currentIndent.slice(searchBaseLevel)

				return finalIndent + line.trim()
			})

			// Construct the final content
			const beforeMatch = resultLines.slice(0, matchIndex)
			const afterMatch = resultLines.slice(matchIndex + searchLines.length)
			resultLines = [...beforeMatch, ...indentedReplaceLines, ...afterMatch]
			delta = delta - matchedLines.length + replaceLines.length
			appliedCount++
		}
		const finalContent = resultLines.join(lineEnding)
		if (appliedCount === 0) {
			return {
				success: false,
				failParts: diffResults,
			}
		}
		return {
			success: true,
			content: finalContent,
			failParts: diffResults,
		}
	}

	// getProgressStatus(toolUse: ToolUse, result?: DiffResult): ToolProgressStatus {
	// 	const diffContent = toolUse.params.diff
	// 	if (diffContent) {
	// 		const icon = "diff-multiple"
	// 		const searchBlockCount = (diffContent.match(/SEARCH/g) || []).length
	// 		if (toolUse.partial) {
	// 			if (diffContent.length < 1000 || (diffContent.length / 50) % 10 === 0) {
	// 				return { icon, text: `${searchBlockCount}` }
	// 			}
	// 		} else if (result) {
	// 			if (result.failParts?.length) {
	// 				return {
	// 					icon,
	// 					text: `${searchBlockCount - result.failParts.length}/${searchBlockCount}`,
	// 				}
	// 			} else {
	// 				return { icon, text: `${searchBlockCount}` }
	// 			}
	// 		}
	// 	}
	// 	return {}
	// }
}

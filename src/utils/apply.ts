
import { SearchAndReplaceToolArgs } from '../types/apply';
import { logger } from './logger'

/**
 * Applies changes to a file by replacing content within specified line range
 * @param updateContent - The new content to insert
 * @param currentFile - The file being modified
 * @param rawContent - The current content of the file
 * @param startLine - Starting line number (1-based indexing, optional)
 * @param endLine - Ending line number (1-based indexing, optional)
 * @returns Promise resolving to the modified content or null if operation fails
 */
export const ApplyEditToFile = async (
	rawContent: string,
	updateContent: string,
	startLine?: number,
	endLine?: number,
): Promise<string | null> => {
	try {
		// if file is empty, return new content
		if (!rawContent || rawContent.trim() === '') {
			return updateContent;
		}

		// if content is empty, return empty string
		if (updateContent === '') {
			return '';
		}

		const lines = rawContent.split('\n')
		const effectiveStartLine = Math.max(1, startLine ?? 1)
		const effectiveEndLine = Math.min(endLine ?? lines.length, lines.length)

		// Validate line numbers
		if (effectiveStartLine > effectiveEndLine) {
			throw new Error('Start line cannot be greater than end line')
		}

		// Construct new content
		return [
			...lines.slice(0, effectiveStartLine - 1),
			updateContent,
			...lines.slice(effectiveEndLine)
		].join('\n')
	} catch (error) {
		logger.error('Error applying changes:', error instanceof Error ? error.message : 'Unknown error')
		return null
	}
}


function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 搜索和替换文件内容
 * @param currentFile - 当前文件
 * @param rawContent - 当前文件内容
 * @param search - 搜索内容
 * @param replace - 替换内容
 */
export const SearchAndReplace = async (
	rawContent: string,
	operations: SearchAndReplaceToolArgs['operations']
) => {
	let lines = rawContent.split("\n")

	for (const op of operations) {
		const flags = op.regexFlags ?? (op.ignoreCase ? "gi" : "g")
		const multilineFlags = flags.includes("m") ? flags : flags + "m"

		const searchPattern = op.useRegex
			? new RegExp(op.search, multilineFlags)
			: new RegExp(escapeRegExp(op.search), multilineFlags)

		if (op.startLine || op.endLine) {
			const startLine = Math.max((op.startLine ?? 1) - 1, 0)
			const endLine = Math.min((op.endLine ?? lines.length) - 1, lines.length - 1)

			// Get the content before and after the target section
			const beforeLines = lines.slice(0, startLine)
			const afterLines = lines.slice(endLine + 1)

			// Get the target section and perform replacement
			const targetContent = lines.slice(startLine, endLine + 1).join("\n")
			const modifiedContent = targetContent.replace(searchPattern, op.replace)
			const modifiedLines = modifiedContent.split("\n")

			// Reconstruct the full content with the modified section
			lines = [...beforeLines, ...modifiedLines, ...afterLines]
		} else {
			// Global replacement
			const fullContent = lines.join("\n")
			const modifiedContent = fullContent.replace(searchPattern, op.replace)
			lines = modifiedContent.split("\n")
		}
	}

	const newContent = lines.join("\n")
	return newContent;
}

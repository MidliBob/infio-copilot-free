/**
 * Parser for Infio Copilot Format (ICF) blocks inside assistant markdown.
 *
 * Chat messages render through this parser (ReactMarkdown) and the
 * one-click Apply buttons reuse the very same field values, so everything
 * extracted here must survive a verbatim round-trip:
 *
 * - Content payloads (thinking / think / communication / tool_result /
 *   write_to_file content / apply_diff diff / attempt_completion result /
 *   ask_followup_question question / switch_mode reason) are taken as a RAW
 *   source slice between the first and last child node. File contents and
 *   diffs legitimately contain HTML-like markup (JSX, Vue templates, XML)
 *   and entity-looking sequences; the previous text-node extraction dropped
 *   nested markup and decoded entities, silently corrupting Apply output.
 * - JSON payloads (insert_content / search_and_replace operations,
 *   use_mcp_tool parameters, fetch_urls_content urls, manage_files
 *   operations) go through runtime validators: a malformed or unexpected
 *   shape degrades to an empty value (with a log line) instead of poisoning
 *   the React tree (`.map` on a non-array used to crash message rendering)
 *   or the Apply tool-args.
 * - Short identifier-like fields (path / query / regex / mode_slug / ...)
 *   read the first text child, as before.
 *
 * Streaming: an unclosed block tag still parses (parse5 auto-closes it at
 * EOF); `finish` tells whether the closing tag has arrived yet.
 *
 * Typing note: this module is fully typed without suppressions or casts -
 * parse5 tree nodes are narrowed with `nodeName` discriminants and the
 * `isTextNode` / `isRecord` guards below.
 */
import JSON5 from 'json5'
import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

import { logger } from './logger'

type P5ChildNode = DefaultTreeAdapterMap['childNode']
type P5Element = DefaultTreeAdapterMap['element']
type P5TextNode = DefaultTreeAdapterMap['textNode']

export type ParsedMsgBlock =
	| {
		type: 'string'
		content: string
	} | {
		type: 'think'
		content: string
	} | {
		type: 'thinking'
		content: string
	} | {
		type: 'communication'
		content: string
	} | {
		type: 'write_to_file'
		path: string
		content: string
		lineCount?: number
	} | {
		type: 'insert_content'
		path: string
		startLine: number
		content: string
	} | {
		type: 'read_file'
		path: string
		finish: boolean
	} | {
		type: 'attempt_completion'
		result: string
		finish: boolean
	} | {
		type: 'search_and_replace'
		path: string
		content: string
		operations: {
			search: string
			replace: string
			start_line?: number
			end_line?: number
			use_regex?: boolean
			ignore_case?: boolean
			regex_flags?: string
		}[]
		finish: boolean
	} | {
		type: 'apply_diff'
		path: string
		diff: string
		finish: boolean
	} | {
		type: 'ask_followup_question'
		question: string,
		finish: boolean
	} | {
		type: 'list_files'
		path: string
		recursive?: boolean
		finish: boolean
	} | {
		type: 'match_search_files'
		path: string
		query: string
		finish: boolean
	} | {
		type: 'regex_search_files'
		path: string
		regex: string
		finish: boolean
	} | {
		type: 'semantic_search_files'
		path: string
		query: string
		finish: boolean
	} | {
		type: 'search_web'
		query: string
		finish: boolean
	} | {
		type: 'fetch_urls_content'
		urls: string[]
		finish: boolean
	} | {
		type: 'switch_mode'
		mode: string
		reason: string
		finish: boolean
	} | {
		type: 'use_mcp_tool'
		server_name: string
		tool_name: string
		parameters: Record<string, unknown>,
		finish: boolean
	} | {
		type: 'dataview_query'
		query: string
		outputFormat: string
		finish: boolean
	} | {
		type: 'call_transformations'
		path: string
		transformation: string
		finish: boolean
	} | {
		type: 'manage_files'
		operations: Array<{
			action: 'create_folder' | 'move' | 'delete' | 'copy' | 'rename'
			path?: string
			source_path?: string
			destination_path?: string
			new_name?: string
		}>
		/**
		 * How many presented operation entries the validator rejected (unknown
		 * action, non-object entry, non-array or malformed JSON payload). Lets
		 * the chat UI explain an empty or shortened operation list instead of
		 * silently offering "execute" over nothing (field bug, 1.6.22).
		 */
		droppedOperations: number
		finish: boolean
	} | {
		type: 'tool_result'
		content: string
	}

type ManageFilesOperation = Extract<ParsedMsgBlock, { type: 'manage_files' }>['operations'][number]
type ManageFilesAction = ManageFilesOperation['action']
type SearchReplaceOperation = Extract<ParsedMsgBlock, { type: 'search_and_replace' }>['operations'][number]

/** parse5 marks text nodes with the `#text` nodeName discriminant. */
function isTextNode(node: P5ChildNode): node is P5TextNode {
	return node.nodeName === '#text'
}

/** Plain (non-array, non-null) object check for parsed JSON payloads. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Text of the element's first child when that child is a text node.
 * Replaces the old untyped `childNodes[0].value` accesses: elements and
 * comments have no `value`, and the guard makes that explicit.
 */
function firstChildText(element: P5Element): string | undefined {
	const first: P5ChildNode | undefined = element.childNodes[0]
	return first !== undefined && isTextNode(first) ? first.value : undefined
}

/**
 * Raw source slice between the first and last child of `element` - the
 * inner content verbatim, nested markup and entity-looking sequences
 * included. `''` when the element has no children; `undefined` when source
 * locations are missing (should not happen with sourceCodeLocationInfo).
 */
function innerSourceSlice(input: string, element: P5Element): string | undefined {
	const children = element.childNodes
	if (children.length === 0) {
		return ''
	}
	const startOffset = children[0].sourceCodeLocation?.startOffset
	const endOffset = children[children.length - 1].sourceCodeLocation?.endOffset
	// falsy-offset check kept from the original implementation: offsets
	// inside a block tag are always > 0, and 0 means "location missing"
	if (!startOffset || !endOffset) {
		return undefined
	}
	return input.slice(startOffset, endOffset)
}

/** `innerSourceSlice` for blocks whose inner content is required. */
function innerSourceSliceOrThrow(input: string, element: P5Element): string {
	const slice = innerSourceSlice(input, element)
	if (slice === undefined) {
		throw new Error('sourceCodeLocation is undefined')
	}
	return slice
}

/**
 * Emits the plain-text block preceding `node` (if any) and returns the
 * node's end offset for lastEndOffset tracking. Throws when source
 * locations are missing - they are always present with
 * `sourceCodeLocationInfo: true`, the guard is kept from the original.
 */
function emitPrecedingText(
	parsedResult: ParsedMsgBlock[],
	input: string,
	lastEndOffset: number,
	node: P5Element,
): number {
	if (!node.sourceCodeLocation) {
		throw new Error('sourceCodeLocation is undefined')
	}
	const startOffset = node.sourceCodeLocation.startOffset
	if (startOffset > lastEndOffset) {
		parsedResult.push({
			type: 'string',
			content: input.slice(lastEndOffset, startOffset),
		})
	}
	return node.sourceCodeLocation.endOffset
}

/**
 * insert_content `start_line` coercion. The old `operation.start_line || 1`
 * let numeric strings through (a string startLine then broke line math in
 * the editor); now numbers pass through, numeric strings are parsed, and
 * everything else (including 0/negative/fractional junk) falls back to 1.
 */
function toStartLine(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
		return value
	}
	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10)
		if (!Number.isNaN(parsed) && parsed >= 1) {
			return parsed
		}
	}
	return 1
}

/**
 * `string[]` when the payload is an array, dropping non-string entries
 * (they used to reach React as href/src values and could crash rendering);
 * `undefined` when the payload is not an array at all.
 */
function toStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined
	}
	const result: string[] = []
	for (const item of value) {
		if (typeof item === 'string') {
			result.push(item)
		}
	}
	return result
}

function isManageFilesAction(value: unknown): value is ManageFilesAction {
	return (
		value === 'create_folder' ||
		value === 'move' ||
		value === 'delete' ||
		value === 'copy' ||
		value === 'rename'
	)
}

/**
 * Validates a parsed manage_files operations payload. Non-arrays and
 * entries without a known `action` are dropped: they render as blank rows
 * and, worse, used to be forwarded to the file-manage Apply handler.
 */
function toManageFilesOperations(value: unknown): ManageFilesOperation[] {
	if (!Array.isArray(value)) {
		logger.debug('manage_files: expected a JSON array of operations, got', typeof value)
		return []
	}
	const operations: ManageFilesOperation[] = []
	for (const item of value) {
		if (!isRecord(item)) {
			logger.debug('manage_files: skipping non-object operation')
			continue
		}
		const action: unknown = item.action
		if (!isManageFilesAction(action)) {
			logger.debug('manage_files: skipping operation with unknown action', action)
			continue
		}
		const operation: ManageFilesOperation = { action }
		if (typeof item.path === 'string') {
			operation.path = item.path
		}
		if (typeof item.source_path === 'string') {
			operation.source_path = item.source_path
		}
		if (typeof item.destination_path === 'string') {
			operation.destination_path = item.destination_path
		}
		if (typeof item.new_name === 'string') {
			operation.new_name = item.new_name
		}
		operations.push(operation)
	}
	return operations
}

/**
 * Parses a manage_files JSON payload slice into validated operations plus
 * the count of presented entries the validator rejected (a non-array payload
 * counts as one rejected entry). Returns undefined when the JSON is
 * malformed, so the caller can still report "something was presented but
 * unusable" via droppedOperations.
 */
function parseManageFilesJson(slice: string): { operations: ManageFilesOperation[]; dropped: number } | undefined {
	let parsedOperations: unknown
	try {
		parsedOperations = JSON5.parse(slice.trim())
	} catch (error) {
		logger.error('Failed to parse manage_files operations JSON', error)
		return undefined
	}
	const operations = toManageFilesOperations(parsedOperations)
	const presented = Array.isArray(parsedOperations) ? parsedOperations.length : 1
	return { operations, dropped: presented - operations.length }
}

/**
 * Validates a parsed search_and_replace operations payload. The old code
 * assigned `JSON5.parse(...)` straight through: an object instead of an
 * array crashed `operations.map` in ReactMarkdown (the whole message
 * failed to render), and entries without string `search`/`replace` broke
 * the multi-search-replace Apply engine. Now the shape is enforced and
 * optional fields keep only values of the declared type.
 */
function toSearchReplaceOperations(value: unknown): SearchReplaceOperation[] {
	if (!Array.isArray(value)) {
		logger.debug('search_and_replace: expected a JSON array of operations, got', typeof value)
		return []
	}
	const operations: SearchReplaceOperation[] = []
	for (const item of value) {
		if (!isRecord(item)) {
			logger.debug('search_and_replace: skipping non-object operation')
			continue
		}
		const search: unknown = item.search
		const replace: unknown = item.replace
		if (typeof search !== 'string' || typeof replace !== 'string') {
			logger.debug('search_and_replace: skipping operation without string search/replace')
			continue
		}
		const operation: SearchReplaceOperation = { search, replace }
		const startLine: unknown = item.start_line
		if (typeof startLine === 'number' && Number.isFinite(startLine)) {
			operation.start_line = startLine
		}
		const endLine: unknown = item.end_line
		if (typeof endLine === 'number' && Number.isFinite(endLine)) {
			operation.end_line = endLine
		}
		const useRegex: unknown = item.use_regex
		if (typeof useRegex === 'boolean') {
			operation.use_regex = useRegex
		}
		const ignoreCase: unknown = item.ignore_case
		if (typeof ignoreCase === 'boolean') {
			operation.ignore_case = ignoreCase
		}
		const regexFlags: unknown = item.regex_flags
		if (typeof regexFlags === 'string') {
			operation.regex_flags = regexFlags
		}
		operations.push(operation)
	}
	return operations
}

export function parseMsgBlocks(
	input: string,
): ParsedMsgBlock[] {
	try {
		const parsedResult: ParsedMsgBlock[] = []
		const fragment = parseFragment(input, {
			sourceCodeLocationInfo: true,
		})
		let lastEndOffset = 0
		for (const node of fragment.childNodes) {
			if (node.nodeName === 'thinking') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				parsedResult.push({
					type: 'thinking',
					content: innerSourceSliceOrThrow(input, node),
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'think') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				parsedResult.push({
					type: 'think',
					content: innerSourceSliceOrThrow(input, node),
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'communication') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				parsedResult.push({
					type: 'communication',
					content: innerSourceSliceOrThrow(input, node),
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'list_files') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let recursive: boolean | undefined

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'recursive' && childNode.childNodes.length > 0) {
						const recursiveValue = firstChildText(childNode)
						recursive = recursiveValue ? recursiveValue.toLowerCase() === 'true' : false
					}
				}

				parsedResult.push({
					type: 'list_files',
					path: path || '/',
					recursive,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'read_file') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					}
				}
				parsedResult.push({
					type: 'read_file',
					path,
					// Check if the tag is completely parsed with proper closing tag:
					// with sourceCodeLocationInfo, a properly closed tag exposes an
					// endTag location span.
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'match_search_files') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let query: string | undefined

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'query' && childNode.childNodes.length > 0) {
						query = firstChildText(childNode)
					}
				}

				parsedResult.push({
					type: 'match_search_files',
					path: path,
					query: query,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'regex_search_files') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let regex: string | undefined

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'regex' && childNode.childNodes.length > 0) {
						regex = firstChildText(childNode)
					}
				}

				parsedResult.push({
					type: 'regex_search_files',
					path: path,
					regex: regex,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'semantic_search_files') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let query: string | undefined

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'query' && childNode.childNodes.length > 0) {
						query = firstChildText(childNode)
					}
				}

				parsedResult.push({
					type: 'semantic_search_files',
					path: path,
					query: query,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'write_to_file') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let content = ''
				let lineCount: number | undefined
				// Sub-tag extraction
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'content' && childNode.childNodes.length > 0) {
						// Raw slice: file content may contain nested markup (JSX,
						// templates) and this exact text is what Apply writes to disk.
						content = innerSourceSlice(input, childNode) ?? ''
					} else if (childNode.nodeName === 'line_count' && childNode.childNodes.length > 0) {
						const lineCountStr = firstChildText(childNode)
						if (lineCountStr) {
							const parsedLineCount = Number.parseInt(lineCountStr, 10)
							// parseInt junk used to leak NaN into lineCount
							lineCount = Number.isNaN(parsedLineCount) ? undefined : parsedLineCount
						}
					}
				}
				parsedResult.push({
					type: 'write_to_file',
					content,
					path,
					lineCount,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'insert_content') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let content = ''
				let startLine = 0

				// Sub-tag extraction
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'operations' && childNode.childNodes.length > 0) {
						try {
							const operationsJson = innerSourceSlice(input, childNode)
							if (operationsJson !== undefined) {
								const parsedOperations: unknown = JSON5.parse(operationsJson)
								if (Array.isArray(parsedOperations) && parsedOperations.length > 0) {
									const operation: unknown = parsedOperations[0]
									if (isRecord(operation)) {
										startLine = toStartLine(operation.start_line)
										const operationContent: unknown = operation.content
										content = typeof operationContent === 'string' ? operationContent : ''
									}
								}
							}
						} catch (error) {
							logger.error('Failed to parse operations JSON', error)
						}
					}
				}

				parsedResult.push({
					type: 'insert_content',
					path,
					startLine,
					content,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'search_and_replace') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let operations: SearchReplaceOperation[] = []
				let content = ''

				// Sub-tag extraction
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'operations' && childNode.childNodes.length > 0) {
						try {
							content = innerSourceSlice(input, childNode) ?? ''
							const parsedOperations: unknown = JSON5.parse(content)
							operations = toSearchReplaceOperations(parsedOperations)
						} catch (error) {
							logger.error('Failed to parse operations JSON', error)
						}
					}
				}

				parsedResult.push({
					type: 'search_and_replace',
					path,
					content,
					operations,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'apply_diff') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let diff: string | undefined

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'diff' && childNode.childNodes.length > 0) {
						// Raw slice: diffs of markup files contain tag-looking lines
						// that text-node extraction used to truncate.
						diff = innerSourceSlice(input, childNode)
					}
				}

				parsedResult.push({
					type: 'apply_diff',
					path,
					diff,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'attempt_completion') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let result: string | undefined
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'result' && childNode.childNodes.length > 0) {
						result = innerSourceSlice(input, childNode)
					}
				}
				parsedResult.push({
					type: 'attempt_completion',
					result,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'ask_followup_question') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let question: string | undefined
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'question' && childNode.childNodes.length > 0) {
						question = innerSourceSlice(input, childNode)
					}
				}
				parsedResult.push({
					type: 'ask_followup_question',
					question,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'switch_mode') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let mode = ''
				let reason = ''

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'mode_slug' && childNode.childNodes.length > 0) {
						mode = firstChildText(childNode) ?? ''
					} else if (childNode.nodeName === 'reason' && childNode.childNodes.length > 0) {
						reason = innerSourceSlice(input, childNode) ?? ''
					}
				}

				parsedResult.push({
					type: 'switch_mode',
					mode,
					reason,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'search_web') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let query: string | undefined
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'query' && childNode.childNodes.length > 0) {
						query = firstChildText(childNode)
					}
				}
				parsedResult.push({
					type: 'search_web',
					query: query || '',
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'fetch_urls_content') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let urls: string[] = []

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'urls' && childNode.childNodes.length > 0) {
						try {
							const urlsJson = innerSourceSlice(input, childNode)
							if (urlsJson !== undefined) {
								const parsedUrls: unknown = JSON5.parse(urlsJson)
								const stringUrls = toStringArray(parsedUrls)
								if (stringUrls !== undefined) {
									urls = stringUrls
								}
							}
						} catch {
							// Malformed JSON (usually a partially streamed array):
							// keep the previous value, no diagnostics needed.
						}
					}
				}

				parsedResult.push({
					type: 'fetch_urls_content',
					urls,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'use_mcp_tool') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let server_name = ''
				let tool_name = ''
				let parameters: Record<string, unknown> = {}

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'server_name' && childNode.childNodes.length > 0) {
						server_name = firstChildText(childNode) ?? ''
					} else if (childNode.nodeName === 'tool_name' && childNode.childNodes.length > 0) {
						tool_name = firstChildText(childNode) ?? ''
					} else if ((childNode.nodeName === 'parameters'
						|| childNode.nodeName === 'input'
						|| childNode.nodeName === 'arguments')
						&& childNode.childNodes.length > 0) {
						try {
							const parametersJson = innerSourceSlice(input, childNode)
							if (parametersJson !== undefined) {
								const parsedParameters: unknown = JSON5.parse(parametersJson)
								if (isRecord(parsedParameters)) {
									parameters = parsedParameters
								} else {
									logger.debug('use_mcp_tool: ignoring non-object parameters payload')
								}
							}
						} catch (error) {
							logger.debug('Failed to parse parameters JSON', error)
						}
					}
				}

				parsedResult.push({
					type: 'use_mcp_tool',
					server_name,
					tool_name,
					parameters,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'dataview_query') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let query = ''
				let outputFormat = 'table'

				// Sub-node extraction
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'query' && childNode.childNodes.length > 0) {
						query = firstChildText(childNode) || ''
					} else if (childNode.nodeName === 'output_format' && childNode.childNodes.length > 0) {
						outputFormat = firstChildText(childNode) || 'table'
					}
				}

				parsedResult.push({
					type: 'dataview_query',
					query,
					outputFormat,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'insights') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let path: string | undefined
				let transformation: string | undefined

				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'path' && childNode.childNodes.length > 0) {
						path = firstChildText(childNode)
					} else if (childNode.nodeName === 'transformation' && childNode.childNodes.length > 0) {
						transformation = firstChildText(childNode)
					}
				}

				parsedResult.push({
					type: 'call_transformations',
					path: path || '',
					transformation: transformation || '',
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'tool_result') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				parsedResult.push({
					type: 'tool_result',
					content: innerSourceSliceOrThrow(input, node),
				})
				lastEndOffset = endOffset
			} else if (node.nodeName === 'manage_files') {
				const endOffset = emitPrecedingText(parsedResult, input, lastEndOffset, node)
				let operations: ManageFilesOperation[] = []
				let droppedOperations = 0

				// Preferred shape: an <operations> sub-tag with the JSON payload
				for (const childNode of node.childNodes) {
					if (childNode.nodeName === 'operations' && childNode.childNodes.length > 0) {
						const slice = innerSourceSlice(input, childNode)
						const parsed = slice === undefined ? undefined : parseManageFilesJson(slice)
						if (parsed !== undefined) {
							operations = parsed.operations
							droppedOperations = parsed.dropped
						} else {
							droppedOperations = 1
						}
						break
					}
				}

				// Fallback: the JSON array written directly as the tag content
				if (operations.length === 0 && droppedOperations === 0 && node.childNodes.length > 0) {
					const innerSlice = innerSourceSlice(input, node)
					if (innerSlice !== undefined) {
						const jsonContent = innerSlice.trim()
						// only treat the body as JSON when it looks like an array
						// or a single operation object; prose stays "no payload"
						if (jsonContent.startsWith('[') || jsonContent.startsWith('{')) {
							const parsed = parseManageFilesJson(jsonContent)
							if (parsed !== undefined) {
								operations = parsed.operations
								droppedOperations = parsed.dropped
							} else {
								droppedOperations = 1
							}
						}
					}
				}

				parsedResult.push({
					type: 'manage_files',
					operations,
					droppedOperations,
					finish: node.sourceCodeLocation.endTag !== undefined,
				})
				lastEndOffset = endOffset
			}
		}

		// handle the last part of the input
		if (lastEndOffset < input.length) {
			parsedResult.push({
				type: 'string',
				content: input.slice(lastEndOffset),
			})
		}
		return parsedResult
	} catch (error) {
		logger.error('Failed to parse infio block', error)
		throw error
	}
}

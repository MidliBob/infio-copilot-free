/**
 * Local recursive text splitter.
 *
 * Ported from @langchain/textsplitters (MIT License, Copyright (c) 2023
 * Harrison Chase / langchain-ai contributors) so the plugin does not need
 * the `langchain` + `@langchain/core` dependency tree (~35 packages) for
 * a single import. Behavior is kept byte-compatible with
 * RecursiveCharacterTextSplitter.createDocuments() for the option set used
 * by VectorManager (chunkSize, chunkOverlap, separators, keepSeparator=true,
 * lengthFunction=text.length), including the metadata.loc.lines bookkeeping
 * and the oversized-chunk console warning.
 *
 * Verified against langchain 0.3.37 / @langchain/textsplitters 0.1.0 with
 * differential tests (see text-splitter.test.ts golden expectations).
 */

export type SplitDocument = {
	pageContent: string
	metadata: {
		loc?: {
			lines: {
				from: number
				to: number
			}
		}
	}
}

export type ChunkHeaderOptions = {
	chunkHeader?: string
	chunkOverlapHeader?: string
	appendChunkOverlapHeader?: boolean
}

export type TextSplitterOptions = {
	chunkSize?: number
	chunkOverlap?: number
	keepSeparator?: boolean
	lengthFunction?: (text: string) => number
}

function escapeRegExp(text: string): string {
	return text.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&")
}

export class TextSplitter {
	chunkSize: number
	chunkOverlap: number
	keepSeparator: boolean
	lengthFunction: (text: string) => number

	constructor(fields?: TextSplitterOptions) {
		this.chunkSize = fields?.chunkSize ?? 1000
		this.chunkOverlap = fields?.chunkOverlap ?? 200
		this.keepSeparator = fields?.keepSeparator ?? false
		this.lengthFunction = fields?.lengthFunction ?? ((text) => text.length)
		if (this.chunkOverlap >= this.chunkSize) {
			throw new Error("Cannot have chunkOverlap >= chunkSize")
		}
	}

	async splitText(text: string): Promise<string[]> {
		throw new Error(`splitText not implemented for base TextSplitter: ${text.length} chars`)
	}

	splitOnSeparator(text: string, separator: string): string[] {
		let splits: string[]
		if (separator) {
			if (this.keepSeparator) {
				const regexEscapedSeparator = escapeRegExp(separator)
				splits = text.split(new RegExp(`(?=${regexEscapedSeparator})`))
			} else {
				splits = text.split(separator)
			}
		} else {
			splits = text.split("")
		}
		return splits.filter((s) => s !== "")
	}

	numberOfNewLines(text: string, start?: number, end?: number): number {
		const textSection = text.slice(start, end)
		return (textSection.match(/\n/g) || []).length
	}

	joinDocs(docs: string[], separator: string): string | null {
		const text = docs.join(separator).trim()
		return text === "" ? null : text
	}

	mergeSplits(splits: string[], separator: string): string[] {
		const docs: string[] = []
		const currentDoc: string[] = []
		let total = 0
		for (const d of splits) {
			const _len = this.lengthFunction(d)
			if (
				total + _len + currentDoc.length * separator.length >
				this.chunkSize
			) {
				if (total > this.chunkSize) {
					console.warn(
						`Created a chunk of size ${total}, +\nwhich is longer than the specified ${this.chunkSize}`
					)
				}
				if (currentDoc.length > 0) {
					const doc = this.joinDocs(currentDoc, separator)
					if (doc !== null) {
						docs.push(doc)
					}
					// Keep on popping if:
					// - we have a larger chunk than in the chunk overlap
					// - or if we still have any chunks and the length is long
					while (
						total > this.chunkOverlap ||
						(total + _len + currentDoc.length * separator.length >
							this.chunkSize &&
							total > 0)
					) {
						total -= this.lengthFunction(currentDoc[0])
						currentDoc.shift()
					}
				}
			}
			currentDoc.push(d)
			total += _len
		}
		const doc = this.joinDocs(currentDoc, separator)
		if (doc !== null) {
			docs.push(doc)
		}
		return docs
	}

	async createDocuments(
		texts: string[],
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors the ported langchain signature
		metadatas: Record<string, any>[] = [],
		chunkHeaderOptions: ChunkHeaderOptions = {}
	): Promise<SplitDocument[]> {
		// if no metadata is provided, we create an empty one for each text
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors the ported langchain typing; .loc is read dynamically below
		const _metadatas: Record<string, any>[] =
			metadatas.length > 0
				? metadatas
				: [...Array<string>(texts.length)].map(() => ({}))
		const {
			chunkHeader = "",
			chunkOverlapHeader = "(cont'd) ",
			appendChunkOverlapHeader = false,
		} = chunkHeaderOptions
		const documents: SplitDocument[] = []
		for (let i = 0; i < texts.length; i += 1) {
			const text = texts[i]
			let lineCounterIndex = 1
			let prevChunk: string | null = null
			let indexPrevChunk = -1
			for (const chunk of await this.splitText(text)) {
				let pageContent = chunkHeader
				// we need to count the \n that are in the text before getting removed by the splitting
				const indexChunk = text.indexOf(chunk, indexPrevChunk + 1)
				if (prevChunk === null) {
					const newLinesBeforeFirstChunk = this.numberOfNewLines(
						text,
						0,
						indexChunk
					)
					lineCounterIndex += newLinesBeforeFirstChunk
				} else {
					const indexEndPrevChunk =
						indexPrevChunk + this.lengthFunction(prevChunk)
					if (indexEndPrevChunk < indexChunk) {
						const numberOfIntermediateNewLines = this.numberOfNewLines(
							text,
							indexEndPrevChunk,
							indexChunk
						)
						lineCounterIndex += numberOfIntermediateNewLines
					} else if (indexEndPrevChunk > indexChunk) {
						const numberOfIntermediateNewLines = this.numberOfNewLines(
							text,
							indexChunk,
							indexEndPrevChunk
						)
						lineCounterIndex -= numberOfIntermediateNewLines
					}
					if (appendChunkOverlapHeader) {
						pageContent += chunkOverlapHeader
					}
				}
				const newLinesCount = this.numberOfNewLines(chunk)
				const loc =
					_metadatas[i].loc && typeof _metadatas[i].loc === "object"
						? { ..._metadatas[i].loc }
						: {}
				loc.lines = {
					from: lineCounterIndex,
					to: lineCounterIndex + newLinesCount,
				}
				const metadataWithLinesNumber = {
					..._metadatas[i],
					loc,
				}
				pageContent += chunk
				documents.push({
					pageContent,
					metadata: metadataWithLinesNumber,
				})
				lineCounterIndex += newLinesCount
				prevChunk = chunk
				indexPrevChunk = indexChunk
			}
		}
		return documents
	}
}

export type RecursiveCharacterTextSplitterOptions = TextSplitterOptions & {
	separators?: string[]
}

export class RecursiveCharacterTextSplitter extends TextSplitter {
	separators: string[]

	constructor(fields?: RecursiveCharacterTextSplitterOptions) {
		super(fields)
		this.separators = fields?.separators ?? ["\n\n", "\n", " ", ""]
		this.keepSeparator = fields?.keepSeparator ?? true
	}

	async splitText(text: string): Promise<string[]> {
		return this._splitText(text, this.separators)
	}

	private _splitText(text: string, separators: string[]): string[] {
		const finalChunks: string[] = []
		// Get appropriate separator to use
		let separator = separators[separators.length - 1]
		let newSeparators: string[] | undefined
		for (let i = 0; i < separators.length; i += 1) {
			const s = separators[i]
			if (s === "") {
				separator = s
				break
			}
			if (text.includes(s)) {
				separator = s
				newSeparators = separators.slice(i + 1)
				break
			}
		}
		// Now that we have the separator, split the text
		const splits = this.splitOnSeparator(text, separator)
		// Now go merging things, recursively splitting longer texts.
		let goodSplits: string[] = []
		const _separator = this.keepSeparator ? "" : separator
		for (const s of splits) {
			if (this.lengthFunction(s) < this.chunkSize) {
				goodSplits.push(s)
			} else {
				if (goodSplits.length) {
					const mergedText = this.mergeSplits(goodSplits, _separator)
					finalChunks.push(...mergedText)
					goodSplits = []
				}
				if (!newSeparators) {
					finalChunks.push(s)
				} else {
					const otherInfo = this._splitText(s, newSeparators)
					finalChunks.push(...otherInfo)
				}
			}
		}
		if (goodSplits.length) {
			const mergedText = this.mergeSplits(goodSplits, _separator)
			finalChunks.push(...mergedText)
		}
		return finalChunks
	}
}

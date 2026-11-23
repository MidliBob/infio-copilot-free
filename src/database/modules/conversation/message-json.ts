/**
 * Typed readers for the JSON columns of the `messages` table.
 *
 * The database stores serialized chat payloads as TEXT (see InsertMessage in
 * database/schema.ts). Before this module the conversation manager fed
 * `JSON.parse`'s `any` straight into ChatMessage fields — that is where the
 * no-unsafe-* findings came from. Every reader parses to `unknown` and
 * validates the shape against the type it claims to return, so a corrupted
 * row degrades to a defined value instead of leaking `any` into the chat UI.
 *
 * Malformed JSON text still throws (exactly as `JSON.parse` did before): a row
 * that is not JSON at all is a storage error, not a shape mismatch.
 */
import { z } from 'zod'

import type { SerializedEditorState } from 'lexical'

import { ApplyStatus } from '../../../types/apply'
import type { ChatAssistantMessage, ChatUserMessage } from '../../../types/chat'
import type { ContentPart } from '../../../types/llm/request'
import type { SerializedMentionable } from '../../../types/mentionable'

function isRecord(value: unknown): boolean {
	return typeof value === 'object' && value !== null
}

/**
 * Lexical's SerializedEditorState is an external, deeply nested shape we never
 * inspect ourselves; the reader only needs to keep non-object garbage out.
 * `z.custom` is zod's supported way to claim an external type after a runtime
 * check (the alternative would be an `as` assertion, which this repo forbids).
 */
const serializedEditorStateSchema = z.custom<SerializedEditorState>(
	(value) => isRecord(value) && 'root' in value,
)

const contentPartSchema = z.union([
	z.object({ type: z.literal('text'), text: z.string() }),
	z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string() }) }),
])

const promptContentSchema = z.union([z.string(), z.array(contentPartSchema)])

const serializedMentionableSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('file'), file: z.string() }),
	z.object({ type: z.literal('folder'), folder: z.string() }),
	z.object({ type: z.literal('vault') }),
	z.object({ type: z.literal('current-file'), file: z.string().nullable() }),
	z.object({
		type: z.literal('block'),
		content: z.string(),
		file: z.string(),
		startLine: z.number(),
		endLine: z.number(),
	}),
	z.object({ type: z.literal('url'), url: z.string() }),
	z.object({
		type: z.literal('image'),
		name: z.string(),
		mimeType: z.string(),
		data: z.string(),
	}),
])

const similaritySearchResultSchema = z.object({
	id: z.number(),
	path: z.string(),
	mtime: z.number(),
	content: z.string(),
	metadata: z.object({ startLine: z.number(), endLine: z.number() }),
	similarity: z.number(),
})

const assistantMetadataSchema = z.object({
	usage: z
		.custom<NonNullable<ChatAssistantMessage['metadata']>['usage']>((value) => isRecord(value))
		.optional(),
	model: z
		.custom<NonNullable<ChatAssistantMessage['metadata']>['model']>((value) => isRecord(value))
		.optional(),
})

function readJson(raw: string): unknown {
	const parsed: unknown = JSON.parse(raw)
	return parsed
}

/** `content` column: serialized Lexical state, null when the row has none. */
export function parseStoredEditorState(
	raw: string | null | undefined,
): SerializedEditorState | null {
	if (!raw) {
		return null
	}
	const result = serializedEditorStateSchema.safeParse(readJson(raw))
	return result.success ? result.data : null
}

/**
 * `prompt_content` column: a plain template string, or a JSON-encoded
 * `ContentPart[]`.
 *
 * serializeMessage stores a custom prompt verbatim and a content-part array as
 * JSON, so the value is JSON only when it starts with "{" or "[". A template
 * that merely begins with a brace (the stock `{{prefix}}<mask/>{{suffix}}`
 * does) is NOT JSON: the previous `JSON.parse` on every "{"-prefixed value
 * threw for it, so parsing here is best-effort and falls back to the raw
 * string. An array is deliberately parsed as well — the old code only looked
 * at "{" and therefore handed stored `ContentPart[]` back as raw JSON text.
 */
export function parseStoredPromptContent(
	raw: string | null | undefined,
): string | ContentPart[] | null {
	if (!raw) {
		return null
	}
	if (!raw.startsWith('{') && !raw.startsWith('[')) {
		return raw
	}
	let parsed: unknown
	try {
		parsed = readJson(raw)
	} catch {
		// A literal template, not JSON: keep what the user typed.
		return raw
	}
	if (typeof parsed === 'string') {
		return parsed
	}
	const result = promptContentSchema.safeParse(parsed)
	return result.success ? result.data : raw
}

/**
 * `mentionables` column: an array of serialized mentionables. Items whose
 * shape is not recognized are dropped one by one (older builds and add-ons
 * wrote shapes this version no longer knows) instead of discarding the whole
 * row's selection.
 */
export function parseStoredMentionables(raw: string | null | undefined): SerializedMentionable[] {
	if (!raw) {
		return []
	}
	const stored = z.array(z.unknown()).safeParse(readJson(raw))
	if (!stored.success) {
		return []
	}
	const mentionables: SerializedMentionable[] = []
	for (const item of stored.data) {
		const parsedItem = serializedMentionableSchema.safeParse(item)
		if (parsedItem.success) {
			mentionables.push(parsedItem.data)
		}
	}
	return mentionables
}

/** `similarity_search_results` column: vector hits recorded with the message. */
export function parseStoredSimilarityResults(
	raw: string | null | undefined,
): ChatUserMessage['similaritySearchResults'] {
	if (!raw) {
		return undefined
	}
	const result = z.array(similaritySearchResultSchema).safeParse(readJson(raw))
	return result.success ? result.data : undefined
}

/** `metadata` column of an assistant message: usage and model bookkeeping. */
export function parseStoredAssistantMetadata(
	raw: string | null | undefined,
): ChatAssistantMessage['metadata'] {
	if (!raw) {
		return undefined
	}
	const result = assistantMetadataSchema.safeParse(readJson(raw))
	return result.success ? result.data : undefined
}

/**
 * `apply_status` is stored as a plain integer. Unknown values (hand-edited
 * databases, rows from builds that had more statuses) fall back to Idle
 * instead of being carried into the enum-typed message.
 */
const APPLY_STATUS_BY_VALUE: ReadonlyMap<number, ApplyStatus> = new Map([
	[ApplyStatus.Idle, ApplyStatus.Idle],
	[ApplyStatus.Applied, ApplyStatus.Applied],
	[ApplyStatus.Failed, ApplyStatus.Failed],
	[ApplyStatus.Rejected, ApplyStatus.Rejected],
])

export function toApplyStatus(value: number): ApplyStatus {
	return APPLY_STATUS_BY_VALUE.get(value) ?? ApplyStatus.Idle
}

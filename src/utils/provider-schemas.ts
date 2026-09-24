/**
 * Zod schemas for external JSON the plugin parses itself (i.e. responses
 * not already typed by an SDK). Parsing through these schemas keeps
 * malformed or unexpected server responses from leaking into runtime as
 * `any` - Phase 2 "types at the boundaries".
 *
 * All parsers are total: they never throw and return an empty result on
 * any mismatch, so callers can keep their existing fallback behaviour.
 */
import { z } from 'zod'

// --- shared field helpers -------------------------------------------------

/** Optional string; null is normalized to undefined. */
const OptionalString = z
	.string()
	.nullish()
	.transform((value) => value ?? undefined)

/** Optional number; null is normalized to undefined. */
const OptionalNumber = z
	.number()
	.nullish()
	.transform((value) => value ?? undefined)

/**
 * Numeric field that tolerates decimal strings: OpenRouter returns prices
 * as strings like "0.000003". null/undefined normalize to undefined.
 */
const NumericField = z
	.union([z.number(), z.string()])
	.nullish()
	.transform((value) => (value == null ? undefined : Number(value)))

// --- Ollama /api/tags -----------------------------------------------------

const OllamaTagModelSchema = z.object({
	name: z.string(),
	capabilities: z.array(z.string()).nullish().transform((value) => value ?? undefined),
})

const OllamaTagsResponseSchema = z.object({
	models: z.array(OllamaTagModelSchema).nullish(),
})

export type OllamaTagModel = z.infer<typeof OllamaTagModelSchema>

/** Validates an Ollama /api/tags response body; returns [] on mismatch. */
export function parseOllamaTags(json: unknown): OllamaTagModel[] {
	const parsed = OllamaTagsResponseSchema.safeParse(json)
	if (!parsed.success) {
		return []
	}
	return parsed.data.models ?? []
}

// --- OpenRouter /api/v1/models --------------------------------------------

const OpenRouterModelSchema = z.object({
	id: z.string(),
	description: OptionalString,
	context_length: OptionalNumber,
	top_provider: z
		.object({ max_completion_tokens: OptionalNumber })
		.nullish()
		.transform((value) => value ?? undefined),
	architecture: z
		.object({ modality: OptionalString })
		.nullish()
		.transform((value) => value ?? undefined),
	pricing: z
		.object({
			prompt: NumericField,
			completion: NumericField,
		})
		.nullish()
		.transform((value) => value ?? undefined),
})

const OpenRouterModelsResponseSchema = z.object({
	data: z.array(OpenRouterModelSchema),
})

export type OpenRouterModel = z.infer<typeof OpenRouterModelSchema>

/** Validates an OpenRouter /models response body; returns [] on mismatch. */
export function parseOpenRouterModels(json: unknown): OpenRouterModel[] {
	const parsed = OpenRouterModelsResponseSchema.safeParse(json)
	if (!parsed.success) {
		return []
	}
	return parsed.data.data
}

// --- Tavily web search results ---------------------------------------------

const TavilyResultSchema = z.object({
	title: OptionalString,
	url: z.string(),
	content: OptionalString,
})

const TavilyResponseSchema = z.object({
	results: z.array(TavilyResultSchema).nullish(),
})

export type TavilyResult = z.infer<typeof TavilyResultSchema>

/** Validates a Tavily /search response body; returns [] on mismatch. */
export function parseTavilyResults(json: unknown): TavilyResult[] {
	const parsed = TavilyResponseSchema.safeParse(json)
	if (!parsed.success) {
		return []
	}
	return parsed.data.results ?? []
}

// --- YaCy web search results ---------------------------------------------------

/**
 * YaCy's yacysearch.json wraps hits in an RSS-like `channels[].items[]`
 * envelope. Depending on the peer build, a single item or link may arrive
 * as a bare object instead of an array, so every level accepts both shapes.
 */
const YacyLinkSchema = z.union([
	z.string(),
	z.object({ href: z.string() }),
])

const YacyItemSchema = z.object({
	title: OptionalString,
	link: z.union([YacyLinkSchema, z.array(YacyLinkSchema)]).nullish(),
	description: OptionalString,
	content: OptionalString,
})

const YacyChannelSchema = z.object({
	items: z.union([YacyItemSchema, z.array(YacyItemSchema)]).nullish(),
})

const YacyResponseSchema = z.object({
	channels: z.array(YacyChannelSchema).nullish(),
})

/** A YaCy hit normalized to the shape the search callers expect. */
export type YacyNormalizedResult = {
	title?: string
	link: string
	snippet?: string
}

type YacyLink = z.infer<typeof YacyLinkSchema>

function firstYacyHref(link: YacyLink | YacyLink[] | null | undefined): string | undefined {
	const candidate = Array.isArray(link) ? link[0] : link
	if (typeof candidate === 'string') {
		return candidate.length > 0 ? candidate : undefined
	}
	return candidate?.href
}

/** Validates a YaCy yacysearch.json response body; returns [] on mismatch. */
export function parseYacyResults(json: unknown): YacyNormalizedResult[] {
	const parsed = YacyResponseSchema.safeParse(json)
	if (!parsed.success) {
		return []
	}
	const out: YacyNormalizedResult[] = []
	for (const channel of parsed.data.channels ?? []) {
		const items =
			channel.items == null
				? []
				: Array.isArray(channel.items)
					? channel.items
					: [channel.items]
		for (const item of items) {
			const link = firstYacyHref(item.link)
			if (link === undefined) {
				continue
			}
			out.push({
				title: item.title,
				link,
				snippet: item.description ?? item.content,
			})
		}
	}
	return out
}

// --- SearXNG web search results ----------------------------------------------

/**
 * SearXNG's /search?format=json answers with a flat `results[]` array; each
 * hit carries `url`, `title` and a `content` snippet. Engines behind SearXNG
 * differ in what they return, so title/content are optional.
 */
const SearxngResultSchema = z.object({
	title: OptionalString,
	url: z.string(),
	content: OptionalString,
})

const SearxngResponseSchema = z.object({
	results: z.array(SearxngResultSchema).nullish(),
})

export type SearxngResult = z.infer<typeof SearxngResultSchema>

/** Validates a SearXNG /search JSON response body; returns [] on mismatch. */
export function parseSearxngResults(json: unknown): SearxngResult[] {
	const parsed = SearxngResponseSchema.safeParse(json)
	if (!parsed.success) {
		return []
	}
	return parsed.data.results ?? []
}

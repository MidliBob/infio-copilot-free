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

// --- Serper web search results ---------------------------------------------

const SerperOrganicResultSchema = z.object({
	title: OptionalString,
	link: z.string(),
	snippet: OptionalString,
})

const SerperResponseSchema = z.object({
	organic_results: z.array(SerperOrganicResultSchema).nullish(),
})

export type SerperOrganicResult = z.infer<typeof SerperOrganicResultSchema>

/** Validates a Serper search response body; returns [] on mismatch. */
export function parseSerperResults(json: unknown): SerperOrganicResult[] {
	const parsed = SerperResponseSchema.safeParse(json)
	if (!parsed.success) {
		return []
	}
	return parsed.data.organic_results ?? []
}

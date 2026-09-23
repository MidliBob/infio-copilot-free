import { requestUrl } from 'obsidian'

import { type OllamaTagModel, parseOllamaTags } from './provider-schemas'

async function fetchOllamaTags(ollamaUrl: string): Promise<OllamaTagModel[]> {
	try {
		const response = await requestUrl(`${ollamaUrl}/api/tags`)
		return parseOllamaTags(response.json)
	} catch (error) {
		return []
	}
}

export async function getOllamaModels(ollamaUrl: string): Promise<string[]> {
	const tags = await fetchOllamaTags(ollamaUrl)
	return tags.map((model) => model.name)
}

/**
 * Models the server reports as embedding-capable via the /api/tags
 * `capabilities` field. Older Ollama builds do not report capabilities -
 * then the full list is returned so users can still pick; a chat-only
 * model fails at request time with Ollama's own clear error message.
 */
export async function getOllamaEmbeddingModels(ollamaUrl: string): Promise<string[]> {
	const tags = await fetchOllamaTags(ollamaUrl)
	const embeddingCapable = tags.filter(
		(model) => Array.isArray(model.capabilities) && model.capabilities.includes('embedding')
	)
	const source = embeddingCapable.length > 0 ? embeddingCapable : tags
	return source.map((model) => model.name)
}

export function normalizeOllamaBaseUrl(rawBaseUrl: string): string {
	return (rawBaseUrl ?? '').trim().replace(/\/+$/, '')
}

export type OllamaHealthStatus = 'ok' | 'empty-url' | 'unreachable' | 'origins-blocked'

export type OllamaHealthResult = {
	status: OllamaHealthStatus
	version?: string
	detail?: string
}

/**
 * Two-stage Ollama health check.
 *
 * Stage 1 uses Obsidian's requestUrl (native HTTP, NOT subject to browser
 * CORS) and answers "is Ollama running and reachable at this address?".
 * Stage 2 repeats the request with the renderer's fetch - the same
 * transport chat/embedding requests use (OpenAI SDK under the hood).
 * Ollama answers disallowed browser origins with 403 and no CORS headers,
 * which browsers hide as an opaque "Failed to fetch" - so when stage 1
 * passes but stage 2 fails, the cause is almost certainly OLLAMA_ORIGINS.
 */
export async function checkOllamaHealth(rawBaseUrl: string): Promise<OllamaHealthResult> {
	const baseUrl = normalizeOllamaBaseUrl(rawBaseUrl)
	if (!baseUrl) {
		return { status: 'empty-url' }
	}

	let version: string | undefined
	try {
		const response = await requestUrl({ url: `${baseUrl}/api/version` })
		if (response.status < 200 || response.status >= 300) {
			return { status: 'unreachable', detail: `HTTP ${response.status}` }
		}
		const data: { version?: unknown } = response.json
		if (data && typeof data.version === 'string') {
			version = data.version
		}
	} catch (error) {
		return {
			status: 'unreachable',
			detail: error instanceof Error ? error.message : String(error),
		}
	}

	try {
		const probe = await fetch(`${baseUrl}/api/version`, {
			method: 'GET',
			cache: 'no-store',
			signal: AbortSignal.timeout(5000),
		})
		if (!probe.ok) {
			return { status: 'origins-blocked', version, detail: `HTTP ${probe.status}` }
		}
	} catch (error) {
		return {
			status: 'origins-blocked',
			version,
			detail: error instanceof Error ? error.message : String(error),
		}
	}

	return { status: 'ok', version }
}

const ORIGINS_HINT =
	"allow Obsidian's origin in Ollama: set OLLAMA_ORIGINS=app://obsidian.md " +
	'(or OLLAMA_ORIGINS=* for any origin), then restart Ollama - ' +
	'see the "Ollama troubleshooting" section of the plugin README for per-OS steps.'

/**
 * Turns low-level fetch/API errors from Ollama calls into an actionable
 * message; returns null when the error does not look connectivity-related
 * (callers rethrow the original error then).
 */
export function describeOllamaNetworkError(error: unknown, rawBaseUrl: string): string | null {
	const baseUrl = normalizeOllamaBaseUrl(rawBaseUrl)
	const message = error instanceof Error ? error.message : String(error ?? '')
	const lower = message.toLowerCase()

	let status: number | undefined
	if (error && typeof error === 'object' && 'status' in error) {
		const rawStatus = error.status
		if (typeof rawStatus === 'number') {
			status = rawStatus
		}
	}

	// Browsers mask CORS-blocked responses (Ollama's 403 without
	// Access-Control-Allow-Origin) as opaque network failures, so a bare
	// "Failed to fetch" is either "not running" or "origins not allowed".
	const looksLikeNetworkFailure =
		status === undefined &&
		(lower.includes('failed to fetch') ||
			lower.includes('fetch failed') ||
			lower.includes('network') ||
			lower.includes('econnrefused') ||
			lower.includes('connection refused') ||
			lower.includes('timeout') ||
			lower.includes('terminated'))

	if (status === 403 || looksLikeNetworkFailure) {
		return (
			`Cannot reach Ollama at ${baseUrl || '(no address set)'}. ` +
			'1) make sure Ollama is running (try "ollama serve"); ' +
			`2) ${ORIGINS_HINT} ` +
			'You can pinpoint the cause with Settings -> Infio Copilot Free -> Ollama -> Test connection.'
		)
	}

	if (status === 404) {
		return (
			`Ollama returned 404 for ${baseUrl}/v1 - check the base URL. ` +
			'Chat and embeddings use the OpenAI-compatible API under /v1 (Ollama >= 0.1.14).'
		)
	}

	return null
}

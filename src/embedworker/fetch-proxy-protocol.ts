/**
 * Worker <-> main-thread fetch proxy protocol.
 *
 * Model downloads inside the embedding worker run through Obsidian's
 * requestUrl in the MAIN thread: unlike the worker's own fetch, requestUrl
 * is a native HTTP client and is not subject to browser CORS, so hosts
 * without Access-Control-Allow-Origin headers (hf-mirror.com being the
 * field-reported case) stop failing with opaque "Failed to fetch".
 *
 * The worker posts {type:'fetch-request'}; the main thread performs the
 * request and posts back {type:'fetch-response'} with an ArrayBuffer body
 * (transferred, not copied).
 */

export type FetchRequestMessage = {
	type: 'fetch-request'
	requestId: number
	url: string
	timeoutMs?: number
}

export type FetchResponseMessage = {
	type: 'fetch-response'
	requestId: number
	status: number
	headers?: Record<string, string>
	body?: ArrayBuffer
	error?: string
}

export type FetchProxyResult = {
	status: number
	headers: Record<string, string>
	body: ArrayBuffer
}

export function isFetchRequestMessage(value: unknown): value is FetchRequestMessage {
	if (value === null || typeof value !== 'object') {
		return false
	}
	if (!('type' in value) || value.type !== 'fetch-request') {
		return false
	}
	return 'requestId' in value && 'url' in value
}

export function isFetchResponseMessage(value: unknown): value is FetchResponseMessage {
	if (value === null || typeof value !== 'object') {
		return false
	}
	if (!('type' in value) || value.type !== 'fetch-response') {
		return false
	}
	return 'requestId' in value && 'status' in value
}

/**
 * Main-thread side: execute one proxied request. `perform` is supplied by
 * the caller (a requestUrl wrapper) so this module stays Obsidian-free and
 * unit-testable.
 */
export async function performFetchProxyRequest(
	msg: FetchRequestMessage,
	perform: (url: string, timeoutMs?: number) => Promise<FetchProxyResult>,
): Promise<FetchResponseMessage> {
	try {
		const result = await perform(msg.url, msg.timeoutMs)
		return {
			type: 'fetch-response',
			requestId: msg.requestId,
			status: result.status,
			headers: result.headers,
			body: result.body,
		}
	} catch (error) {
		return {
			type: 'fetch-response',
			requestId: msg.requestId,
			status: 0,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

/** Worker side: rebuild a Response from the proxy answer, or throw. */
export function responseFromFetchProxy(msg: FetchResponseMessage): Response {
	if (msg.error !== undefined || msg.body === undefined) {
		throw new Error(msg.error ?? `Proxied fetch failed with status ${msg.status}`)
	}
	return new Response(msg.body, {
		status: msg.status > 0 ? msg.status : 200,
		headers: msg.headers,
	})
}

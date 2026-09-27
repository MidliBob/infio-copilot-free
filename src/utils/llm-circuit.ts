import { Result, err, ok } from 'neverthrow'

import { CircuitBreaker, callWithBreaker } from './circuit-breaker'

/**
 * Session-scoped transport breaker for the configured chat/LLM endpoint.
 *
 * Background features that call the chat API on their own schedule -
 * autocomplete on every keystroke, workspace insights walking the vault -
 * used to burn a full retry budget per trigger while the server was down
 * (and autocomplete even leaked an unhandled rejection). They now share
 * this breaker: three consecutive connection-level failures open it, and
 * while it is open no HTTP request is attempted at all. Any server answer
 * (even an HTTP error) or a success closes it; after the cooldown a single
 * probe request is allowed through.
 *
 * User-initiated chat sends do not consult the breaker: they surface their
 * own error in the conversation, and a success there closes the circuit.
 */
export const llmCircuit = new CircuitBreaker()

/** Close the breaker manually (test helper / settings-change hook). */
export function resetLlmCircuit(): void {
	llmCircuit.recordSuccess()
}

/** Minimal chunk shape both chat clients consume while accumulating. */
export type ChatStreamChunk = {
	choices?: ReadonlyArray<
		| {
				delta?: { content?: string | null } | null
		  }
		| undefined
	>
}

/**
 * Streams a chat completion through the session breaker and accumulates
 * the delta content. Never throws: transport failures (including a tripped
 * breaker) come back as err(...), keeping the neverthrow contract of the
 * queryChatModel wrappers that delegate here.
 */
export async function streamChatWithBreaker(
	fetchStream: () => Promise<AsyncIterable<ChatStreamChunk>>,
): Promise<Result<string, Error>> {
	try {
		const stream = await callWithBreaker(llmCircuit, fetchStream)
		let content = ''
		for await (const chunk of stream) {
			content += chunk.choices?.[0]?.delta?.content ?? ''
		}
		return ok(content)
	} catch (error) {
		return err(error instanceof Error ? error : new Error(String(error)))
	}
}

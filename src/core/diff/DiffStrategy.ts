import { App } from "obsidian"

import { MultiSearchReplaceDiffStrategy } from "./strategies/multi-search-replace"
import { SearchReplaceDiffStrategy } from "./strategies/search-replace"
import { UnifiedDiffStrategy } from "./strategies/unified"
import type { DiffStrategy } from "./types"
/**
 * Get the appropriate diff strategy for the given model
 * @param model The name of the model being used (e.g., 'gpt-4', 'claude-3-opus')
 * @returns The appropriate diff strategy for the model
 */
export function getDiffStrategy(
	model: string,
	app: App,
	fuzzyMatchThreshold?: number,
	experimentalDiffStrategy: boolean = false,
	multiSearchReplaceDiffStrategy: boolean = false,
): DiffStrategy {
	// if (experimentalDiffStrategy) {
	// 	return new NewUnifiedDiffStrategy(app, fuzzyMatchThreshold)
	// }

	// if (multiSearchReplaceDiffStrategy) {
	// 	return new MultiSearchReplaceDiffStrategy(fuzzyMatchThreshold)
	// } else {
	// 	return new SearchReplaceDiffStrategy(fuzzyMatchThreshold)
	// }
	return new MultiSearchReplaceDiffStrategy(0.9)
}

export { SearchReplaceDiffStrategy, UnifiedDiffStrategy }
export type { DiffStrategy }

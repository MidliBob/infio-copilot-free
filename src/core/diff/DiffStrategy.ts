import { MultiSearchReplaceDiffStrategy } from "./strategies/multi-search-replace"
import { SearchReplaceDiffStrategy } from "./strategies/search-replace"
import { UnifiedDiffStrategy } from "./strategies/unified"
import type { DiffStrategy } from "./types"
/**
 * Get the diff strategy for apply_diff.
 *
 * The legacy model/settings-dependent selection (experimental unified and
 * search-replace branches) survives only as the commented-out history
 * below; the plugin ships a single strategy with a fixed fuzzy threshold.
 * @returns The diff strategy
 */
export function getDiffStrategy(): DiffStrategy {
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

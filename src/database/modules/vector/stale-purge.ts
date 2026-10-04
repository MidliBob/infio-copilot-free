/**
 * Pure set logic for purging stale vector-index entries.
 *
 * Background (field feedback, 1.7.15): include/exclude patterns decide which
 * files get (re)indexed, but none of the index-update paths removed vectors
 * that were already stored for files which later became ineligible (e.g. a
 * folder was added to the exclude list). Those stale vectors kept counting
 * towards the index statistics and, worse, kept hitting in semantic search.
 *
 * The purge set is: indexed paths that are inside the indexed scope but are
 * no longer eligible under the current include/exclude patterns.
 *
 * - `scopePaths` omitted/null (vault-wide index): every indexed path is in
 *   scope.
 * - `scopePaths` array (named/default workspace index): only paths belonging
 *   to the workspace are considered, so updating one workspace never purges
 *   vectors of files outside of it. An empty array therefore purges nothing.
 *
 * Note: the null probe below intentionally goes through Array.isArray — with
 * strictNullChecks off, a direct `!== null` / truthiness test on the optional
 * parameter is reported by @typescript-eslint/no-unnecessary-condition, and
 * new files must stay violation-free (lint ratchet contract).
 *
 * The function is pure, deduplicating and order-preserving; the caller
 * performs the actual deletion via the vector repository.
 */
export function collectStaleIndexedPaths(
	indexedPaths: readonly string[],
	eligiblePaths: readonly string[],
	scopePaths?: readonly string[] | null,
): string[] {
	const eligible = new Set(eligiblePaths)
	const hasScope = Array.isArray(scopePaths)
	const scope = new Set(hasScope ? scopePaths : [])
	const seen = new Set<string>()
	const stale: string[] = []
	for (const path of indexedPaths) {
		if (seen.has(path)) {
			continue
		}
		seen.add(path)
		if (hasScope && !scope.has(path)) {
			continue
		}
		if (!eligible.has(path)) {
			stale.push(path)
		}
	}
	return stale
}

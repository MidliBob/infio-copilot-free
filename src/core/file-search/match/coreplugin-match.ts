import { App, TFile, WorkspaceLeaf } from "obsidian";
import {
    MAX_RESULTS,
    SearchResult,
    findLineDetails,
    formatResults,
    truncateLine,
} from '../search-common';
import { logger } from '../../../utils/logger'

/** How long the core search pane gets to populate before we give up. */
const SEARCH_RESULTS_TIMEOUT_MS = 10_000;

/**
 * The pieces of Obsidian's built-in search the plugin reaches for. Neither is
 * part of the public typings (`app.internalPlugins`, the view's
 * `dom.resultDomLookup`), so both are read as `unknown` through
 * `Reflect.get`/`in`-guards instead of `as any` assertions.
 */
type CoreSearchPlugin = {
    openGlobalSearch(query: string): void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function asUnknownArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

/**
 * Structural guard: the internal plugin instance only needs the single method
 * this module calls, exactly like `isEditorView` in utils/obsidian.ts.
 */
function isCoreSearchPlugin(value: unknown): value is CoreSearchPlugin {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.openGlobalSearch === 'function';
}

/** Resolves the "global-search" internal plugin instance, or null when absent. */
function getCoreSearchPlugin(app: App): CoreSearchPlugin | null {
    const internalPlugins: unknown = Reflect.get(app, 'internalPlugins');
    if (!isRecord(internalPlugins)) {
        return null;
    }
    const plugins: unknown = internalPlugins.plugins;
    if (!isRecord(plugins)) {
        return null;
    }
    const entry: unknown = plugins['global-search'];
    if (!isRecord(entry)) {
        return null;
    }
    const instance: unknown = entry.instance;
    return isCoreSearchPlugin(instance) ? instance : null;
}

/**
 * Waits for the search pane to populate, then returns the `[file, matches]`
 * pairs of its `resultDomLookup` map. Non-TFile keys (the pane keeps a few
 * bookkeeping entries) are dropped; malformed values reach
 * `readMatchOffsets`, which validates them.
 */
async function collectSearchResults(view: unknown): Promise<Array<[TFile, unknown]>> {
    await new Promise<void>((resolve) => {
        window.setTimeout(resolve, SEARCH_RESULTS_TIMEOUT_MS);
    });

    const dom: unknown = isRecord(view) ? view.dom : undefined;
    const lookup: unknown = isRecord(dom) ? dom.resultDomLookup : undefined;
    if (!(lookup instanceof Map)) {
        return [];
    }

    const entries: Array<[TFile, unknown]> = [];
    lookup.forEach((value: unknown, key: unknown) => {
        if (key instanceof TFile) {
            entries.push([key, value]);
        }
    });
    return entries;
}

/**
 * Extracts the match offsets from one file's internal search result.
 *
 * The pane stores `result.content` as an array of `[matched_text, start_offset]`
 * tuples; anything that does not look like one is skipped instead of being
 * indexed blindly.
 */
export function readMatchOffsets(fileMatches: unknown): number[] {
    if (!isRecord(fileMatches)) {
        return [];
    }
    const result = fileMatches.result;
    if (!isRecord(result)) {
        return [];
    }
    const offsets: number[] = [];
    for (const match of asUnknownArray(result.content)) {
        const startOffset = asUnknownArray(match)[1];
        if (typeof startOffset === 'number') {
            offsets.push(startOffset);
        }
    }
    return offsets;
}

/**
 * Searches using Obsidian's core search plugin and builds context for each match.
 *
 * @param app The Obsidian App instance.
 * @param query The query to search for.
 * @returns A promise that resolves to a formatted string of search results.
 */
export async function matchSearchUsingCorePlugin(
    query: string,
    app: App,
): Promise<string> {
    try {
        const searchPlugin = getCoreSearchPlugin(app);
        if (!searchPlugin) {
            throw new Error("Core search plugin is not available.");
        }

        // This function opens the search pane and executes the search.
        // It does not return the results directly.
        searchPlugin.openGlobalSearch(query);

        const searchLeaves = app.workspace.getLeavesOfType('search');
        if (searchLeaves.length === 0) {
            throw new Error("No active search pane found after triggering search.");
        }
        const searchLeaf: WorkspaceLeaf = searchLeaves[0];

        // Ensure the view is fully loaded before we try to access its properties.
        const view = await searchLeaf.open(searchLeaf.view);
        const searchResults = await collectSearchResults(view);

        if (searchResults.length === 0) {
			logger.error("No results found or search results map is not available.");
			return "No results found."
        }

        const results: SearchResult[] = [];
        const vault = app.vault;

        for (const [file, fileMatches] of searchResults) {
            if (results.length >= MAX_RESULTS) {
                break;
            }

            let content = await vault.cachedRead(file);
            // 清理null字节，防止PostgreSQL UTF8编码错误
            content = content.replace(/\0/g, '');
            const lines = content.split('\n');

            for (const startOffset of readMatchOffsets(fileMatches)) {
                if (results.length >= MAX_RESULTS) break;

                const { lineNumber, columnNumber, lineContent } = findLineDetails(lines, startOffset);

                if (lineNumber === -1) continue;

                results.push({
                    file: file.path,
                    line: lineNumber + 1, // ripgrep is 1-based, so we adjust
                    column: columnNumber + 1,
                    match: truncateLine(lineContent.trimEnd()),
                    beforeContext: lineNumber > 0 ? [truncateLine(lines[lineNumber - 1].trimEnd())] : [],
                    afterContext:
                        lineNumber < lines.length - 1
                            ? [truncateLine(lines[lineNumber + 1].trimEnd())]
                            : [],
                });
            }
        }

        return formatResults(results, ".\\");
    } catch (error) {
		logger.error("Error during core plugin processing:", error);
		return "An error occurred during the search.";
	}
}
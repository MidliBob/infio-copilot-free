import { App, TFile  } from "obsidian";
import {
    MAX_RESULTS,
    truncateLine,
    findLineDetails,
    SearchResult,
    formatResults,
} from '../search-common';

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
        const searchPlugin = (app as any).internalPlugins.plugins['global-search']?.instance;
        if (!searchPlugin) {
            throw new Error("Core search plugin is not available.");
        }

        // This function opens the search pane and executes the search.
        // It does not return the results directly.
        searchPlugin.openGlobalSearch(query);

        const searchLeaf = app.workspace.getLeavesOfType('search')[0];
        if (!searchLeaf) {
            throw new Error("No active search pane found after triggering search.");
        }

        // Ensure the view is fully loaded before we try to access its properties.
        const view = await searchLeaf.open(searchLeaf.view);
        const searchResultsMap = await new Promise<Map<TFile, any>>(resolve => {
            window.setTimeout(() => {
                // @ts-ignore
                const results = (view as any).dom?.resultDomLookup;
                resolve(results || new Map());
            }, 10000)
        });

        if (!searchResultsMap || searchResultsMap.size === 0) {
			console.error("No results found or search results map is not available.");
			return "No results found."
        }

        const results: SearchResult[] = [];
        const vault = app.vault;

        for (const [file, fileMatches] of searchResultsMap.entries()) {
            if (results.length >= MAX_RESULTS) {
                break;
            }

            let content = await vault.cachedRead(file as TFile);
            // 清理null字节，防止PostgreSQL UTF8编码错误
            content = content.replace(/\0/g, '');
            const lines = content.split('\n');

            // `fileMatches.result.content` holds an array of matches for the file.
            // Each match is an array: [matched_text, start_offset]
            for (const match of fileMatches.result.content) {
                if (results.length >= MAX_RESULTS) break;
                
                const startOffset = match[1];
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
		console.error("Error during core plugin processing:", error);
		return "An error occurred during the search.";
	}
}

import { htmlToMarkdown, requestUrl } from 'obsidian';

import { DEFAULT_YACY_BASE_URL, TAVILY_SEARCH_URL } from '../constants';

import { getVideoProvider, isVideoUrl } from './video-detector';
import { YoutubeTranscript } from './youtube-transcript';
import { parseTavilyResults, parseYacyResults } from './provider-schemas';
import { logger } from './logger'

/** The web search backends supported by the plugin. */
export type WebSearchProvider = 'tavily' | 'yacy'

/** Everything webSearch() needs to know about the user's configuration. */
export type WebSearchConfig = {
	provider: WebSearchProvider
	tavilyApiKey: string
	yacyBaseUrl: string
}

/**
 * The single RAG capability web search needs: embedding a text. RAGEngine
 * satisfies this structurally; keeping the dependency narrow makes the
 * module testable without the full engine.
 */
export type WebSearchEmbedder = {
	getEmbedding(text: string): Promise<number[]>
}

type SearchResult = {
	title: string;
	link: string;
	snippet: string;
	snippet_embedding: number[];
	content?: string;
}

// Cap for how many hits we ask the provider for; the embedding filter below
// narrows them to the top 5 anyway.
const MAX_SEARCH_RESULTS = 20

// Cosine similarity between two embedding vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
	const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
	const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
	const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

	return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Tavily: a cloud search API built for LLM tool use (free tier: 1000
 * searches per month). POST https://api.tavily.com/search with a Bearer
 * key; the response carries `results[]` with `title`, `url` and a
 * `content` snippet.
 */
export async function tavilySearch(query: string, apiKey: string): Promise<SearchResult[]> {
	try {
		// requestUrl is Obsidian's native HTTP client: unlike Node's `https` it
		// also works on mobile, and unlike renderer fetch it is not subject to
		// browser CORS.
		const response = await requestUrl({
			url: TAVILY_SEARCH_URL,
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				query,
				search_depth: 'basic',
				topic: 'general',
				max_results: MAX_SEARCH_RESULTS,
				include_answer: false,
			}),
			throw: false,
		});
		if (response.status < 200 || response.status >= 300) {
			logger.error(`tavily search failed with HTTP ${response.status}`);
			return [];
		}
		let json: unknown;
		try {
			json = JSON.parse(response.text);
		} catch {
			logger.error('tavily search returned a non-JSON response');
			return [];
		}
		return parseTavilyResults(json).map((result) => ({
			title: result.title ?? '',
			link: result.url,
			snippet: result.content ?? '',
			snippet_embedding: [],
		}));
	} catch (error) {
		logger.error('tavily search request failed', error);
		return [];
	}
}

/** Trims a user-provided YaCy peer URL and falls back to the local default. */
export function normalizeYacyBaseUrl(baseUrl: string): string {
	const trimmed = (baseUrl ?? '').trim().replace(/\/+$/, '');
	return trimmed.length > 0 ? trimmed : DEFAULT_YACY_BASE_URL;
}

/**
 * YaCy: a self-hosted, decentralized P2P search engine. It needs no API key
 * and no third-party cloud, so it keeps working in regions where the
 * commercial search APIs are unavailable. Queries the peer's JSON API at
 * GET <peer>/yacysearch.json.
 */
export async function yacySearch(query: string, baseUrl: string): Promise<SearchResult[]> {
	const peer = normalizeYacyBaseUrl(baseUrl);
	const url = `${peer}/yacysearch.json?query=${encodeURIComponent(query)}&maximumRecords=${MAX_SEARCH_RESULTS}`;
	try {
		const response = await requestUrl({ url, throw: false });
		if (response.status < 200 || response.status >= 300) {
			logger.error(`yacy search failed with HTTP ${response.status}`);
			return [];
		}
		let json: unknown;
		try {
			json = JSON.parse(response.text);
		} catch {
			logger.error('yacy search returned a non-JSON response');
			return [];
		}
		return parseYacyResults(json).map((result) => ({
			title: result.title ?? '',
			link: result.link,
			snippet: result.snippet ?? '',
			snippet_embedding: [],
		}));
	} catch (error) {
		logger.error(`yacy search request failed (is the peer running at ${peer}?)`, error);
		return [];
	}
}

async function runSearch(query: string, config: WebSearchConfig): Promise<SearchResult[]> {
	if (config.provider === 'yacy') {
		return yacySearch(query, config.yacyBaseUrl);
	}
	return tavilySearch(query, config.tavilyApiKey);
}

async function filterByEmbedding(query: string, results: SearchResult[], ragEngine: WebSearchEmbedder): Promise<SearchResult[]> {

	// Nothing to rank
	if (results.length === 0) {
		return [];
	}

	// Embedding vector of the query
	const queryEmbedding = await ragEngine.getEmbedding(query);

	// Embed every snippet in parallel and score it against the query
	const processedResults = await Promise.all(
		results.map(async (result) => {
			const resultEmbedding = await ragEngine.getEmbedding(result.snippet);
			const similarity = cosineSimilarity(queryEmbedding, resultEmbedding);

			return {
				...result,
				similarity,
				snippet_embedding: resultEmbedding
			};
		})
	);

	// Keep only sufficiently relevant results, best first
	const filteredResults = processedResults
		.filter(result => result.similarity > 0.5)
		.sort((a, b) => b.similarity - a.similarity)
		.slice(0, 5);

	return filteredResults;
}

async function fetchByLocalTool(url: string): Promise<string> {
	// Check whether this is video content
	if (isVideoUrl(url)) {
		const provider = getVideoProvider(url)

		// YouTube has a dedicated transcript extractor
		if (provider === 'youtube') {
			try {
				// TODO: pass language based on user preferences
				const { title, transcript } =
					await YoutubeTranscript.fetchTranscriptAndMetadata(url)

				return `Title: ${title}
Video Transcript:
${transcript.map((t) => `${t.offset}: ${t.text}`).join('\n')}`
			} catch (error) {
				logger.warn('Failed to extract YouTube transcript:', error)
				// Extraction failed - at least tell the model it is a video
				return `Video Content Detected: ${url}
Platform: YouTube
Note: This is a video content. Transcript extraction failed. Please use specialized video processing tools for content analysis.`
			}
		}

		// Other video platforms: report metadata only
		return `Video Content Detected: ${url}
Platform: ${provider || 'Unknown'}
Note: This is a video content. Please use specialized video processing tools for content analysis.`
	}

	// Regular page: fetch and convert to markdown locally
	const response = await requestUrl({ url })
	return htmlToMarkdown(response.text)
}

export async function fetchUrlContent(url: string): Promise<string | null> {
	try {
		const content = await fetchByLocalTool(url);
		return content.replaceAll(/\n{2,}/g, '\n');
	} catch (error) {
		logger.error(`Failed to fetch URL content: ${url}`, error);
		return null;
	}
}

export async function webSearch(
	query: string,
	config: WebSearchConfig,
	ragEngine: WebSearchEmbedder
): Promise<string> {
	if (config.provider === 'tavily' && !(config.tavilyApiKey ?? '').trim()) {
		logger.warn('web search skipped: no Tavily API key configured');
		return 'web search is not configured: set a Tavily API key or switch to the YaCy provider in the plugin settings';
	}
	try {
		const results = await runSearch(query, config);
		const filteredResults = await filterByEmbedding(query, results, ragEngine);
		if (filteredResults.length === 0) {
			return `no relevant web search results found for "${query}"`;
		}
		const filteredResultsWithContent = await Promise.all(filteredResults.map(async (result) => {
			let content = await fetchUrlContent(result.link);
			if (content === null || content.length === 0) {
				content = result.snippet;
			}
			return `<url_content url="${result.link}">\n${content}\n</url_content>`;
		}));
		return filteredResultsWithContent.join('\n\n');
	} catch (error) {
		logger.error(`Failed to web search: ${query}`, error);
		return "web search error";
	}
}

export async function fetchUrlsContent(urls: string[]): Promise<string> {
	return new Promise((resolve) => {
		const results = urls.map(async (url) => {
			try {
				const content = await fetchUrlContent(url);
				return `<url_content url="${url}">\n${content ?? 'fetch content error: empty response'}\n</url_content>`;
			} catch (error) {
				logger.error(`Failed to fetch URL content: ${url}`, error);
				return `<url_content url="${url}">\n fetch content error: ${error}\n</url_content>`;
			}
		});

		Promise.all(results).then((texts) => {
			resolve(texts.join('\n\n'));
		}).catch((error) => {
			logger.error('fetch urls content error', error);
			resolve('fetch urls content error'); // even if error, return some content
		});
	});
}

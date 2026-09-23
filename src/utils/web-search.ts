import { htmlToMarkdown, requestUrl } from 'obsidian';

import { JINA_BASE_URL, SERPER_BASE_URL } from '../constants';
import { RAGEngine } from '../core/rag/rag-engine';

import { getVideoProvider, isVideoUrl } from './video-detector';
import { YoutubeTranscript } from './youtube-transcript';
import { parseSerperResults } from './provider-schemas';
import { logger } from './logger'


interface SearchResult {
	title: string;
	link: string;
	snippet: string;
	snippet_embedding: number[];
	content?: string;
}

// 添加余弦相似度计算函数
function cosineSimilarity(vecA: number[], vecB: number[]): number {
	const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
	const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
	const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

	return dotProduct / (magnitudeA * magnitudeB);
}

async function serperSearch(query: string, serperApiKey: string, serperSearchEngine: string): Promise<SearchResult[]> {
	const url = `${SERPER_BASE_URL}?q=${encodeURIComponent(query)}&engine=${serperSearchEngine}&api_key=${serperApiKey}&num=20`;
	// requestUrl is Obsidian's native HTTP client: unlike Node's `https` it
	// also works on mobile, and unlike renderer fetch it is not subject to
	// browser CORS.
	const response = await requestUrl({ url, throw: false });
	if (response.status < 200 || response.status >= 300) {
		logger.error(`serper search failed with HTTP ${response.status}`);
		return [];
	}
	let json: unknown;
	try {
		json = JSON.parse(response.text);
	} catch {
		return [];
	}
	return parseSerperResults(json).map((result) => ({
		title: result.title ?? '',
		link: result.link,
		snippet: result.snippet ?? '',
		snippet_embedding: [],
	}));
}

async function filterByEmbedding(query: string, results: SearchResult[], ragEngine: RAGEngine): Promise<SearchResult[]> {

	// 如果没有结果，直接返回空数组
	if (results.length === 0) {
		return [];
	}

	// 获取查询的嵌入向量
	const queryEmbedding = await ragEngine.getEmbedding(query);

	// 并行处理所有结果的嵌入向量计算
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

	// 根据相似度过滤和排序结果
	const filteredResults = processedResults
		.filter(result => result.similarity > 0.5)
		.sort((a, b) => b.similarity - a.similarity)
		.slice(0, 5);

	return filteredResults;
}

async function fetchByLocalTool(url: string): Promise<string> {
	// 检查是否为视频内容
	if (isVideoUrl(url)) {
		const provider = getVideoProvider(url)
		
		// 对于YouTube，使用现有的转录功能
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
				// 如果转录失败，返回视频信息提示
				return `Video Content Detected: ${url}
Platform: YouTube
Note: This is a video content. Transcript extraction failed. Please use specialized video processing tools for content analysis.`
			}
		}
		
		// 对于其他视频平台，返回视频信息提示
		return `Video Content Detected: ${url}
Platform: ${provider || 'Unknown'}
Note: This is a video content. Please use specialized video processing tools for content analysis.`
	}

	// 非视频内容，使用常规方式获取网页内容
	const response = await requestUrl({ url })
	return htmlToMarkdown(response.text)
}

async function fetchByJina(url: string, apiKey: string): Promise<string> {
	const jinaUrl = `${JINA_BASE_URL}/${url}`;
	try {
		// requestUrl instead of Node's `https`: works on mobile, no CORS.
		const response = await requestUrl({
			url: jinaUrl,
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'X-No-Cache': 'true',
			},
			throw: false,
		});
		// Jina reports errors as a JSON body with `code` and `message` fields;
		// anything else is the normal (markdown) payload.
		try {
			const parsed: unknown = JSON.parse(response.text);
			if (
				typeof parsed === 'object' &&
				parsed !== null &&
				'code' in parsed &&
				parsed.code &&
				'message' in parsed &&
				typeof parsed.message === 'string'
			) {
				logger.error(`JINA API error: ${parsed.message}`);
				return `fetch jina content error: ${parsed.message}`;
			}
		} catch {
			// not JSON - fall through and return the raw content
		}
		return response.text;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Error: ${message}`);
		return `fetch jina error: ${message}`;
	}
}

export async function fetchUrlContent(url: string, apiKey: string): Promise<string | null> {
	try {
		// 如果是视频内容，直接使用本地工具处理
		if (isVideoUrl(url)) {
			return await fetchByLocalTool(url);
		}
		let content: string | null = null;
		const validJinaKey = apiKey && apiKey !== '';
		if (validJinaKey) {
			try {
				content = await fetchByJina(url, apiKey);
			} catch (error) {
				logger.error(`Failed to fetch URL by jina: ${url}`, error);
				content = await fetchByLocalTool(url);
			}
		} else {
			content = await fetchByLocalTool(url);
		}
		return content.replaceAll(/\n{2,}/g, '\n');
	} catch (error) {
		logger.error(`Failed to fetch URL content: ${url}`, error);
		return null;
	}
}

export async function webSearch(
	query: string,
	serperApiKey: string,
	serperSearchEngine: string,
	jinaApiKey: string,
	ragEngine: RAGEngine
): Promise<string> {
	try {
		const results = await serperSearch(query, serperApiKey, serperSearchEngine);
		const filteredResults = await filterByEmbedding(query, results, ragEngine);
		const filteredResultsWithContent = await Promise.all(filteredResults.map(async (result) => {
			let content = await fetchUrlContent(result.link, jinaApiKey);
			if (content.length === 0) {
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

export async function fetchUrlsContent(urls: string[], apiKey: string): Promise<string> {
	return new Promise((resolve) => {
		const results = urls.map(async (url) => {
			try {
				const content = await fetchUrlContent(url, apiKey);
				return `<url_content url="${url}">\n${content}\n</url_content>`;
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

import { z } from "zod/v4";
import type { ToolDef } from "../../types";
import type { ToolResult } from "@/lib/agent/types";

// ============================================================================
// 搜索 Provider 抽象
// ============================================================================

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface SearchResponse {
	answer?: string | null;
	results: SearchResult[];
	/** 实际返回结果的 provider，便于排查回退链 */
	provider?: string;
}

type SearchProvider = (query: string, maxResults: number) => Promise<ToolResult<SearchResponse>>;

/** 统一把 maxResults 兜成可用的正整数——模型可能不传，直接拿 undefined 算会得到空结果 */
function normalizeLimit(maxResults: number): number {
	if (!Number.isFinite(maxResults) || maxResults <= 0) return 5;
	return Math.min(Math.floor(maxResults), 10);
}

// ============================================================================
// DuckDuckGo HTML 端点 — 零成本、无 API Key
// ============================================================================

const duckDuckGoSearch: SearchProvider = async (query, maxResults) => {
	try {
		const params = new URLSearchParams({ q: query });
		const response = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
			method: "GET",
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				"Accept": "text/html",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			},
		});

		if (!response.ok) {
			return { success: false, error: `DuckDuckGo 请求失败: ${response.status}` };
		}

		// 202 不是正常结果页：DuckDuckGo 在短时间内请求过多时会返回反爬验证页，
		// 状态码仍是成功，但正文里没有任何 result__a。必须当成失败交给回退链，
		// 否则工具会以「搜索成功、0 条结果」返回，模型便不知道还可以换一个源。
		if (response.status === 202) {
			return { success: false, error: "DuckDuckGo 触发反爬验证（HTTP 202）" };
		}

		const html = await response.text();
		const results = parseDuckDuckGoHTML(html, normalizeLimit(maxResults));

		return {
			success: true,
			data: { answer: null, results },
		};
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : String(e) };
	}
};

/** 从 DuckDuckGo HTML 提取搜索结果 */
function parseDuckDuckGoHTML(html: string, maxResults: number): SearchResult[] {
	const results: SearchResult[] = [];

	// DuckDuckGo HTML 结果结构：
	// <a class="result__a" href="...">title</a>
	// <a class="result__snippet" href="...">snippet</a>
	const linkRegex = /<a\s+[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
	const snippetRegex = /<a\s+[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

	const links: Array<{ url: string; title: string }> = [];
	let match: RegExpExecArray | null;

	while ((match = linkRegex.exec(html)) !== null) {
		const rawUrl = match[1];
		const title = stripHTMLTags(match[2]).trim();

		// DuckDuckGo 通过重定向链接包装 URL
		const actualUrl = extractDDGUrl(rawUrl);
		if (actualUrl && title) {
			links.push({ url: actualUrl, title });
		}
	}

	const snippets: string[] = [];
	while ((match = snippetRegex.exec(html)) !== null) {
		snippets.push(stripHTMLTags(match[1]).trim());
	}

	for (let i = 0; i < Math.min(links.length, maxResults); i++) {
		results.push({
			title: links[i].title,
			url: links[i].url,
			snippet: (snippets[i] ?? "").slice(0, 200),
		});
	}

	return results;
}

/** 从 DuckDuckGo 重定向 URL 中提取目标地址 */
function extractDDGUrl(rawUrl: string): string | null {
	// 格式: //duckduckgo.com/l/?uddg=https%3A%2F%2F...&rut=...
	try {
		if (rawUrl.includes("uddg=")) {
			const url = new URL(rawUrl, "https://duckduckgo.com");
			const target = url.searchParams.get("uddg");
			return target || null;
		}
		// 直接链接
		if (rawUrl.startsWith("http")) return rawUrl;
		return null;
	} catch {
		return null;
	}
}

/** 移除 HTML 标签 */
function stripHTMLTags(html: string): string {
	return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
}

// ============================================================================
// Tavily Provider — 需要 API Key（付费）
// ============================================================================

const tavilySearch: SearchProvider = async (query, maxResults) => {
	const apiKey = process.env.TAVILY_API_KEY;
	if (!apiKey) {
		return { success: false, error: "未配置 TAVILY_API_KEY 环境变量" };
	}

	try {
		const response = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: apiKey,
				query,
				max_results: maxResults,
				include_answer: true,
			}),
		});

		if (!response.ok) {
			return { success: false, error: `Tavily 请求失败: ${response.status}` };
		}

		const data = await response.json();
		const results = (data.results ?? []).map((r: { title: string; url: string; content: string }) => ({
			title: r.title,
			url: r.url,
			snippet: r.content?.slice(0, 200),
		}));

		return {
			success: true,
			data: { answer: data.answer ?? null, results },
		};
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : String(e) };
	}
};

// ============================================================================
// Bing RSS — 无需 API Key 的备用源
// ============================================================================

/**
 * Bing 的 `format=rss` 端点返回标准 RSS，不依赖页面里的动态 class，
 * 比抓 HTML 稳定，也不会像 DuckDuckGo 那样在连续请求后直接给验证页。
 * 作为 DuckDuckGo 失败后的兜底。
 */
const bingRssSearch: SearchProvider = async (query, maxResults) => {
	try {
		const params = new URLSearchParams({ q: query, format: "rss" });
		const response = await fetch(`https://www.bing.com/search?${params}`, {
			method: "GET",
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				"Accept": "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			},
		});

		if (!response.ok) {
			return { success: false, error: `Bing 请求失败: ${response.status}` };
		}

		const xml = await response.text();
		return {
			success: true,
			data: { answer: null, results: parseBingRss(xml, normalizeLimit(maxResults)) },
		};
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : String(e) };
	}
};

/** 从 Bing RSS 中提取标题、链接与摘要 */
function parseBingRss(xml: string, maxResults: number): SearchResult[] {
	const results: SearchResult[] = [];
	const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
	let match: RegExpExecArray | null;

	while ((match = itemRegex.exec(xml)) !== null && results.length < maxResults) {
		const block = match[1];
		const title = readRssTag(block, "title");
		const url = readRssTag(block, "link");
		if (!title || !url) continue;
		results.push({
			title,
			url,
			snippet: stripHTMLTags(readRssTag(block, "description")).slice(0, 200),
		});
	}

	return results;
}

function readRssTag(block: string, tag: string): string {
	const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
	if (!match) return "";
	const raw = match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
	return decodeXmlEntities(stripHTMLTags(raw)).trim();
}

/** RSS/XML 实体解码（比 HTML 的命名实体少，够用即可） */
function decodeXmlEntities(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
		.replace(/&amp;/g, "&");
}

// ============================================================================
// 回退链：Tavily（有 Key 时）→ DuckDuckGo → Bing RSS
// ============================================================================

async function searchWeb(query: string, maxResults: number): Promise<ToolResult<SearchResponse>> {
	const providers: Array<[string, SearchProvider]> = [];
	if (process.env.TAVILY_API_KEY) providers.push(["tavily", tavilySearch]);
	providers.push(["duckduckgo", duckDuckGoSearch], ["bing", bingRssSearch]);

	let lastError = "所有搜索源均未返回结果";

	for (const [name, provider] of providers) {
		const result = await provider(query, maxResults);
		const count = result.success ? (result.data?.results.length ?? 0) : 0;

		if (result.success && count > 0) {
			return { ...result, data: { ...result.data!, provider: name } };
		}

		lastError = result.success ? `${name} 未返回结果` : `${name}: ${result.error}`;
		console.warn(`[web_search] ${name} 失败，尝试下一个源：${lastError}`);
	}

	return { success: false, error: `搜索失败（${lastError}）` };
}

// ============================================================================
// 工具定义
// ============================================================================

const inputSchema = z.object({
	query: z.string().describe("搜索关键词"),
	maxResults: z.number().int().min(1).max(10).default(5).describe("最大返回结果数"),
});

const webSearch: ToolDef<z.infer<typeof inputSchema>> = {
	name: "web_search",
	displayName: "网络搜索",
	description:
		"搜索互联网获取外部数据，用于补充电子表格内容。返回摘要文本和来源链接，不是原始网页内容。适用场景：查询汇率、股价、统计数据等实时信息。",
	inputSchema,
	execute: async (input) => {
		return searchWeb(input.query, normalizeLimit(input.maxResults));
	},
};

export default webSearch;

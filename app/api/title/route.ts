import { generateText } from "ai";
import { buildLLM } from "@/lib/llm/provider";
import { LLM_CONFIG } from "@/lib/config";
import { errorLogger } from "@/lib/logging";
import { normalizeLocale } from "@/lib/i18n";

const apiKey = process.env.TITLE_API_KEY || process.env[LLM_CONFIG.apiKeyEnv];
const baseURL = process.env.TITLE_BASE_URL || LLM_CONFIG.baseURL;
const modelId = process.env.TITLE_MODEL || LLM_CONFIG.model;

const titleLlm = modelId
	? buildLLM({ model: modelId, apiKey, baseURL })
	: null;

export async function POST(req: Request) {
	const { firstMessage, locale }: { firstMessage: string; locale?: string } = await req.json();
	const resolvedLocale = normalizeLocale(locale);
	const fallback = resolvedLocale === "zh-CN"
		? "新会话"
		: "New Chat";
	if (!firstMessage?.trim() || !titleLlm) {
		return Response.json({ title: fallback });
	}

	try {
		const isZh = resolvedLocale === "zh-CN";
		const { text } = await generateText({
			model: titleLlm,
			system: isZh
				? `你是一位擅长为聊天机器人对话编写简洁标题的专家。
你会收到一个聊天请求，需要回复一个简短的标题，该标题应该准确捕捉该请求的主要话题。
标题不应该被引号包裹。长度应该在 25 个字以内。`
				: `You write short, precise titles for chatbot conversations.
You will receive a user request and must return one concise title that captures the main topic.
Do not wrap the title in quotes. Keep it under 8 words when possible.`,
			prompt: isZh
				? `请为以下请求编写一个简短的标题。请用中文回复，不要加引号。\n\n${firstMessage.slice(0, 500)}`
				: `Write a short English title for the following request. Do not use quotes.\n\n${firstMessage.slice(0, 500)}`,
			maxOutputTokens: 80,
		});

		let title = text.trim();
		// 去掉 LLM 可能加的外层引号
		if (title.match(/^["「『].*["」』]$/)) {
			title = title.slice(1, -1).trim();
		}

		return Response.json({ title: title || fallback });
	} catch (e) {
		errorLogger.capture("title/route", e);
		return Response.json({ title: fallback });
	}
}

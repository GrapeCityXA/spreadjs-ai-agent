import { isAppToolPart, type AppToolUIPart, type AppUIMessage } from "@/lib/agent/ui-message";
import { recoverActiveModule } from "@/lib/agent/recover-module";
import { estimateTokens } from "@/lib/token-estimate";
import { baseToolNames, gatewayToolNames, isModuleName, moduleToolMap } from "@/lib/tools/registry";

/**
 * 上下文占用的客户端估算。
 *
 * 从 `useContextUsage` 里拆出来，是为了做**增量缓存**：流式过程中消息每 80ms
 * 变一次，旧实现每次都把全部历史的工具输入/输出重新 `JSON.stringify` 一遍，
 * 成本随对话长度线性增长，长任务会把主线程拖垮。
 *
 * 缓存分两层：
 *
 * - **消息层**：已完成的消息对象在 AI SDK 里保持不变，用 `WeakMap` 直接复用整条
 *   消息的估算结果（对象被回收时缓存随之消失）
 * - **工具层**：同一条工具调用在续跑里可能被反复 clone，但 `toolCallId + state`
 *   不变；完成后的输入/输出是终值，按这个键缓存
 *
 * 于是每次增量只需要重算"正在流式的那条消息里还没完成的 part"。
 */

export interface ContextUsage {
	/** 上下文窗口总大小 */
	total: number;
	/** 已使用 token 数 */
	used: number;
	/** 使用百分比 (0-100) */
	percent: number;
	/** 是否为服务端实测值 */
	isReal: boolean;
	/** 分类明细 */
	breakdown: {
		systemInstructions: number;
		toolDefinitions: number;
		messages: number;
		toolResults: number;
	};
}

/** 估算系统提示的基础 token 数（静态部分，不含动态注入） */
const SYSTEM_PROMPT_BASE_TOKENS = 1800;
/** 每个工具定义的平均 token 数 */
const AVG_TOKENS_PER_TOOL = 120;
/** 工具缓存的上限；超过就整体清空，避免跨会话无限增长 */
const TOOL_CACHE_LIMIT = 4000;

interface MessageTokens {
	msgTokens: number;
	toolResultTokens: number;
}

interface ToolTokens {
	input: number;
	output: number;
}

export interface EstimateCache {
	messages: WeakMap<AppUIMessage, MessageTokens>;
	tools: Map<string, ToolTokens>;
}

export function createEstimateCache(): EstimateCache {
	return { messages: new WeakMap(), tools: new Map() };
}

function getActiveToolDefinitionCount(messages: AppUIMessage[], mcpToolCount: number): number {
	const activeModule = recoverActiveModule(messages);
	if (activeModule && isModuleName(activeModule)) {
		return baseToolNames.length + moduleToolMap[activeModule].length + 1 + mcpToolCount;
	}
	return baseToolNames.length + gatewayToolNames.length + mcpToolCount;
}

/** 工具输入估算时去掉附件 base64；它不应进入模型上下文 */
function stringifyToolInput(input: unknown): string | undefined {
	if (input && typeof input === "object") {
		const record = input as Record<string, unknown>;
		if ("fileBase64" in record || "base64" in record) {
			const clean = { ...record };
			delete clean.fileBase64;
			delete clean.base64;
			return JSON.stringify(clean);
		}
	}
	return JSON.stringify(input);
}

/**
 * 单条工具调用的 token 估算。完成态按 `toolCallId + state` 缓存；
 * 流式中的输入会变，不缓存。
 */
function getToolTokens(part: AppToolUIPart, cache: EstimateCache): ToolTokens {
	const key = `${part.toolCallId}:${part.state}`;
	const cached = cache.tools.get(key);
	if (cached) return cached;

	const input = part.input != null ? estimateTokens(stringifyToolInput(part.input) ?? "") : 0;
	const output =
		part.state === "output-available" && part.output != null
			? estimateTokens(typeof part.output === "string" ? part.output : JSON.stringify(part.output))
			: 0;
	const tokens: ToolTokens = { input, output };

	if (part.state === "output-available" || part.state === "output-error") {
		if (cache.tools.size >= TOOL_CACHE_LIMIT) cache.tools.clear();
		cache.tools.set(key, tokens);
	}

	return tokens;
}

/** 估算一条消息的 token；命中消息缓存时直接返回 */
function getMessageTokens(message: AppUIMessage, cache: EstimateCache): MessageTokens {
	const cached = cache.messages.get(message);
	if (cached) return cached;

	let msgTokens = 0;
	let toolResultTokens = 0;

	for (const part of message.parts) {
		if (part.type === "text") {
			const tokens = estimateTokens(part.text);
			if (message.role === "assistant" || message.role === "user") {
				msgTokens += tokens;
			}
		} else if (part.type === "reasoning") {
			// Anthropic thinking tokens 不占上下文，跳过
		} else if (part.type === "file") {
			msgTokens += 85;
		} else if (isAppToolPart(part)) {
			const { input, output } = getToolTokens(part, cache);
			msgTokens += input;
			toolResultTokens += output;
		}
	}

	const tokens: MessageTokens = { msgTokens, toolResultTokens };
	cache.messages.set(message, tokens);
	return tokens;
}

/**
 * 估算上下文占用。
 *
 * `cache` 由调用方持有并在会话切换时重建；不传则每次新建（适合测试或一次性调用）。
 */
export function estimateUsage(
	messages: AppUIMessage[],
	mcpToolCount: number,
	total: number,
	cache: EstimateCache = createEstimateCache(),
): ContextUsage {
	const systemInstructions = SYSTEM_PROMPT_BASE_TOKENS;
	const activeToolDefinitions = getActiveToolDefinitionCount(messages, mcpToolCount);
	const toolDefinitions = activeToolDefinitions * AVG_TOKENS_PER_TOOL;

	let msgTokens = 0;
	let toolResultTokens = 0;

	for (const message of messages) {
		const { msgTokens: m, toolResultTokens: t } = getMessageTokens(message, cache);
		msgTokens += m;
		toolResultTokens += t;
	}

	const used = systemInstructions + toolDefinitions + msgTokens + toolResultTokens;
	const percent = Math.min(Math.round((used / total) * 100), 100);

	return {
		total,
		used,
		percent,
		isReal: false,
		breakdown: { systemInstructions, toolDefinitions, messages: msgTokens, toolResults: toolResultTokens },
	};
}

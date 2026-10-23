import { convertToModelMessages, streamText, type ModelMessage, type ToolSet } from "ai";
import { asMergeableDelta, DeltaBatcher, toUIMessageChunk } from "@/lib/chat/delta-batcher";
import { injectCacheControl } from "@/lib/llm/cache-control";
import { type AppUIMessage } from "@/lib/agent/ui-message";
import { getToolDefinitions, baseToolNames, gatewayToolNames } from "@/lib/tools/registry";
import { getMcpManagerForRequest } from "@/lib/mcp";
import {
	buildDynamicContextPrompt,
	buildStaticSystemPrompt,
	wrapDynamicContextPrompt,
} from "@/lib/agent/system-prompt";
import { buildInjectionWarning } from "@/lib/agent/input-guard";
import { recoverActiveModule } from "@/lib/agent/recover-module";
import { ModuleTracker } from "@/lib/agent/module-tracker";
import { UsageTracker } from "@/lib/agent/usage-tracker";
import { buildLLM, detectProvider } from "@/lib/llm/provider";
import { buildProviderOptions } from "@/lib/llm/provider-options";
import { LLM_CONFIG, VISION_LLM_CONFIG, getMaxOutputTokens } from "@/lib/config";
import { errorLogger } from "@/lib/logging";
import { normalizeChatRouteError } from "@/lib/llm/error-normalize";
import { createTranslator, normalizeLocale, type AppLocale } from "@/lib/i18n";
import { resolveRequestLocale } from "@/lib/i18n/request";
import "@/lib/env-check";

export const maxDuration = 60;

// ─── 流式下发的节奏 ──────────────────────────────────────

// 是否把思维链（reasoning）流式下发到前端。
const STREAM_REASONING = process.env.LLM_STREAM_REASONING !== "false";

// 思维链合并下发间隔（毫秒）。服务端低频下发，客户端再按帧逐步显示。
const REASONING_FLUSH_MS = (() => {
	const raw = Number(process.env.LLM_REASONING_FLUSH_MS);
	if (!Number.isFinite(raw)) return 400;
	return Math.min(Math.max(raw, 0), 10_000);
})();

// 正文文本合并下发间隔（毫秒）。客户端每个 chunk 都要重新解析整篇 markdown。
const TEXT_FLUSH_MS = (() => {
	const raw = Number(process.env.LLM_TEXT_FLUSH_MS);
	if (!Number.isFinite(raw)) return 80;
	return Math.min(Math.max(raw, 0), 10_000);
})();

// 工具参数合并下发间隔（毫秒）。execute_code 的参数是逐段流下来的。
const TOOL_INPUT_FLUSH_MS = (() => {
	const raw = Number(process.env.LLM_TOOL_INPUT_FLUSH_MS);
	if (!Number.isFinite(raw)) return 100;
	return Math.min(Math.max(raw, 0), 10_000);
})();

const DELTA_FLUSH_POLICY = {
	reasoningMs: REASONING_FLUSH_MS,
	textMs: TEXT_FLUSH_MS,
	toolInputMs: TOOL_INPUT_FLUSH_MS,
};

const llm = buildLLM({
	model: LLM_CONFIG.model,
	apiKey: process.env[LLM_CONFIG.apiKeyEnv],
	baseURL: LLM_CONFIG.baseURL,
});

const visionLlm = VISION_LLM_CONFIG.model
	? buildLLM({
		model: VISION_LLM_CONFIG.model,
		apiKey: process.env[VISION_LLM_CONFIG.apiKeyEnv] ?? process.env[LLM_CONFIG.apiKeyEnv],
		baseURL: VISION_LLM_CONFIG.baseURL ?? LLM_CONFIG.baseURL,
	})
	: null;

// ─── 辅助函数 ──────────────────────────────────────────

function hasImageInMessages(messages: AppUIMessage[]): boolean {
	return messages.some(msg =>
		msg.parts.some((part) =>
			part.type === "file" && typeof part.mediaType === "string" && part.mediaType.startsWith("image/")
		)
	);
}

async function resolveMcpTools(req: Request, locale: AppLocale, mcpClientId?: string) {
	const mcpManager = getMcpManagerForRequest(req, mcpClientId);
	if (!mcpManager) {
		return {
			allTools: {},
			mcpContext: undefined,
			mcpToolNames: [],
		};
	}
	const mcpToolDefs = await mcpManager.getToolDefs(locale);
	return {
		allTools: mcpToolDefs,
		mcpContext: (await mcpManager.buildContext(locale)) || undefined,
		mcpToolNames: Object.keys(mcpToolDefs),
	};
}

function resolveModel(messages: AppUIMessage[]) {
	const useVision = visionLlm && hasImageInMessages(messages);
	const activeModelName = useVision ? VISION_LLM_CONFIG.model! : LLM_CONFIG.model;
	const activeBaseURL = useVision
		? (VISION_LLM_CONFIG.baseURL ?? LLM_CONFIG.baseURL)
		: LLM_CONFIG.baseURL;
	const provider = detectProvider(activeModelName, activeBaseURL);
	return {
		model: (useVision ? visionLlm : llm) as ReturnType<typeof buildLLM>,
		provider,
		activeModelName,
		activeBaseURL,
	};
}

// ─── 重试配置 ────────────────────────────────────────────

const MAX_RETRIES = 5;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRetryableError(e: unknown): boolean {
	const status =
		(e as { status?: number })?.status ??
		(e as { statusCode?: number })?.statusCode;
	if (typeof status === "number") return RETRYABLE_STATUSES.has(status);
	// 网络错误（fetch failed / ECONNRESET 等）
	if (e instanceof TypeError) return true;
	return false;
}

function getRetryDelay(attempt: number, e: unknown): number {
	// 优先使用上游返回的 Retry-After 头（单位：秒）
	const headers = (e as { responseHeaders?: Record<string, string> })?.responseHeaders;
	if (headers) {
		const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
		if (retryAfter) {
			const seconds = parseInt(retryAfter, 10);
			if (!isNaN(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
		}
	}
	// 指数退避：1s → 2s → 4s → 8s → 16s（上限 20s）
	return Math.min(1000 * Math.pow(2, attempt - 1), 20_000);
}

// SSE 协议头（与 AI SDK UI message stream 格式兼容）
const UI_STREAM_HEADERS: Record<string, string> = {
	"Content-Type": "text/event-stream",
	"Cache-Control": "no-cache",
	"Connection": "keep-alive",
	"x-vercel-ai-ui-message-stream": "v1",
	"x-accel-buffering": "no",
};

// ─── Route Handler ─────────────────────────────────────

export async function POST(req: Request) {
	const fallbackLocale = resolveRequestLocale(req);
	const fallbackT = createTranslator(fallbackLocale);
	let messages: AppUIMessage[];
	let workbookContext: string | undefined;
	let taskContext: string | undefined;
	let dirtyContext: string | undefined;
	let locale: AppLocale = "en";
	let requestId = `server_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	let sessionId: string | undefined;
	let clientLastMessageId: string | undefined;
	let clientLastMessageRole: string | undefined;
	let mcpClientId: string | undefined;

	try {
		const parsed = await req.json() as {
			messages: AppUIMessage[];
			workbookContext?: string;
			taskContext?: string;
			dirtyContext?: string;
			locale?: string;
			requestId?: string;
			sessionId?: string;
			clientLastMessageId?: string;
			clientLastMessageRole?: string;
			mcpClientId?: string;
		};
		({ messages, workbookContext, taskContext, dirtyContext } = parsed);
		locale = normalizeLocale(parsed.locale);
		if (parsed.requestId) requestId = parsed.requestId;
		sessionId = parsed.sessionId;
		clientLastMessageId = parsed.clientLastMessageId;
		clientLastMessageRole = parsed.clientLastMessageRole;
		mcpClientId = parsed.mcpClientId;
	} catch {
		return new Response(fallbackT("chat.invalidRequestBody"), { status: 400 });
	}

	const logContext = {
		requestId,
		sessionId,
		clientLastMessageId,
		clientLastMessageRole,
		messageCount: messages.length,
	};
	errorLogger.log("chat/route", "Chat request started", {
		level: "info",
		details: logContext,
	});

	let mcpTools: Awaited<ReturnType<typeof resolveMcpTools>>["allTools"];
	let mcpContext: string | undefined;
	let mcpToolNames: string[];

	try {
		({ allTools: mcpTools, mcpContext, mcpToolNames } = await resolveMcpTools(req, locale, mcpClientId));
	} catch {
		errorLogger.log("chat/route", "MCP initialization failed", {
			level: "error",
			details: logContext,
		});
		return new Response(createTranslator(locale)("chat.mcpInitializationFailed"), { status: 500 });
	}

	const allTools = { ...getToolDefinitions(locale), ...mcpTools } as ToolSet;

	const { model, provider, activeModelName, activeBaseURL } = resolveModel(messages);

	const moduleTracker = new ModuleTracker(recoverActiveModule(messages));
	const usageTracker = new UsageTracker();

	// 输入注入检测
	const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
	const lastUserText = lastUserMsg?.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text)
		.join(" ") ?? "";
	const injectionWarning = buildInjectionWarning(lastUserText, locale);

	const baseTools = baseToolNames.filter(n => n in allTools);
	const gatewayTools = gatewayToolNames.filter(n => n in allTools);

	const isAnthropic = provider === "anthropic";
	const providerOptions = buildProviderOptions(provider, activeModelName, activeBaseURL);

	// ── 缓存前缀的边界 ────────────────────────────────────────────────
	//
	// OpenAI 兼容接口的上下文缓存按**前缀**逐字节匹配：从第一个 token 开始，
	// 一旦某处不同，后面全部作废。所以「稳定的东西放前面、易变的放后面」不是风格
	// 问题，是成本问题。
	//
	// 静态段进 system（角色、规则、工具用法、MCP 说明）；工作簿状态、任务计划、
	// 变更记录这些每一步都可能变的内容，拼成**最后一条消息**。
	const staticPrompt = buildStaticSystemPrompt({ mcpContext, locale });
	const systemPrompt = injectionWarning ? `${staticPrompt}\n\n${injectionWarning}` : staticPrompt;

	const dynamicSections = buildDynamicContextPrompt({ workbookContext, taskContext, dirtyContext, locale });

	const modelMessages = await convertToModelMessages(messages);
	const promptMessages: ModelMessage[] = dynamicSections
		? [...modelMessages, { role: "user", content: wrapDynamicContextPrompt(dynamicSections, locale) }]
		: modelMessages;

	const encoder = new TextEncoder();

	// 构造带重试的外层 ReadableStream（SSE 格式，与 AI SDK UI message stream 协议兼容）
	const outerStream = new ReadableStream<Uint8Array>({
		start(controller) {
			(async () => {
				let attempt = 0;

				while (true) {
					try {
						const result = streamText({
							model,
							abortSignal: req.signal,
							system: systemPrompt,
							messages: promptMessages,
							tools: allTools,
							maxOutputTokens: getMaxOutputTokens(activeModelName),
							...(providerOptions && { providerOptions }),

							prepareStep: ({ messages: stepMsgs }) => ({
								activeTools: moduleTracker.resolveActiveTools({
									allTools, baseTools, gatewayTools, mcpTools: mcpToolNames,
								}),
								messages: injectCacheControl(stepMsgs, isAnthropic),
							}),

							onStepFinish: ({
								finishReason,
								rawFinishReason,
								reasoningText,
								text,
								toolCalls,
								toolResults,
								usage,
							}) => {
								usageTracker.recordStep(usage);
								moduleTracker.transition(toolCalls ?? []);
								errorLogger.log("chat/step", "Chat generation step finished", {
									level: "info",
									details: {
										...logContext,
										finishReason,
										rawFinishReason,
										textLength: text.length,
										reasoningLength: reasoningText?.length ?? 0,
										toolCalls: (toolCalls ?? []).map((call) => call.toolName),
										toolResults: (toolResults ?? []).map((result) => ({
											toolName: result.toolName,
											hasOutput: result.output != null,
										})),
									},
								});
								if (toolResults) {
									for (const tr of toolResults) {
										if (typeof tr.output === "object" && tr.output !== null) {
											const r = tr.output as Record<string, unknown>;
											if (r.success === false && r.error) {
												errorLogger.captureToolResult(tr.toolName, r as { success: boolean; error: string });
											}
										}
									}
								}
							},

							onError: ({ error }) => {
								errorLogger.capture("chat/stream", error);
							},

							onFinish: ({
								finishReason,
								rawFinishReason,
								reasoningText,
								steps,
								text,
								toolCalls,
								toolResults,
								totalUsage,
							}) => {
								usageTracker.finalize(totalUsage);
								errorLogger.log("chat/finish", "Chat generation finished", {
									level: "info",
									details: {
										...logContext,
										finishReason,
										rawFinishReason,
										stepCount: steps.length,
										textLength: text.length,
										reasoningLength: reasoningText?.length ?? 0,
										toolCalls: (toolCalls ?? []).map((call) => call.toolName),
										toolResults: (toolResults ?? []).map((result) => ({
											toolName: result.toolName,
											hasOutput: result.output != null,
										})),
										totalUsage,
									},
								});
							},
						});

						// 把 AI SDK UI message stream 转发到外层 SSE 流。
						//
						// **增量类 chunk（思维链、正文、工具参数）合并后再发**，其余原样透传。
						// 合并只改下发频率、不改内容：同一个 id 的连续增量拼起来，对客户端就是
						// 同一段文字（客户端本来就是 `part.text += delta`），而且顺序不变——
						// 遇到任何别的 chunk 之前先冲刷。
						const uiStream = result.toUIMessageStream({ sendReasoning: STREAM_REASONING });
						const reader = uiStream.getReader();
						const batcher = new DeltaBatcher(DELTA_FLUSH_POLICY);

						/** 下发一个 chunk。value 是 UIMessageChunk 对象，需序列化为 SSE data line */
						const send = (value: unknown) => {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
						};

						while (true) {
							const { done, value } = await reader.read();
							if (done) break;

							const incoming = asMergeableDelta(value);
							if (incoming) {
								const flushed = batcher.push(incoming);
								if (flushed) send(toUIMessageChunk(flushed));
								continue;
							}

							// 任何其它 chunk 之前先冲刷，保证下发顺序不变
							const flushed = batcher.flush();
							if (flushed) send(toUIMessageChunk(flushed));
							send(value);
						}

						const tail = batcher.flush();
						if (tail) send(toUIMessageChunk(tail));
						controller.close();
						return;

					} catch (e) {
						// 客户端已 abort，静默退出
						if (req.signal.aborted) {
							controller.close();
							return;
						}

						attempt++;

						const normalized = normalizeChatRouteError(e, locale);

						if (!isRetryableError(e) || attempt > MAX_RETRIES) {
							// 超出重试上限或不可重试：通过 error chunk 告知客户端
							console.error("[chat/route] fatal", normalized.message);
							errorLogger.capture("chat/route", e, { ...logContext, attempt, normalizedMessage: normalized.message });
							const errChunk = JSON.stringify({ type: "error", errorText: normalized.message });
							controller.enqueue(encoder.encode(`data: ${errChunk}\n\n`));
							controller.close();
							return;
						}

						// 可重试：推送重试进度 chunk，然后等待退避时间
						const delay = getRetryDelay(attempt, e);
						console.warn(`[chat/route] retry ${attempt}/${MAX_RETRIES} in ${delay}ms:`, normalized.message);
						errorLogger.capture("chat/route/retry", e, { ...logContext, attempt, delay, normalizedMessage: normalized.message });

						const retryChunk = JSON.stringify({
							type: "data-retry-status",
							id: `retry-${attempt}`,
							data: { attempt, maxRetries: MAX_RETRIES, reason: normalized.message },
							transient: true,
						});
						controller.enqueue(encoder.encode(`data: ${retryChunk}\n\n`));

						// 等待退避（abort 时提前退出）
						await new Promise<void>((resolve) => {
							const timer = setTimeout(resolve, delay);
							req.signal.addEventListener("abort", () => {
								clearTimeout(timer);
								resolve();
							}, { once: true });
						});
						if (req.signal.aborted) {
							controller.close();
							return;
						}
					}
				}
			})().catch((e) => {
				// 防御性兜底：未捕获的异常不能导致流永久挂起
				try { controller.error(e); } catch { /* already closed */ }
			});
		},
		cancel() {
			// ReadableStream 被取消时无需额外操作，abort signal 已处理
		},
	});

	return new Response(outerStream, { headers: UI_STREAM_HEADERS });
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppUIMessage } from "@/lib/agent/ui-message";
import {
	createEstimateCache,
	estimateUsage,
	type ContextUsage,
} from "@/lib/agent/context-estimate";
import { MODEL_CONTEXT_WINDOW } from "@/lib/config";
import { useServerContextWindow } from "./useServerContextWindow";
import { useThrottledValue } from "./useThrottledValue";

export type { ContextUsage } from "@/lib/agent/context-estimate";

/**
 * 估算的更新间隔。
 *
 * 流式时消息每 80ms 变一次；上下文环不需要那个刷新率。300ms 既跟得上观感，
 * 又把"全量估算"的次数从约 12.5 次/秒降到 3 次/秒。配合 `context-estimate`
 * 里的增量缓存，每次重算只碰正在变化的那条消息。
 */
const ESTIMATE_THROTTLE_MS = 300;

export function useContextUsage(
	messages: AppUIMessage[],
	mcpToolCount = 0,
	/** useChat 的 status，用于检测流结束 */
	chatStatus?: string,
	/** 当前会话 ID，切换时触发 usage 恢复 */
	sessionId?: string,
	/** 当前会话存储的 token 用量（切换会话时从 session 读取） */
	sessionTokenUsage?: { promptTokens: number; contextWindow: number } | null,
	/** 成功获取真实 usage 时的回调（用于持久化到会话） */
	onRealUsageFetched?: (usage: { promptTokens: number; contextWindow: number }) => void,
): ContextUsage {
	/**
	 * 上下文窗口由**服务端**给出，不从模型名推导。
	 *
	 * 客户端包里读不到 `LLM_MODEL`（它不是 `NEXT_PUBLIC_` 变量），会静默落到兜底模型，
	 * 于是无论真实模型是什么、`CONTEXT_WINDOW_MAP` 怎么改，窗口都被当成 128K。
	 * 详见 `useServerContextWindow`。
	 */
	const serverContextWindow = useServerContextWindow();

	// 当前会话流结束后获取到的真实 usage（仅绑定到获取时的会话 ID）
	const [streamUsage, setStreamUsage] = useState<{
		sessionId: string | undefined;
		promptTokens: number;
		contextWindow: number;
	} | null>(null);

	const prevStatusRef = useRef(chatStatus);

	// 流结束时 fetch 真实 usage，并通知外部持久化到会话
	useEffect(() => {
		const wasGenerating = prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted";
		prevStatusRef.current = chatStatus;

		if (!wasGenerating || chatStatus !== "ready" || messages.length === 0) return;

		const controller = new AbortController();
		fetch("/api/usage", { signal: controller.signal })
			.then(r => r.json())
			.then(data => {
				if (data.usage?.promptTokens > 0) {
					const usage = {
						promptTokens: data.usage.promptTokens,
						contextWindow: data.contextWindow,
					};
					setStreamUsage({ sessionId, ...usage });
					onRealUsageFetched?.(usage);
				}
			})
			.catch(() => { /* abort 或网络失败，回退到估算 */ });

		return () => controller.abort();
	}, [chatStatus, messages.length, onRealUsageFetched, sessionId]);

	// 估算缓存按会话隔离：切换会话后旧消息的缓存不再有意义。
	// 用 useMemo 而不是 ref——React 19 的规则不允许在 render 阶段读写 ref，
	// 而这里必须在渲染时就把缓存交给估算函数（缓存对象本身可安全复用）。
	const estimateCache = useMemo(() => {
		// 会话维度参与依赖，切换时丢弃旧缓存
		void sessionId;
		return createEstimateCache();
	}, [sessionId]);

	// 流式时 messages 每 80ms 变一次；估算降到约 3 次/秒。
	// 缓存保证即使重算，也只碰正在变化的那条消息里未完成的 part。
	const sampledMessages = useThrottledValue(messages, ESTIMATE_THROTTLE_MS);

	// 基于节流后的消息估算：会话切换会丢弃旧缓存，最多一个节流周期后刷新到新会话
	const estimated = useMemo(
		() => {
			return estimateUsage(
				sampledMessages,
				mcpToolCount,
				serverContextWindow ?? MODEL_CONTEXT_WINDOW,
				estimateCache,
			);
		},
		[sampledMessages, estimateCache, mcpToolCount, serverContextWindow],
	);

	// 当前会话优先使用本会话流结束后获取到的 usage；否则回退到会话持久化值。
	const realUsage = useMemo(() => {
		if (streamUsage && streamUsage.sessionId === sessionId) {
			return {
				promptTokens: streamUsage.promptTokens,
				contextWindow: streamUsage.contextWindow,
			};
		}
		return sessionTokenUsage ?? null;
	}, [streamUsage, sessionId, sessionTokenUsage]);

	return useMemo(() => {
		if (realUsage) {
			// 服务端当次算出来的窗口优先于会话里持久化的旧值——模型换过之后旧值就过时了
			const total = serverContextWindow ?? realUsage.contextWindow;
			const serverUsed = realUsage.promptTokens;
			// 部分 provider（如 GLM）的 inputTokens 只含 system+tools，不含对话消息。
			// 已获取服务端 usage 时仍取 max(server, client)，避免 provider 漏报时显示偏低。
			const clientUsed = estimated.used;
			const used = Math.max(serverUsed, clientUsed);
			const percent = Math.min(Math.round((used / total) * 100), 100);
			return {
				total,
				used,
				percent,
				isReal: true,
				breakdown: estimated.breakdown, // 明细仍用估算（API 不提供分类）
			};
		}

		return estimated;
	}, [realUsage, estimated, serverContextWindow]);
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SpreadWorkbook } from "@/lib/agent/types";
import { taskStore } from "@/lib/agent/task-store";
import { normalizeLocale, type AppLocale } from "@/lib/i18n";

/**
 * 工作簿上下文 + 任务上下文 + 变更上下文组装。
 * 供 useChat 的 transport body 调用，每次 HTTP 请求携带最新的环境快照。
 *
 * workbook 通过 ref 持有，确保 buildBody 引用稳定，
 * 避免 DefaultChatTransport 因 body 函数变化而不必要地重建。
 *
 * @param dirtyConsumer 变更消费函数（来自 useDirtyTracker.consume）。
 *   每次 buildBody 调用时触发，返回上次请求以来的变更摘要并重置状态。
 */
export function useChatContext(
	workbook: SpreadWorkbook | null,
	dirtyConsumer?: () => string | undefined,
	locale: AppLocale = "en",
	metadataProvider?: () => Record<string, unknown>,
) {
	const bridgeRef = useRef<typeof import("@/lib/spreadjs/bridge") | null>(null);
	const workbookRef = useRef(workbook);
	workbookRef.current = workbook;
	const dirtyConsumerRef = useRef(dirtyConsumer);
	dirtyConsumerRef.current = dirtyConsumer;
	const localeRef = useRef<AppLocale>(normalizeLocale(locale));
	localeRef.current = normalizeLocale(locale);
	const metadataProviderRef = useRef(metadataProvider);
	metadataProviderRef.current = metadataProvider;

	useEffect(() => {
		let cancelled = false;

		// dev server 重编译/重启后，旧标签页持有的 chunk 哈希会短暂 404（ChunkLoadError）。
		// 这里必须兜住：一旦失败且不重试，bridgeRef 会永久为 null，
		// 之后每次请求的 workbookContext 都会静默丢失。
		const RETRY_DELAYS = [500, 1500, 4000];

		const load = (attempt: number) => {
			import("@/lib/spreadjs/bridge")
				.then((m) => {
					if (!cancelled) bridgeRef.current = m;
				})
				.catch((error) => {
					if (cancelled) return;
					if (attempt >= RETRY_DELAYS.length) {
						console.warn("[useChatContext] bridge 模块加载失败，工作簿上下文将不可用", error);
						return;
					}
					setTimeout(() => load(attempt + 1), RETRY_DELAYS[attempt]);
				});
		};

		load(0);

		return () => {
			cancelled = true;
		};
	}, []);

	/** 构建 transport body 附加数据（每次 HTTP 请求时调用） */
	const buildBody = useCallback(() => ({
		workbookContext: workbookRef.current && bridgeRef.current
			? bridgeRef.current.captureWorkbookContext(workbookRef.current, localeRef.current)
			: undefined,
		taskContext: taskStore.serialize(localeRef.current) ?? undefined,
		dirtyContext: dirtyConsumerRef.current?.() ?? undefined,
		locale: localeRef.current,
		...metadataProviderRef.current?.(),
	}), []);

	return { buildBody };
}

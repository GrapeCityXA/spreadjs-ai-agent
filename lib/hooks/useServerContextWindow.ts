"use client";

import { useEffect, useState } from "react";

/**
 * 服务端算出来的上下文窗口大小。
 *
 * **客户端不能自己推导。** `LLM_CONFIG.model` 读的是 `process.env.LLM_MODEL`，而它
 * 不是 `NEXT_PUBLIC_` 变量——在客户端包里是 `undefined`，于是静默落到兜底的
 * `glm-4.7`。结果无论真实模型是什么，窗口都被当成 128K：界面上的上下文环按错误的
 * 分母算百分比，改 `CONTEXT_WINDOW_MAP` 也看不出任何变化。
 *
 * 窗口该由服务端说了算——`/api/usage` 每次都带 `contextWindow`，那是真模型算出来的。
 *
 * **挂载时就取一次**，因为第一轮对话之前也需要正确的分母；只在轮次结束后取，
 * 新会话会先按错误的窗口显示一整段。
 */
export function useServerContextWindow(): number | null {
	const [contextWindow, setContextWindow] = useState<number | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/usage", { signal: controller.signal })
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (typeof data?.contextWindow === "number" && data.contextWindow > 0) {
					setContextWindow(data.contextWindow);
				}
			})
			.catch(() => {
				/* abort 或网络失败：保留调用方的本地兜底值 */
			});

		return () => controller.abort();
	}, []);

	return contextWindow;
}

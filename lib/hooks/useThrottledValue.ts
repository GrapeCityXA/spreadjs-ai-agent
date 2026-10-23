"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 节流值：最多每 `interval` 毫秒向下游交付一次新值，保证末值最终落地（trailing）。
 *
 * 用途是把"每次流式增量都要重算"的派生值降到可接受的频率。与 `useDeferredValue`
 * 的区别是这里**有确定的上界**：deferred 的更新时机取决于 React 的调度，
 * 忙的时候会跳过中间值，但不保证每 N 毫秒一定更新一次。
 */
export function useThrottledValue<T>(value: T, interval: number): T {
	const [throttled, setThrottled] = useState(value);
	const latestRef = useRef(value);
	const lastAppliedRef = useRef(0);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 记下最新值供尾巴定时器读取。React 19 的规则不允许在 render 阶段写 ref，
	// 放到 effect 里；它声明在前面，先于下面的调度 effect 执行。
	useEffect(() => {
		latestRef.current = value;
	}, [value]);

	useEffect(() => {
		// 已有一个尾巴在等：到点它会取最新的 latestRef，不必再排
		if (timerRef.current !== null) return;

		const delay = Math.max(0, interval - (Date.now() - lastAppliedRef.current));
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			lastAppliedRef.current = Date.now();
			setThrottled(latestRef.current);
		}, delay);
	}, [value, interval]);

	useEffect(() => () => {
		if (timerRef.current !== null) clearTimeout(timerRef.current);
	}, []);

	return throttled;
}

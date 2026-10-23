"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * 内容增长时把滚动条保持在底部。
 *
 * **用户往上翻时不抢。** 一旦他主动离开底部去读早先的内容，就停止跟随——否则每出一行
 * 就把他拽回底部，等于读不了。滚回底部后自动恢复跟随。
 *
 * **首次渲染不滚动。** 从历史恢复的思维链是整段出现的，不是"流出来的"；此时跳到结尾
 * 会让人错过开头。只跟随**挂载之后**的增长，流式与放字都覆盖到了。
 *
 * **判定「用户滚开了」只看方向，不看距离。** 曾经用「离底部超过 8px 就算滚开」，
 * 结果偶发停止跟随：程序化贴底后浏览器**异步**派发 scroll 事件，这期间逐字显示又让
 * 内容长高了一截，事件到达时算出的距离已经超过阈值——用户明明没动，却被判定为"滚开了"。
 * 现在只有 scrollTop **向上移动**才算用户主动离开；内容增长（scrollTop 不变）和
 * 程序化贴底（scrollTop 增大）都不会关掉跟随。
 *
 * 返回一个**回调 ref**，而不是接收 ref 对象。原因是目标元素可能后于首次渲染才出现
 * （例如折叠面板里的内容）——ref 对象是稳定的，用 `useEffect([ref])` 只会在挂载时跑一次，
 * 那时元素还不存在，监听就永远挂不上。回调 ref 在元素挂上/摘掉时各跑一次，正好对齐。
 *
 * @param growth 每次增长都会变化的值（例如已显示的字符数）
 */

/** 距底部这个像素数之内都算「在底部」。留一点余量，免得亚像素误差被当成"已滚开" */
const BOTTOM_THRESHOLD_PX = 8;
/** 小于这个位移视为抖动，不算用户滚动 */
const USER_SCROLL_EPSILON_PX = 1;

export interface StickState {
	pinned: boolean;
	lastScrollTop: number;
}

/**
 * 根据一次 scroll 事件更新跟随状态。纯函数，便于覆盖那几个边界。
 */
export function evaluateScroll(
	metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
	previous: StickState,
): StickState {
	const distance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;

	// 在底部：恢复跟随
	if (distance <= BOTTOM_THRESHOLD_PX) {
		return { pinned: true, lastScrollTop: metrics.scrollTop };
	}

	// 只有向上移动才是用户主动离开底部：
	// - 内容增长：scrollTop 不变
	// - 程序化贴底：scrollTop 增大
	// 两者都不能把跟随关掉
	const movedUp = metrics.scrollTop < previous.lastScrollTop - USER_SCROLL_EPSILON_PX;
	return {
		pinned: movedUp ? false : previous.pinned,
		lastScrollTop: metrics.scrollTop,
	};
}

export function useStickToBottom<T extends HTMLElement>(growth: unknown): (node: T | null) => void {
	const nodeRef = useRef<T | null>(null);
	const stateRef = useRef<StickState>({ pinned: true, lastScrollTop: 0 });
	/** 跳过首次：挂载那一刻的滚动位置由浏览器决定，不该被改 */
	const mountedRef = useRef(false);

	const onScroll = useCallback(() => {
		const node = nodeRef.current;
		if (!node) return;
		stateRef.current = evaluateScroll(
			{
				scrollTop: node.scrollTop,
				scrollHeight: node.scrollHeight,
				clientHeight: node.clientHeight,
			},
			stateRef.current,
		);
	}, []);

	/** 滚轮向上是明确意图：直接在事件里解除跟随，不必等异步的 scroll 事件 */
	const onWheel = useCallback((event: WheelEvent) => {
		if (event.deltaY >= 0) return;
		const node = nodeRef.current;
		if (!node) return;
		// 不能滚动的块、或已经到顶的块，滚轮会交给外层页面——那不是想离开这里
		if (node.scrollHeight <= node.clientHeight + 1) return;
		if (node.scrollTop <= 0) return;
		stateRef.current.pinned = false;
	}, []);

	const attach = useCallback(
		(node: T | null) => {
			nodeRef.current?.removeEventListener("scroll", onScroll);
			nodeRef.current?.removeEventListener("wheel", onWheel);
			nodeRef.current = node;
			if (!node) return;
			node.addEventListener("scroll", onScroll, { passive: true });
			node.addEventListener("wheel", onWheel, { passive: true });
			// 元素刚出现时按「贴底」起算：此时内容一般是短的，也确实在底部
			stateRef.current = { pinned: true, lastScrollTop: node.scrollTop };
		},
		[onScroll, onWheel],
	);

	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true;
			return;
		}
		const node = nodeRef.current;
		if (!node || !stateRef.current.pinned) return;
		node.scrollTop = node.scrollHeight;
	}, [growth]);

	return attach;
}

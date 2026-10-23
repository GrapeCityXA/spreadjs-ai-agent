"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 让一段不断增长的目标文本**连续地**显示出来。
 *
 * 背景：服务端每 `LLM_REASONING_FLUSH_MS`（默认 400ms）才推一次思维链——低频才便宜。
 * 但低频直接渲染就是"一阵一阵"地蹦字。两者要兼得，就得把「到达」与「显示」解耦：
 * 到达保持低频，显示由这里按帧推进。
 *
 * **节奏必须跟着到达速率走，不能"尽快追平"。** 每帧只顾追平的话，缓冲区会在每个间隔
 * 的开头被抽干、末尾再攒满，于是画面上仍是与下发同频的一阵一阵——问题原样搬了过来。
 * 按到达速率播放则缓冲区保持恒定，观感连续。
 *
 * 返回当前应显示的字符数。
 */
export function useProgressiveReveal(target: string, streaming: boolean): number {
	// 挂载时并不在流式（例如从历史里恢复的会话）：文本是一次性出现的，
	// 不该被"一个字一个字打出来"，直接全量显示
	const [count, setCount] = useState(() => (streaming ? 0 : target.length));
	// 分数的真实进度。state 只用于触发渲染，按帧推进用 ref 免得被取整拖慢
	const progressRef = useRef(count);
	const rateRef = useRef(0); // 字/毫秒，指数滑动平均
	/** 最近一次下发的字数。追赶阈值由它推出——见 MIN_BACKLOG_CHARS */
	const lastChunkRef = useRef(0);
	const lastLenRef = useRef(streaming ? 0 : target.length);
	const lastArrivalAtRef = useRef(0);
	const targetRef = useRef(target);
	const streamingRef = useRef(streaming);

	useEffect(() => {
		targetRef.current = target;
		streamingRef.current = streaming;
	}, [target, streaming]);

	useEffect(() => {
		let frame: number | null = null;
		let lastFrameAt = performance.now();

		const step = (now: number) => {
			// 标签页切回来时时间差会很大，夹住，免得一帧甩出一大段
			const dt = Math.min(now - lastFrameAt, 100);
			lastFrameAt = now;

			const goal = targetRef.current.length;

			// 目标变长 → 更新到达速率。这是"播放速度"的唯一来源
			if (goal > lastLenRef.current) {
				const added = goal - lastLenRef.current;
				// 第一次到达没有"间隔"可测（上一次的时间戳还不存在），
				// 硬算会把速率估成趋近 0，第一批字就会以爬行的速度出来。跳过，交给下面的兜底
				lastChunkRef.current = added;
				if (lastArrivalAtRef.current > 0) {
					const since = Math.max(now - lastArrivalAtRef.current, 1);
					const instant = added / since;
					rateRef.current = rateRef.current === 0 ? instant : rateRef.current * 0.7 + instant * 0.3;
				}
				lastLenRef.current = goal;
				lastArrivalAtRef.current = now;
			}

			let next = progressRef.current;
			if (next < goal) {
				const backlog = goal - next;
				// 速率已知就按它播放；还不知道（首批）就按固定窗口放完，避免爬行
				const perFrame = rateRef.current > 0 ? rateRef.current * dt : backlog / FIRST_BURST_FRAMES;
				next += Math.max(perFrame, 0.15);
				// 积压过多时追赶：速率估偏或标签页刚被切回来。
				// 阈值随下发量走——固定阈值在间隔调大之后会**每次都命中**，
				// 于是每次都直接跳到只差一截，等于把整段一次吐出来
				const ceiling = catchupCeiling(lastChunkRef.current);
				if (goal - next > ceiling) next = goal - ceiling;
				next = Math.min(next, goal);
				progressRef.current = next;
				setCount(Math.floor(next));
			}

			// 还在流式、或还没放完，就继续；两者都不成立才停
			if (streamingRef.current || progressRef.current < goal) {
				frame = requestAnimationFrame(step);
			} else {
				frame = null;
			}
		};

		frame = requestAnimationFrame(step);
		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, []);

	return count;
}

/**
 * 允许落后的**下限**（字数）。实际阈值取它与「最近一次下发量的两倍」中的较大者。
 *
 * **为什么不能是固定值**：下发间隔调大之后，一个 chunk 本身就很大（间隔 1 秒时一个
 * chunk 常有几百字）。固定的 240 字会让每一次都命中"早就该追平"的判定，直接跳到只差
 * 240 字再补完——表现就是"一下全出来"，正是按速率播放要避免的。
 *
 * 随下发量走之后，正常情况（积压约一个 chunk）永不触发追赶；只有真的异常——速率估偏、
 * 或标签页刚被切回来——才跳一次。
 */
const MIN_BACKLOG_CHARS = 240;

/**
 * 追赶阈值：允许落后多少字才直接跳过去。
 *
 * 取「下限」与「最近一次下发量的两倍」中的较大者。**必须随下发量缩放**：
 * 下发间隔调大之后一个 chunk 本身就很大，若用固定阈值，每次都会命中"早就该追平"的
 * 判定、把整段一次吐出来——那正是按速率播放要避免的。取两倍是为了让正常情况下
 * （积压约一个 chunk）永不触发追赶。
 */
export function catchupCeiling(lastChunkChars: number): number {
	return Math.max(MIN_BACKLOG_CHARS, lastChunkChars * 2);
}

/**
 * 还测不出到达速率时（首批文字），按这个帧数把积压放完。
 *
 * 约 20 帧 ≈ 330ms：既不至于爬行，也不会一帧甩出一段。
 */
const FIRST_BURST_FRAMES = 20;

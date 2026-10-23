/**
 * 把逐 token 产生的增量按到达节奏攒成批。
 *
 * **为什么要在服务端合批。** 客户端每收到一个 SSE chunk 都要重渲染一次，而正文那一次
 * 还要把**整篇** markdown 重新解析一遍（切块、补全未闭合的语法）。逐 token 下发就是
 * 每秒几十次全量解析，主线程被打满之后滚动、悬停、卡片动画全在排队——看起来像是整个
 * 面板都在卡。合批只改下发频率、不改内容：同一个 id 的连续增量拼起来，对客户端就是
 * 同一段文字（它本来就是 `part.text += delta`）。
 *
 * **工具参数也是逐 token 下发的。** `execute_code` 这种工具一次要传几 KB 的代码，
 * AI SDK 会把它拆成 `tool-input-delta` 逐段发出。这些 chunk 以前原样透传，长任务里
 * 会在短时间内触发成百上千次消息更新——都发生在「执行代码」前后，体感就是整页卡死。
 * 现在它们和正文走同一套合批：同一个 `toolCallId` 的连续片段拼起来再发。
 *
 * 这段逻辑单独成模块，是因为它有个很容易踩的坑：**「没缓冲时把首个 delta 存进去」与
 * 「有缓冲时累加」是两条不同的路径。** 写成 `pending = pending ?? incoming` 再无条件
 * `pending.delta += incoming.delta`，首个 delta 就会被加两遍——每段文字的开头重复一次。
 * 那种 bug 在流式里只能靠肉眼看出来，所以这里把它拆出来直接用测试钉住。
 */

export type DeltaKind = "reasoning-delta" | "text-delta" | "tool-input-delta";

/**
 * 一次可合并的增量。内部统一成 `{ type, id, delta, providerMetadata? }`：
 *
 * - 正文/思维链：`id` 是 part 的 id，`delta` 是文本
 * - 工具参数：`id` 是 `toolCallId`，`delta` 是 `inputTextDelta`
 *
 * 下发前用 `toUIMessageChunk` 还原成 AI SDK 的字段名。
 */
export interface DeltaChunk {
	type: DeltaKind;
	/** 分段键：正文/思维链是 part id，工具参数是 toolCallId */
	id: string;
	delta: string;
	/**
	 * 最近一次非空的 providerMetadata。
	 *
	 * 它必须跟着走：客户端的处理是 `providerMetadata ?? 已有的`，也就是**最后一个非空值
	 * 生效**。合并时保留最后那个非空值，与不合并时的结果完全一致。
	 */
	providerMetadata?: unknown;
}

/**
 * 从 UIMessageChunk 里认出可合并的增量。认不出返回 null，由调用方原样透传。
 *
 * **没有分段键就不合并**：id / toolCallId 缺了它，就没有依据判断两段能不能拼在一起。
 */
export function asMergeableDelta(chunk: unknown): DeltaChunk | null {
	if (chunk == null || typeof chunk !== "object") return null;
	const c = chunk as {
		type?: unknown;
		id?: unknown;
		delta?: unknown;
		toolCallId?: unknown;
		inputTextDelta?: unknown;
		providerMetadata?: unknown;
	};

	// 工具参数：AI SDK 的字段名是 toolCallId + inputTextDelta
	if (c.type === "tool-input-delta") {
		if (typeof c.toolCallId !== "string" || c.toolCallId === "") return null;
		if (typeof c.inputTextDelta !== "string") return null;
		return { type: "tool-input-delta", id: c.toolCallId, delta: c.inputTextDelta };
	}

	if (typeof c.id !== "string" || c.id === "") return null;
	if (typeof c.delta !== "string") return null;
	if (c.type !== "reasoning-delta" && c.type !== "text-delta") return null;

	return {
		type: c.type,
		id: c.id,
		delta: c.delta,
		...(c.providerMetadata != null ? { providerMetadata: c.providerMetadata } : {}),
	};
}

/** 把内部表示还原成 AI SDK 的 UIMessageChunk 字段名 */
export function toUIMessageChunk(delta: DeltaChunk): Record<string, unknown> {
	const base =
		delta.type === "tool-input-delta"
			? { type: delta.type, toolCallId: delta.id, inputTextDelta: delta.delta }
			: { type: delta.type, id: delta.id, delta: delta.delta };
	return delta.providerMetadata != null
		? { ...base, providerMetadata: delta.providerMetadata }
		: base;
}

export interface DeltaFlushPolicy {
	/** 思维链累积多久之后冲刷（毫秒）。0 表示不合并 */
	reasoningMs: number;
	/** 正文累积多久之后冲刷（毫秒）。0 表示不合并 */
	textMs: number;
	/** 工具参数累积多久之后冲刷（毫秒）。缺省跟正文同档 */
	toolInputMs?: number;
}

export class DeltaBatcher {
	/** 正在累积的那一段。同一时刻只会有一段：类型或分段变了就先冲刷 */
	private pending: DeltaChunk | null = null;
	private lastFlush: number;

	constructor(
		private readonly policy: DeltaFlushPolicy,
		private readonly now: () => number = Date.now,
	) {
		this.lastFlush = this.now();
	}

	/**
	 * 收下一个增量，返回本次应当立刻下发的 chunk——**至多一个**。
	 *
	 * 返回的那个既可能是「攒够了」被冲出的一批，也可能是「换了段」被迫提前冲出的
	 * 上一段（此时新这一段留在缓冲区里，等下一次机会）。
	 */
	push(delta: DeltaChunk): DeltaChunk | null {
		// 换了类型（思维链 ↔ 正文 ↔ 工具参数）或换了分段：先把上一段发出去，
		// 否则两段内容会被拼到一起
		if (this.pending && (this.pending.type !== delta.type || this.pending.id !== delta.id)) {
			const flushed = this.take();
			this.pending = { ...delta };
			return flushed;
		}

		if (this.pending) {
			// 已有缓冲，把这一段并进去
			this.pending.delta += delta.delta;
			if (delta.providerMetadata != null) {
				this.pending.providerMetadata = delta.providerMetadata;
			}
		} else {
			// 这个对象本身就是缓冲，它的 delta 已经是第一段了——**这里不要再累加**
			this.pending = { ...delta };
		}

		const ms =
			delta.type === "reasoning-delta"
				? this.policy.reasoningMs
				: delta.type === "tool-input-delta"
					? (this.policy.toolInputMs ?? this.policy.textMs)
					: this.policy.textMs;
		if (ms === 0 || this.now() - this.lastFlush >= ms) return this.take();
		return null;
	}

	/** 冲刷残留：流结束时、或遇到任何不可合并的 chunk 之前都必须调用，以保持顺序 */
	flush(): DeltaChunk | null {
		return this.take();
	}

	private take(): DeltaChunk | null {
		const buffered = this.pending;
		this.pending = null;
		this.lastFlush = this.now();
		// 空增量不必下发，但计时照样重置——它同样代表"刚发过东西"
		if (!buffered || buffered.delta === "") return null;
		return buffered;
	}
}

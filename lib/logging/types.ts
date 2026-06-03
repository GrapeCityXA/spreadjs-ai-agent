/** 错误日志条目的严重级别 */
export type ErrorLevel = "error" | "warn" | "info";

/** 错误来源分类 */
export type ErrorSource =
	| "chat/route"
	| "chat/route/retry"
	| "chat/step"
	| "chat/finish"
	| "chat/stream"
	| "debug/tool-call"
	| "title/route"
	| "tool/execute"
	| "tool/result";

/** 单条错误日志 */
export interface ErrorLogEntry {
	/** ISO 8601 时间戳 */
	timestamp: string;
	/** 严重级别 */
	level: ErrorLevel;
	/** 错误来源 */
	source: ErrorSource;
	/** 错误摘要 */
	message: string;
	/** 附加上下文（工具名、参数摘要等） */
	details?: Record<string, unknown>;
	/** 错误堆栈（仅 Error 实例） */
	stack?: string;
}

import type { z } from "zod/v4";
import type { SpreadWorkbook, ToolResult } from "@/lib/agent/types";
import type { AppLocale } from "@/lib/i18n";

export const loadBridge = () => import("@/lib/spreadjs/bridge");

export interface ToolExecutionContext {
	locale: AppLocale;
}

/**
 * 统一工具定义。
 *
 * - 客户端工具：提供 `handler`（浏览器中执行 SpreadJS 操作），由前端 onToolCall 拦截。
 * - 服务端工具：提供 `execute`（Node.js 中直接执行，如 web_search），由 streamText 自动执行。
 * - 两者二选一，不共存。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDef<TInput = any, TOutput = unknown> {
	name: string;
	displayName: string;
	description: string;
	inputSchema: z.ZodType<TInput>;
	/** 工具所属模块（网关/子工具标识，基础工具无需设置） */
	module?: string;
	/** 客户端 handler — 在浏览器中执行（操作 SpreadJS） */
	handler?: (
		workbook: SpreadWorkbook,
		input: TInput,
		context?: ToolExecutionContext,
	) => Promise<ToolResult<TOutput>>;
	/** 服务端 execute — 在 Node.js 中直接执行 */
	execute?: (input: TInput, locale?: AppLocale) => Promise<ToolResult<TOutput>>;
}


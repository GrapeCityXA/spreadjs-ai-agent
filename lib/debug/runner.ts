import type { SpreadWorkbook } from "@/lib/agent/types";
import { createTranslator, type AppLocale } from "@/lib/i18n";
import { loadBridge } from "@/lib/tools/types";
import type { DebugSession } from "./types";
import { DebugLogger } from "./logger";
import { getToolDef, getHandler, isServerTool } from "@/lib/tools/registry";

/** Agent 自管理工具（handler 不依赖 workbook） */
const AGENT_TOOLS = new Set(["add_tasks", "complete_task", "ask_user"]);

/**
 * Direct Execute 模式：跳过 LLM，直接走 handler pipeline。
 * 5 个阶段逐步执行，任一阶段失败则停止后续阶段。
 */
export async function executeDebugDirect(
	toolName: string,
	rawInput: unknown,
	workbook: SpreadWorkbook | null,
	locale: AppLocale = "en",
): Promise<DebugSession> {
	const logger = new DebugLogger();
	const t = createTranslator(locale);

	// 1. Schema Validation
	const toolDef = logger.stage("schema_validation", () => {
		const def = getToolDef(toolName, locale);
		if (!def) throw new Error(t("debug.toolNotFound", { toolName }));
		const parsed = def.inputSchema.safeParse(rawInput);
		if (!parsed.success) {
			throw new Error(formatZodError(parsed.error));
		}
		return { def, input: parsed.data };
	});
	if (!toolDef) return logger.toSession(toolName);

	// 2. Handler Resolution
	const resolved = logger.stage("handler_resolution", () => {
		if (isServerTool(toolName)) {
			return { type: "server" as const };
		}
		const handler = getHandler(toolName);
		if (!handler) throw new Error(t("debug.handlerMissing", { toolName }));
		return { type: "client" as const, handler };
	});
	if (!resolved) return logger.toSession(toolName);

	// 3. Environment Check
	logger.stage("env_check", () => {
		if (resolved.type === "client" && !AGENT_TOOLS.has(toolName) && !workbook) {
			throw new Error(t("debug.clientWorkbookRequired"));
		}
		return {
			executionSide: resolved.type,
			workbookReady: !!workbook,
			isAgentTool: AGENT_TOOLS.has(toolName),
		};
	});
	if (logger.hasError()) return logger.toSession(toolName);

	// 4. Execution
	const result = await logger.asyncStage("execution", async () => {
		if (resolved.type === "server") {
			const res = await fetch("/api/debug/tool-call", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-spreadjs-locale": locale,
				},
				body: JSON.stringify({ toolName, input: toolDef.input, locale }),
			});
			if (!res.ok) {
				const body = await res.text();
				throw new Error(t("debug.serverExecutionFailed", { status: res.status, body }));
			}
			return res.json();
		}
		const bridge = await loadBridge();
		bridge.setBridgeLocale(locale);
		return resolved.handler(workbook!, toolDef.input);
	});
	if (logger.hasError()) return logger.toSession(toolName);

	// 5. Result Format (序列化验证)
	logger.stage("result_format", () => {
		const json = JSON.stringify(result);
		return { bytes: json.length, serializable: true };
	});

	return logger.toSession(toolName, result);
}

/** 格式化 Zod 校验错误为可读字符串 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatZodError(error: any): string {
	if (error?.issues) {
		return error.issues
			.map((i: { path: string[]; message: string }) =>
				`${i.path.join(".")}: ${i.message}`,
			)
			.join("; ");
	}
	return String(error);
}

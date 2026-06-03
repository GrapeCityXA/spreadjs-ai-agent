import type { ToolDef } from "./types";
import * as defs from "./defs";
import { jsonSchema } from "ai";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n";
import { getLocalizedToolInputSchema, getLocalizedToolText } from "./localization";
export {
	baseToolNames,
	builtinToolNames,
	gatewayToolNames,
	isModuleName,
	moduleToolMap,
	type BaseToolName,
	type BuiltinToolName,
	type GatewayToolName,
	type ModuleName,
	type ModuleToolName,
} from "@/lib/tools/names";

// ─── Tool registry ───────────────────────────────────────────

const allToolsArray: ToolDef[] = Object.values(defs) as ToolDef[];
const toolMap = new Map(allToolsArray.map((t) => [t.name, t]));

export function getToolDefinitions(locale: AppLocale = DEFAULT_LOCALE): Record<string, {
	description: string;
	inputSchema: ToolDef["inputSchema"] | ReturnType<typeof jsonSchema>;
	execute?: (args: Record<string, unknown>) => Promise<unknown>;
}> {
	return Object.fromEntries(
		allToolsArray.map((tool) => {
			const text = getLocalizedToolText(tool, locale);
			const inputSchema = getLocalizedToolInputSchema(tool.inputSchema, locale);
			return [
				tool.name,
				tool.execute
					? {
						description: text.description,
						inputSchema,
						execute: (args: Record<string, unknown>) => tool.execute!(args, locale),
					}
					: { description: text.description, inputSchema },
			];
		}),
	);
}

export const toolDefinitions = getToolDefinitions();

/** 工具总数 */
export const toolCount = allToolsArray.length;

/** Get a localized display name for a built-in or MCP tool. */
export function getDisplayName(name: string, locale: AppLocale = DEFAULT_LOCALE): string {
	const builtin = toolMap.get(name);
	if (builtin) return getLocalizedToolText(builtin, locale).displayName;

	const mcp = parseMcpName(name);
	if (mcp) return mcp.toolName;

	return name;
}

/** 解析 MCP 工具名 → { serverName, toolName }，非 MCP 工具返回 null */
export function parseMcpName(name: string): { serverName: string; toolName: string } | null {
	if (!name.startsWith("mcp__")) return null;
	const parts = name.split("__");
	if (parts.length < 3) return null;
	return { serverName: parts[1], toolName: parts.slice(2).join("__") };
}

/** 获取客户端工具 handler（server 工具返回 undefined） */
export function getHandler(name: string): ToolDef["handler"] | undefined {
	const tool = toolMap.get(name);
	return tool?.handler;
}

/** 判断工具是否为服务端执行（有 execute 且无 handler） */
export function isServerTool(name: string): boolean {
	const tool = toolMap.get(name);
	return !!tool?.execute && !tool.handler;
}

/** Debug 专用：获取工具完整定义 */
export function getToolDef(name: string, locale: AppLocale = DEFAULT_LOCALE): ToolDef | undefined {
	const tool = toolMap.get(name);
	if (!tool) return undefined;
	const text = getLocalizedToolText(tool, locale);
	return {
		...tool,
		displayName: text.displayName,
		description: text.description,
		execute: tool.execute
			? ((input) => tool.execute!(input, locale))
			: undefined,
	};
}

/** Debug 专用：所有工具元信息列表 */
export function getToolList(locale: AppLocale = DEFAULT_LOCALE): Array<{
	name: string;
	displayName: string;
	hasHandler: boolean;
	hasExecute: boolean;
}> {
	return allToolsArray.map((tool) => ({
		name: tool.name,
		displayName: getLocalizedToolText(tool, locale).displayName,
		hasHandler: !!tool.handler,
		hasExecute: !!tool.execute,
	}));
}

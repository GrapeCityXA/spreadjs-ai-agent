"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatOnToolCallCallback } from "ai";
import { normalizeLocale, type AppLocale } from "@/lib/i18n";
import type { SpreadWorkbook, ResolvedRange } from "@/lib/agent/types";
import type { AppUIMessage } from "@/lib/agent/ui-message";
import { getHandler, isServerTool } from "@/lib/tools/registry";
import { createToolCache, type ToolCache } from "@/lib/hooks/useToolCache";
import { resolveAddress, parseRangeAddress } from "@/lib/spreadjs/utils";
import { loadBridge } from "@/lib/tools/types";
import type { ConfirmRequest } from "@/lib/hooks/useDestructiveGuard";

const AGENT_TOOLS = new Set(["add_tasks", "complete_task", "ask_user"]);
const TOOL_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, toolName: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`Tool ${toolName} timed out after ${ms / 1000}s`)),
			ms,
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

type AddToolOutputFn = UseChatHelpers<AppUIMessage>["addToolOutput"];

type ScreenshotToolData = {
	imageBase64?: string;
	sheetName?: string;
	width?: number;
	height?: number;
};

function localize(locale: AppLocale, en: string, zh: string): string {
	const resolved = normalizeLocale(locale);
	if (resolved === "zh-CN") return zh;
	return en;
}

async function checkDestructiveOp(
	workbook: SpreadWorkbook,
	name: string,
	input: Record<string, unknown>,
	requestConfirm: (params: ConfirmRequest) => Promise<boolean>,
	locale: AppLocale,
): Promise<boolean> {
	const bridge = await loadBridge();
	bridge.setBridgeLocale(locale);
	const resolved = normalizeLocale(locale);
	const zh = resolved === "zh-CN";

	switch (name) {
		case "write_data": {
			const data = input.data as Array<unknown[] | null>;
			const range = resolveAddress(input.address as string);
			range.rowCount = data.length;
			range.colCount = Math.max(...data.map((row) => (row ? row.length : 0)), 1);
			const check = bridge.checkSparseDataConflict(workbook, range, data);
			if (!check.hasData) return true;
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Target range already contains data", "目标区域已包含数据"),
				description: zh
					? `目标区域 ${input.address} 中已有 ${check.nonEmptyCount} 个单元格包含数据。继续将覆盖这些内容。`
					: `${check.nonEmptyCount} cells in the target range starting at ${input.address} already contain data. Continuing will overwrite those cells.`,
			});
		}

		case "set_cell": {
			const parsed = parseRangeAddress(input.cell as string);
			const range: ResolvedRange = {
				sheetName: parsed.sheetName,
				row: parsed.startRow,
				col: parsed.startCol,
				rowCount: 1,
				colCount: 1,
			};
			const check = bridge.checkRangeHasData(workbook, range);
			if (!check.hasData) return true;
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Cell already contains data", "单元格已包含数据"),
				description: zh
					? `单元格 ${input.cell} 已有内容。继续将覆盖它。`
					: `Cell ${input.cell} already has content. Continuing will overwrite it.`,
			});
		}

		case "auto_fill": {
			const sheetPrefix = (input.sheetName as string | undefined) ? `${input.sheetName}!` : "";
			const source = resolveAddress(`${sheetPrefix}${input.sourceRange as string}`);
			const dest = resolveAddress(`${sheetPrefix}${input.destRange as string}`);
			const mask: Array<unknown[] | null> = [];

			for (let row = 0; row < dest.rowCount; row++) {
				const maskRow: unknown[] = [];
				let hasNewTarget = false;

				for (let col = 0; col < dest.colCount; col++) {
					const absRow = dest.row + row;
					const absCol = dest.col + col;
					const inSource =
						absRow >= source.row &&
						absRow < source.row + source.rowCount &&
						absCol >= source.col &&
						absCol < source.col + source.colCount;
					maskRow.push(inSource ? null : true);
					if (!inSource) hasNewTarget = true;
				}

				mask.push(hasNewTarget ? maskRow : null);
			}

			const check = bridge.checkSparseDataConflict(workbook, dest, mask);
			if (!check.hasData) return true;
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Auto-fill target already contains data", "自动填充目标已包含数据"),
				description: zh
					? `目标区域 ${input.destRange} 中已有 ${check.nonEmptyCount} 个单元格包含数据。继续将覆盖这些内容。`
					: `${check.nonEmptyCount} cells in the destination range ${input.destRange} already contain data. Continuing will overwrite those cells.`,
			});
		}

		case "clear_cells": {
			if (input.clearType === "format") return true;
			const range = resolveAddress(input.address as string);
			const check = bridge.checkRangeHasData(workbook, range);
			if (!check.hasData) return true;
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Target range contains data", "目标区域包含数据"),
				description: zh
					? `${input.address} 中有 ${check.nonEmptyCount} 个单元格包含数据。继续将清除这些内容。`
					: `${check.nonEmptyCount} cells in ${input.address} contain data. Continuing will clear that content.`,
			});
		}

		case "delete_rows_cols": {
			const check = bridge.checkRowsColsHaveData(
				workbook,
				input.sheetName as string | undefined,
				input.direction as "row" | "column",
				input.index as number,
				(input.count as number) ?? 1,
			);
			if (!check.hasData) return true;
			const count = (input.count as number) ?? 1;
			const label = input.direction === "row" ? "rows" : "columns";
			const labelZh = input.direction === "row" ? "行" : "列";
			return requestConfirm({
				toolName: name,
				title: zh
					? `将删除的${labelZh}中包含数据`
					: `Selected ${label} contain data`,
				description: zh
					? `即将删除的 ${count} ${labelZh}中发现了 ${check.nonEmptyCount} 个非空单元格。此操作无法撤销。`
					: `${check.nonEmptyCount} populated cells were found in the ${count} ${label} that will be deleted. This action cannot be undone.`,
			});
		}

		case "find_and_replace": {
			if (!input.replace && input.replace !== "") return true;
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Replace will modify workbook data", "替换将修改工作簿数据"),
				description: zh
					? `这会在匹配到的单元格中把“${input.find}”替换为“${input.replace}”。`
					: `This will replace "${input.find}" with "${input.replace}" in matching cells across the workbook.`,
			});
		}

		case "merge_cells": {
			if (input.action !== "merge") return true;
			const range = resolveAddress(input.address as string);
			if (range.rowCount <= 1 && range.colCount <= 1) return true;
			const check = bridge.checkRangeHasData(workbook, range);
			if (check.nonEmptyCount <= 1) return true;
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Merge range contains multiple populated cells", "合并区域中包含多个非空单元格"),
				description: zh
					? `${input.address} 中有 ${check.nonEmptyCount} 个单元格包含内容。合并后仅左上角的值会保留可见。`
					: `${check.nonEmptyCount} cells in ${input.address} contain content. After merging, only the upper-left value will remain visible.`,
			});
		}

		case "delete_worksheet":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete worksheet", "删除工作表"),
				description: zh
					? `这会删除工作表“${input.name}”及其全部数据。此操作无法撤销。`
					: `This will delete worksheet "${input.name}" and all of its data. This action cannot be undone.`,
			});

		case "remove_chart":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete chart", "删除图表"),
				description: zh
					? `这会删除图表“${input.chartName}”。`
					: `This will delete chart "${input.chartName}".`,
			});

		case "remove_pivot_table":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete pivot table", "删除透视表"),
				description: zh
					? `这会删除透视表“${input.pivotTableName}”。`
					: `This will delete pivot table "${input.pivotTableName}".`,
			});

		case "remove_table": {
			const keepData = input.keepData !== false;
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete table", "删除表格"),
				description: keepData
					? localize(
						locale,
						`This will remove the structure of table "${input.name}" while keeping the underlying data.`,
						`这会移除表格“${input.name}”的结构，但保留底层数据。`,
					)
					: localize(
						locale,
						`This will delete table "${input.name}" and all of its data. This action cannot be undone.`,
						`这会删除表格“${input.name}”及其全部数据。此操作无法撤销。`,
					),
			});
		}

		case "remove_shape":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete shape or picture", "删除形状或图片"),
				description: zh
					? `这会删除形状或图片“${input.name}”。`
					: `This will delete shape or picture "${input.name}".`,
			});

		case "remove_slicer":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete slicer", "删除切片器"),
				description: zh
					? `这会删除切片器“${input.name}”。`
					: `This will delete slicer "${input.name}".`,
			});

		case "remove_comment":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete comment", "删除批注"),
				description: zh
					? `这会删除单元格 ${input.cell} 上的批注。`
					: `This will delete the comment on cell ${input.cell}.`,
			});

		case "remove_hyperlink":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete hyperlink", "删除超链接"),
				description: zh
					? `这会移除单元格 ${input.cellAddress} 上的超链接。`
					: `This will remove the hyperlink from cell ${input.cellAddress}.`,
			});

		case "remove_validation":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete data validation", "删除数据验证"),
				description: zh
					? `这会移除 ${input.range} 上的数据验证规则。`
					: `This will remove data-validation rules from ${input.range}.`,
			});

		case "remove_cell_state":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete cell state", "删除单元格状态"),
				description: zh
					? `这会清除 ${input.range} 上的单元格状态样式。`
					: `This will clear cell-state styling from ${input.range}.`,
			});

		case "remove_cell_type":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Delete cell type", "删除单元格类型"),
				description: zh
					? `这会移除 ${input.range} 上的自定义单元格类型，例如复选框或按钮。`
					: `This will remove custom cell types from ${input.range}, such as checkboxes or buttons.`,
			});

		case "execute_code":
			return requestConfirm({
				toolName: name,
				title: localize(locale, "Execute code", "执行代码"),
				description: zh
					? "这会直接对工作簿执行 AI 生成的代码。代码可能读写任意单元格或结构，且部分变更可能不可逆。"
					: "This will run AI-generated code directly against the workbook. The code may read or write any cells or structures, and some changes may not be reversible.",
			});

		default:
			return true;
	}
}

const DESTRUCTIVE_TOOLS = new Set([
	"write_data",
	"set_cell",
	"auto_fill",
	"clear_cells",
	"delete_rows_cols",
	"find_and_replace",
	"merge_cells",
	"delete_worksheet",
	"remove_chart",
	"remove_pivot_table",
	"remove_table",
	"remove_shape",
	"remove_slicer",
	"remove_comment",
	"remove_hyperlink",
	"remove_validation",
	"remove_cell_state",
	"remove_cell_type",
	"execute_code",
]);

export function useToolDispatch(
	workbook: SpreadWorkbook | null,
	pendingFilesRef: RefObject<Map<string, string>>,
	requestConfirm: (params: ConfirmRequest) => Promise<boolean>,
	onAfterExecuteCode?: () => void,
	locale: AppLocale = "en",
) {
	const addToolOutputRef = useRef<AddToolOutputFn | null>(null);
	const workbookRef = useRef(workbook);
	const cacheRef = useRef<ToolCache>(createToolCache());
	const requestConfirmRef = useRef(requestConfirm);
	const onAfterExecuteCodeRef = useRef(onAfterExecuteCode);
	const localeRef = useRef<AppLocale>(locale);

	useEffect(() => {
		workbookRef.current = workbook;
		requestConfirmRef.current = requestConfirm;
		onAfterExecuteCodeRef.current = onAfterExecuteCode;
		localeRef.current = locale;
	}, [workbook, requestConfirm, onAfterExecuteCode, locale]);

	const emitOutput = useCallback((args: Parameters<AddToolOutputFn>[0], toolName: string) => {
		const addToolOutput = addToolOutputRef.current;
		if (!addToolOutput) {
			console.error(`[useToolDispatch] addToolOutputRef is missing; cannot emit the result for ${toolName}`);
			return;
		}

		void Promise.resolve(addToolOutput(args)).catch((error: unknown) => {
			console.error(`[useToolDispatch] addToolOutput failed (${toolName}):`, error);
		});
	}, []);

	const onToolCall = useCallback<NonNullable<ChatOnToolCallCallback<AppUIMessage>>>(async ({ toolCall }) => {
		if (toolCall.dynamic) return;

		const workbookInstance = workbookRef.current;
		const name = toolCall.toolName;
		const toolCallId = toolCall.toolCallId;
		const currentLocale = localeRef.current;
		const resolvedLocale = normalizeLocale(currentLocale);
		const zh = resolvedLocale === "zh-CN";

		if (!addToolOutputRef.current) {
			console.error(`[useToolDispatch] addToolOutputRef is missing; skipping tool ${name}`);
			return;
		}

		if (isServerTool(name) || name.startsWith("mcp__")) return;

		const cache = cacheRef.current;
		const input = toolCall.input as Record<string, unknown>;

		try {
			if (!workbookInstance && !AGENT_TOOLS.has(name)) {
				emitOutput({
					state: "output-error",
					tool: name,
					toolCallId,
					errorText: localize(currentLocale, "SpreadJS is not ready yet", "SpreadJS 尚未就绪"),
				}, name);
				return;
			}

			const handler = getHandler(name);
			if (!handler) {
				emitOutput({
					state: "output-error",
					tool: name,
					toolCallId,
					errorText: localize(currentLocale, `Unknown tool: ${name}`, `未知工具：${name}`),
				}, name);
				return;
			}

			if (name === "import_file" && !input.fileBase64) {
				const fileName = input.fileName as string;
				const cached = pendingFilesRef.current?.get(fileName);
				if (cached) {
					input.fileBase64 = cached;
					pendingFilesRef.current?.delete(fileName);
				} else {
					emitOutput({
						state: "output-error",
						tool: name,
						toolCallId,
						errorText: zh
							? `上传缓存中找不到文件“${fileName}”。请重新上传后再试。`
							: `File "${fileName}" was not found in the pending upload cache. Please upload it again.`,
					}, name);
					return;
				}
			}

			if (name === "add_picture" && !input.base64 && input.fileName) {
				const fileName = input.fileName as string;
				const cached = pendingFilesRef.current?.get(fileName);
				if (cached) {
					input.base64 = cached;
				} else {
					emitOutput({
						state: "output-error",
						tool: name,
						toolCallId,
						errorText: zh
							? `上传缓存中找不到图片“${fileName}”。请重新上传后重试。`
							: `Image "${fileName}" was not found in the pending upload cache. Please upload it again and retry.`,
					}, name);
					return;
				}
			}

			const cachedResult = cache.get(name, input);
			if (cachedResult) {
				emitOutput({ tool: name, toolCallId, output: cachedResult }, name);
				return;
			}

			if (workbookInstance && DESTRUCTIVE_TOOLS.has(name)) {
				const confirmed = await checkDestructiveOp(
					workbookInstance,
					name,
					input,
					requestConfirmRef.current,
					currentLocale,
				);
				if (!confirmed) {
					emitOutput({
						state: "output-error",
						tool: name,
						toolCallId,
						errorText: localize(
							currentLocale,
							"The user canceled this action. Adjust the plan or ask how they want to proceed.",
							"用户取消了此操作。请调整计划，或询问用户希望如何继续。",
						),
					}, name);
					return;
				}
			}

			const bridge = await loadBridge();
			bridge.setBridgeLocale(currentLocale);
			const result: { success: boolean; data?: unknown; error?: string } = await withTimeout(
				handler(workbookInstance as SpreadWorkbook, input, { locale: currentLocale }),
				TOOL_TIMEOUT_MS,
				name,
			);

			if (!result.success) {
				emitOutput({
					state: "output-error",
					tool: name,
					toolCallId,
					errorText: result.error ?? localize(currentLocale, "Tool execution failed", "工具执行失败"),
				}, name);
			} else if (name === "take_screenshot") {
				const screenshot = result.data as ScreenshotToolData | undefined;
				if (screenshot?.imageBase64) {
					const text = zh
						? `截图已生成：${screenshot.sheetName}（${screenshot.width}×${screenshot.height}）`
						: `Screenshot captured: ${screenshot.sheetName} (${screenshot.width}x${screenshot.height})`;
					emitOutput({
						tool: name,
						toolCallId,
						output: {
							type: "content" as const,
							value: [
								{ type: "text" as const, text },
								{ type: "media" as const, mediaType: "image/png" as const, data: screenshot.imageBase64 },
							],
						},
					}, name);
				} else {
					emitOutput({ tool: name, toolCallId, output: result }, name);
				}
			} else {
				cache.set(name, input, result);
				emitOutput({ tool: name, toolCallId, output: result }, name);
			}

			if (!cache.isReadOnly(name) && !AGENT_TOOLS.has(name)) {
				cache.invalidate();
				if (name === "execute_code") {
					onAfterExecuteCodeRef.current?.();
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[useToolDispatch] Unhandled exception from ${name}:`, error);
			emitOutput({ state: "output-error", tool: name, toolCallId, errorText: message }, name);
		}
	}, [emitOutput, pendingFilesRef]);

	return { onToolCall, addToolOutputRef };
}

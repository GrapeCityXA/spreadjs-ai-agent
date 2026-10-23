import type { SpreadWorkbook, SpreadWorksheet, ToolResult } from "@/lib/agent/types";
import { MAX_STRING_LENGTH } from "@/lib/config";
import {
	createTranslator,
	DEFAULT_LOCALE,
	normalizeLocale,
	type AppLocale,
	type TranslationKey,
	type TranslationValues,
} from "@/lib/i18n";
import GC from "@grapecity-software/spread-sheets";

let bridgeTranslate = createTranslator(DEFAULT_LOCALE);

export function setBridgeLocale(locale: AppLocale = DEFAULT_LOCALE) {
	bridgeTranslate = createTranslator(normalizeLocale(locale));
}

export function bridgeT(key: TranslationKey, values?: TranslationValues): string {
	return bridgeTranslate(key, values);
}

export function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function getSheet(workbook: SpreadWorkbook, sheetName?: string): SpreadWorksheet {
	if (sheetName) {
		const sheet = workbook.getSheetFromName(sheetName);
		if (!sheet) throw new Error(bridgeT("bridge.sheet.notFound", { name: sheetName }));
		return sheet;
	}
	return workbook.getActiveSheet();
}

export function getUsedRange(sheet: SpreadWorksheet) {
	const range = sheet.getUsedRange(GC.Spread.Sheets.UsedRangeType.data);
	if (!range) return null;
	return {
		row: range.row,
		col: range.col,
		rowCount: range.rowCount,
		colCount: range.colCount,
	};
}

export function safe<T>(fn: () => T): ToolResult<T> {
	try {
		return { success: true, data: fn() };
	} catch (e) {
		console.error("[bridge]", e);
		return { success: false, error: toErrorMessage(e) };
	}
}

/**
 * 挂起 paint + event + calcService，执行回调后恢复。
 *
 * `recalcAll = true` 会触发**整张表的公式重算**（SpreadJS 的 `resumeCalcService(true)`）。
 * 只有会改变值/公式的操作才需要它；只改样式或布局的操作用 `withSuspendNoRecalc`，
 * 否则一次格式调整也要白算一遍全表公式。
 */
function runSuspended<T>(sheet: SpreadWorksheet, fn: () => T, recalcAll: boolean): T {
	sheet.suspendPaint();
	sheet.suspendEvent();
	sheet.suspendCalcService();
	try {
		return fn();
	} finally {
		sheet.resumeCalcService(recalcAll);
		sheet.resumeEvent();
		sheet.resumePaint();
	}
}

/** 会改值/公式的写入：恢复时重算 */
export function withSuspend<T>(sheet: SpreadWorksheet, fn: () => T): T {
	return runSuspended(sheet, fn, true);
}

/** 只改样式/布局（格式、行高列宽、冻结、条件格式）：恢复时不重算 */
export function withSuspendNoRecalc<T>(sheet: SpreadWorksheet, fn: () => T): T {
	return runSuspended(sheet, fn, false);
}

/**
 * 用 CalcEngine.formulaToRanges 解析地址字符串为 GC.Spread.Sheets.Range 数组。
 * 支持单区域 "A1:B5"、多区域 "A4:A8,A10:A17,A19:E19"、带 sheet 前缀等。
 */
export function addressToGCRanges(workbook: SpreadWorkbook, address: string) {
	let sheetName: string | undefined;
	let rangePart = address;
	const bangIdx = address.indexOf("!");
	if (bangIdx !== -1) {
		sheetName = address.substring(0, bangIdx).replace(/^'|'$/g, "");
		rangePart = address.substring(bangIdx + 1);
	}
	const sheet = getSheet(workbook, sheetName);
	// formulaToRanges 需要公式字符串，多区域用 SUM(...) 包裹以便 CalcEngine 正确解析逗号分隔
	const formula = rangePart.includes(",") ? `SUM(${rangePart})` : rangePart;
	const result = GC.Spread.Sheets.CalcEngine.formulaToRanges(sheet, formula, 0, 0);
	const ranges = (result as { ranges: GC.Spread.Sheets.Range[] }[]).flatMap((r) => r.ranges);
	if (ranges.length === 0) throw new Error(bridgeT("bridge.address.parseFailed", { address }));
	return { sheet, ranges };
}

/**
 * 将裸 hex 颜色字符串归一化为带 # 前缀的 CSS 颜色。
 * LLM 经常输出 "4472C4" 而不是 "#4472C4"，SpreadJS / CanvasGradient 无法解析。
 */
export function normalizeColor(color: string): string {
	const trimmed = color.trim();
	// 已有 # 或不像 hex（命名色、rgb(...)  等）→ 原样返回
	if (trimmed.startsWith("#") || !/^[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
	return `#${trimmed}`;
}

/** 截断工具结果中过长的字符串值 */
export function truncateStrings<T>(data: T): T {
	if (typeof data === "string") {
		return (data.length > MAX_STRING_LENGTH
			? data.slice(0, MAX_STRING_LENGTH) + "...[truncated]"
			: data) as T;
	}
	if (Array.isArray(data)) return data.map(truncateStrings) as T;
	if (data && typeof data === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(data)) {
			out[k] = truncateStrings(v);
		}
		return out as T;
	}
	return data;
}

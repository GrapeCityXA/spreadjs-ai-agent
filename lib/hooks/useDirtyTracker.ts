"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SpreadWorkbook } from "@/lib/agent/types";
import { normalizeLocale, type AppLocale } from "@/lib/i18n";
import { colIndexToLetter } from "@/lib/spreadjs/utils";
import {
	asInteractiveWorksheet,
	type ColumnChangedEventArgs,
	type InteractiveSpreadWorksheet,
	type RangeChangedEventArgs,
	type RowChangedEventArgs,
	type SheetNameChangedEventArgs,
	type ValueChangedEventArgs,
} from "@/lib/spreadjs/worksheet-types";

// ─── 类型 ──────────────────────────────────────────────

interface SheetDirty {
	/** 被修改的单元格坐标集合（A1 表示法） */
	cells: Set<string>;
	/** 属性发生变化的行索引 */
	rows: Set<number>;
	/** 属性发生变化的列索引 */
	cols: Set<number>;
}

interface RenameRecord {
	oldName: string;
	newName: string;
}

// ─── 序列化 ─────────────────────────────────────────────

/** 将单元格集合压缩为摘要：数量少时逐个列出，数量多时只给范围 */
function summarizeCells(cells: Set<string>, locale: AppLocale): string {
	if (cells.size === 0) return "";
	const arr = [...cells];
	if (arr.length <= 8) return arr.join(", ");
	const resolved = normalizeLocale(locale);
	if (resolved === "zh-CN") {
		return `${arr.slice(0, 5).join(", ")} 等共 ${arr.length} 个单元格`;
	}
	return `${arr.slice(0, 5).join(", ")} and ${arr.length - 5} more cells`;
}

function serializeDirty(
	sheets: Map<string, SheetDirty>,
	renames: RenameRecord[],
	locale: AppLocale,
): string | undefined {
	const resolved = normalizeLocale(locale);
	const isZh = resolved === "zh-CN";
	const parts: string[] = [];

	for (const [name, info] of sheets) {
		const segs: string[] = [];
		if (info.cells.size > 0) {
			segs.push(
				isZh
					? `修改单元格: ${summarizeCells(info.cells, locale)}`
					: `Changed cells: ${summarizeCells(info.cells, locale)}`,
			);
		}
		if (info.rows.size > 0) {
			const rows = [...info.rows].sort((a, b) => a - b).map((r) => r + 1).join(", ");
			segs.push(
				isZh
					? `行变化: 第 ${rows} 行`
					: `Changed rows: ${rows}`,
			);
		}
		if (info.cols.size > 0) {
			const cols = [...info.cols].sort((a, b) => a - b).map((c) => colIndexToLetter(c)).join(", ");
			segs.push(
				isZh
					? `列变化: 第 ${cols} 列`
					: `Changed columns: ${cols}`,
			);
		}
		if (segs.length > 0) parts.push(`- [${name}] ${segs.join("; ")}`);
	}

	for (const r of renames) {
		parts.push(
			isZh
				? `- 工作表重命名: "${r.oldName}" → "${r.newName}"`
				: `- Worksheet renamed: "${r.oldName}" -> "${r.newName}"`,
		);
	}

	return parts.length > 0 ? parts.join("\n") : undefined;
}

// ─── Hook ───────────────────────────────────────────────

export interface UseDirtyTrackerResult {
	/** 消费并重置脏记录，返回序列化摘要（无修改时返回 undefined） */
	consume: () => string | undefined;
}

/**
 * 追踪两次 HTTP 请求之间 SpreadJS 工作簿的变更。
 *
 * 始终记录事件，不区分用户手动修改和工具执行引起的变更。
 * `consume()` 在每次 `buildBody()` 调用时被触发（即每次 HTTP 请求），
 * 返回上次请求以来的变更摘要并重置状态，天然以 HTTP 请求为粒度。
 */
export function useDirtyTracker(
	workbook: SpreadWorkbook | null,
	locale: AppLocale = "en",
): UseDirtyTrackerResult {
	const sheetsRef = useRef(new Map<string, SheetDirty>());
	const renamesRef = useRef<RenameRecord[]>([]);
	const localeRef = useRef<AppLocale>(locale);

	useEffect(() => {
		localeRef.current = locale;
	}, [locale]);

	// ── 记录辅助 ──────────────────────────────────────

	const getSheetDirty = useCallback((sheetName: string): SheetDirty => {
		let info = sheetsRef.current.get(sheetName);
		if (!info) {
			info = { cells: new Set(), rows: new Set(), cols: new Set() };
			sheetsRef.current.set(sheetName, info);
		}
		return info;
	}, []);

	// ── 事件绑定 ──────────────────────────────────────

	useEffect(() => {
		if (!workbook) return;

		const boundSheets = new WeakSet<InteractiveSpreadWorksheet>();

		const onValueChanged = (_e: unknown, args: ValueChangedEventArgs) => {
			const name = args.sheetName;
			const cell = `${colIndexToLetter(args.col)}${args.row + 1}`;
			getSheetDirty(name).cells.add(cell);
		};

		const onRangeChanged = (_e: unknown, args: RangeChangedEventArgs) => {
			const name = args.sheetName;
			const info = getSheetDirty(name);
			if (Array.isArray(args.changedCells)) {
				for (const c of args.changedCells) {
					info.cells.add(`${colIndexToLetter(c.col)}${c.row + 1}`);
				}
			} else {
				const r = args.row;
				const c = args.col;
				const rc = args.rowCount || 1;
				const cc = args.colCount || 1;
				const start = `${colIndexToLetter(c)}${r + 1}`;
				const end = `${colIndexToLetter(c + cc - 1)}${r + rc}`;
				info.cells.add(rc === 1 && cc === 1 ? start : `${start}:${end}`);
			}
		};

		const onRowChanged = (_e: unknown, args: RowChangedEventArgs) => {
			const name = args.sheetName;
			getSheetDirty(name).rows.add(args.row);
		};

		const onColumnChanged = (_e: unknown, args: ColumnChangedEventArgs) => {
			const name = args.sheetName;
			getSheetDirty(name).cols.add(args.col);
		};

		const onSheetNameChanged = (_e: unknown, args: SheetNameChangedEventArgs) => {
			renamesRef.current.push({
				oldName: args.oldValue,
				newName: args.newValue,
			});
		};

		const bindSheet = (sheet: InteractiveSpreadWorksheet) => {
			if (boundSheets.has(sheet)) return;
			boundSheets.add(sheet);
			sheet.bind("ValueChanged", onValueChanged);
			sheet.bind("RangeChanged", onRangeChanged);
			sheet.bind("RowChanged", onRowChanged);
			sheet.bind("ColumnChanged", onColumnChanged);
			sheet.bind("SheetNameChanged", onSheetNameChanged);
		};

		const unbindSheet = (sheet: InteractiveSpreadWorksheet) => {
			sheet.unbind("ValueChanged", onValueChanged);
			sheet.unbind("RangeChanged", onRangeChanged);
			sheet.unbind("RowChanged", onRowChanged);
			sheet.unbind("ColumnChanged", onColumnChanged);
			sheet.unbind("SheetNameChanged", onSheetNameChanged);
		};

		const bindAll = () => {
			const count = workbook.getSheetCount();
			for (let i = 0; i < count; i++) {
				bindSheet(asInteractiveWorksheet(workbook.getSheet(i)));
			}
		};

		const onActiveSheetChanged = () => { bindAll(); };

		bindAll();
		workbook.bind("ActiveSheetChanged", onActiveSheetChanged);

		return () => {
			const count = workbook.getSheetCount();
			for (let i = 0; i < count; i++) {
				try { unbindSheet(asInteractiveWorksheet(workbook.getSheet(i))); } catch { /* sheet 可能已销毁 */ }
			}
			workbook.unbind("ActiveSheetChanged", onActiveSheetChanged);
		};
	}, [workbook, getSheetDirty]);

	// ── consume ──────────────────────────────────────

	const consume = useCallback((): string | undefined => {
		const result = serializeDirty(sheetsRef.current, renamesRef.current, localeRef.current);
		sheetsRef.current = new Map();
		renamesRef.current = [];
		return result;
	}, []);

	return { consume };
}

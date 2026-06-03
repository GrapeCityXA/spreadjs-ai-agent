"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SpreadWorkbook } from "@/lib/agent/types";
import { normalizeLocale, type AppLocale } from "@/lib/i18n";
import { colIndexToLetter } from "@/lib/spreadjs/utils";
import {
	asInteractiveWorksheet,
	type InteractiveSpreadWorksheet,
	type SheetSelection,
} from "@/lib/spreadjs/worksheet-types";

export interface SheetInfo {
	sheetName: string;
	selection: string;
}

type ObjectType = "chart" | "shape" | "picture";

function getSelectedObjects(sheet: InteractiveSpreadWorksheet): { type: ObjectType; name: string }[] {
	const result: { type: ObjectType; name: string }[] = [];
	try {
		for (const chart of sheet.charts?.all?.() ?? []) {
			if (chart.isSelected?.()) result.push({ type: "chart", name: chart.name() });
		}
		for (const shape of sheet.shapes?.all?.() ?? []) {
			if (shape.isSelected?.()) result.push({ type: "shape", name: shape.name() });
		}
		for (const pic of sheet.pictures?.all?.() ?? []) {
			if (pic.isSelected?.()) result.push({ type: "picture", name: pic.name() });
		}
	} catch {
		// ignore
	}
	return result;
}

const OBJECT_LABEL_EN: Record<ObjectType, string> = { chart: "Chart", shape: "Shape", picture: "Picture" };
const OBJECT_LABEL_ZH: Record<ObjectType, string> = { chart: "图表", shape: "形状", picture: "图片" };

function selRangeToString(sel: SheetSelection): string {
	if (sel.colCount === 1 && sel.rowCount === 1) {
		return `${colIndexToLetter(sel.col)}${sel.row + 1}`;
	}
	const endCol = sel.col + sel.colCount - 1;
	const endRow = sel.row + sel.rowCount;
	return `${colIndexToLetter(sel.col)}${sel.row + 1}:${colIndexToLetter(endCol)}${endRow}`;
}

function capture(workbook: SpreadWorkbook, locale: AppLocale): SheetInfo {
	const rawSheet = workbook.getActiveSheet();
	if (!rawSheet) {
		throw new Error("Active sheet is not available");
	}
	const sheet = asInteractiveWorksheet(rawSheet);
	const sheetName = rawSheet.name();
	const objectLabels = normalizeLocale(locale) === "zh-CN" ? OBJECT_LABEL_ZH : OBJECT_LABEL_EN;

	const objs = getSelectedObjects(sheet);
	if (objs.length > 0) {
		const selection = objs.map(o => `${objectLabels[o.type]}[${o.name}]`).join(", ");
		return { sheetName, selection };
	}

	const sels = sheet.getSelections();
	let selection = "";
	if (sels && sels.length > 0) {
		selection = sels.map(selRangeToString).join(", ");
	}
	return { sheetName, selection };
}

export interface UseSheetInfoResult {
	info: SheetInfo | null;
	/** 主动重新读取当前选区（execute_code 执行后调用，补偿沙箱代码不触发事件的场景） */
	refresh: () => void;
}

/**
 * 监听 SpreadJS 活动 Sheet 和选区变化，返回实时 SheetInfo 及手动刷新函数。
 * 当有图表/形状/图片被选中时，selection 显示为 "图表[名称]" 等格式。
 */
export function useSheetInfo(workbook: SpreadWorkbook | null, locale: AppLocale = "en"): UseSheetInfoResult {
	const [info, setInfo] = useState<SheetInfo | null>(null);
	const workbookRef = useRef(workbook);
	const localeRef = useRef<AppLocale>(normalizeLocale(locale));
	useEffect(() => {
		workbookRef.current = workbook;
	}, [workbook]);
	useEffect(() => {
		localeRef.current = normalizeLocale(locale);
	}, [locale]);

	const update = useCallback(() => {
		const wb = workbookRef.current;
		if (!wb) return;
		try {
			setInfo(capture(wb, localeRef.current));
		} catch {
			// SpreadJS not fully initialized
		}
	}, []);

	useEffect(() => {
		if (!workbook) return;

		// FloatingObjectSelectionChanged / PictureSelectionChanged 是 sheet 级事件，
		// 需随活动 sheet 切换重新绑定。
		const getActiveInteractiveSheet = () => {
			const sheet = workbook.getActiveSheet();
			return sheet ? asInteractiveWorksheet(sheet) : null;
		};

		let activeSheet = getActiveInteractiveSheet();

		const bindSheet = (sheet: InteractiveSpreadWorksheet | null) => {
			if (!sheet?.bind) return;
			sheet.bind("SelectionChanged", update);
			sheet.bind("ShapeSelectionChanged", update);        // sheet.shapes
			sheet.bind("PictureSelectionChanged", update);      // sheet.pictures
			sheet.bind("FloatingObjectSelectionChanged", update); // sheet.charts
		};

		const unbindSheet = (sheet: InteractiveSpreadWorksheet | null) => {
			if (!sheet?.unbind) return;
			sheet.unbind("SelectionChanged", update);
			sheet.unbind("ShapeSelectionChanged", update);
			sheet.unbind("PictureSelectionChanged", update);
			sheet.unbind("FloatingObjectSelectionChanged", update);
		};

		const onActiveSheetChanged = () => {
			unbindSheet(activeSheet);
			activeSheet = getActiveInteractiveSheet();
			bindSheet(activeSheet);
			update();
		};

		bindSheet(activeSheet);
		workbook.bind("ActiveSheetChanged", onActiveSheetChanged);
		update();

		return () => {
			unbindSheet(activeSheet);
			workbook.unbind("ActiveSheetChanged", onActiveSheetChanged);
		};
	}, [workbook, update]);

	return { info, refresh: update };
}

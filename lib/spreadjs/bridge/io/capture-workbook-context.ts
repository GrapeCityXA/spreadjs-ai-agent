import type { SpreadWorkbook } from "@/lib/agent/types";
import { createTranslator, normalizeLocale, type AppLocale } from "@/lib/i18n";
import { colIndexToLetter } from "@/lib/spreadjs/utils";
import {
	asInteractiveWorksheet,
	type InteractiveSpreadWorksheet,
} from "@/lib/spreadjs/worksheet-types";
import { getUsedRange } from "../internal";

type ObjectType = "chart" | "shape" | "picture";
const OBJECT_LABEL_EN: Record<ObjectType, string> = { chart: "Chart", shape: "Shape", picture: "Picture" };
const OBJECT_LABEL_ZH: Record<ObjectType, string> = { chart: "图表", shape: "形状", picture: "图片" };

function getSelectedObject(sheet: InteractiveSpreadWorksheet): { type: ObjectType; name: string } | null {
	try {
		for (const chart of sheet.charts?.all?.() ?? []) {
			if (chart.isSelected?.()) return { type: "chart", name: chart.name() };
		}
		for (const shape of sheet.shapes?.all?.() ?? []) {
			if (shape.isSelected?.()) return { type: "shape", name: shape.name() };
		}
		for (const pic of sheet.pictures?.all?.() ?? []) {
			if (pic.isSelected?.()) return { type: "picture", name: pic.name() };
		}
	} catch {
		// ignore
	}
	return null;
}

export function captureWorkbookContext(workbook: SpreadWorkbook, locale: AppLocale = "en"): string {
	const sheetCount = workbook.getSheetCount();
	const activeIdx = workbook.getActiveSheetIndex();
	const resolved = normalizeLocale(locale);
	const t = createTranslator(locale);
	const objectLabels = resolved === "zh-CN" ? OBJECT_LABEL_ZH : OBJECT_LABEL_EN;

	const lines: string[] = [];
	lines.push(t("bridge.context.worksheetCount", { count: sheetCount }));
	lines.push(t("bridge.context.activeWorksheet", { name: workbook.getSheet(activeIdx).name() }));
	lines.push("");
	lines.push(t("bridge.context.worksheetList"));

	for (let i = 0; i < sheetCount; i++) {
		const sheet = workbook.getSheet(i);
		const name = sheet.name();
		const marker = i === activeIdx ? t("bridge.context.activeMarker") : "";
		const used = getUsedRange(sheet);
		const rangeStr = used
			? `${colIndexToLetter(used.col)}${used.row + 1}:${colIndexToLetter(used.col + used.colCount - 1)}${used.row + used.rowCount}`
			: t("bridge.context.empty");
		lines.push(t("bridge.context.worksheetEntry", { name, marker, range: rangeStr }));
	}

	// 聚焦元素 / 选区信息：有选中的图表/形状/图片时优先显示，否则显示单元格选区
	const activeSheet = asInteractiveWorksheet(workbook.getActiveSheet());
	const obj = getSelectedObject(activeSheet);
	if (obj) {
		lines.push(`\n${t("bridge.context.currentFocus", { type: objectLabels[obj.type], name: obj.name })}`);
	} else {
		const sels = activeSheet.getSelections();
		if (sels && sels.length > 0) {
			const sel = sels[0];
			const selStr = `${colIndexToLetter(sel.col)}${sel.row + 1}:${colIndexToLetter(sel.col + sel.colCount - 1)}${sel.row + sel.rowCount}`;
			lines.push(`\n${t("bridge.context.currentSelection", { selection: selStr })}`);
		}
	}

	return lines.join("\n");
}

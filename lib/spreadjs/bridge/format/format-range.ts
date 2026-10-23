import type { SpreadWorkbook, ResolvedRange, FormatSpec } from "@/lib/agent/types";
import GC from "@grapecity-software/spread-sheets";
import { addressToGCRanges, getSheet, normalizeColor, safe, withSuspendNoRecalc } from "../internal";

/** 对单个 GC Range 应用格式 */
function applyFormat(sheet: GC.Spread.Sheets.Worksheet, gcRange: GC.Spread.Sheets.Range, format: FormatSpec) {
	const cellRange = sheet.getRange(gcRange.row, gcRange.col, gcRange.rowCount, gcRange.colCount);

	if (format.fontFamily) cellRange.fontFamily(format.fontFamily);
	if (format.fontSize) cellRange.fontSize(`${format.fontSize}pt`);
	if (format.bold !== undefined) cellRange.fontWeight(format.bold ? "bold" : "normal");
	if (format.italic !== undefined) cellRange.fontStyle(format.italic ? "italic" : "normal");
	if (format.foreColor) cellRange.foreColor(normalizeColor(format.foreColor));
	if (format.backColor) cellRange.backColor(normalizeColor(format.backColor));
	if (format.formatter) cellRange.formatter(format.formatter);
	if (format.wordWrap !== undefined) cellRange.wordWrap(format.wordWrap);

	let textDeco = 0;
	if (format.underline) textDeco |= GC.Spread.Sheets.TextDecorationType.underline;
	if (format.strikethrough) textDeco |= GC.Spread.Sheets.TextDecorationType.lineThrough;
	if (format.underline !== undefined || format.strikethrough !== undefined) {
		cellRange.textDecoration(textDeco);
	}

	if (format.hAlign) {
		const hMap = {
			left: GC.Spread.Sheets.HorizontalAlign.left,
			center: GC.Spread.Sheets.HorizontalAlign.center,
			right: GC.Spread.Sheets.HorizontalAlign.right,
		};
		cellRange.hAlign(hMap[format.hAlign]);
	}
	if (format.vAlign) {
		const vMap = {
			top: GC.Spread.Sheets.VerticalAlign.top,
			center: GC.Spread.Sheets.VerticalAlign.center,
			bottom: GC.Spread.Sheets.VerticalAlign.bottom,
		};
		cellRange.vAlign(vMap[format.vAlign]);
	}
}

/**
 * 支持两种调用方式：
 * - 传 address(string)：用 CalcEngine.formulaToRanges 解析，支持多区域
 * - 传 ResolvedRange：兼容旧调用
 */
export function formatRange(
	workbook: SpreadWorkbook,
	rangeOrAddress: ResolvedRange | string,
	format: FormatSpec,
) {
	return safe(() => {
		let sheet: GC.Spread.Sheets.Worksheet;
		let gcRanges: GC.Spread.Sheets.Range[];

		if (typeof rangeOrAddress === "string") {
			const parsed = addressToGCRanges(workbook, rangeOrAddress);
			sheet = parsed.sheet;
			gcRanges = parsed.ranges;
		} else {
			sheet = getSheet(workbook, rangeOrAddress.sheetName);
			gcRanges = [new GC.Spread.Sheets.Range(rangeOrAddress.row, rangeOrAddress.col, rangeOrAddress.rowCount, rangeOrAddress.colCount)];
		}

		withSuspendNoRecalc(sheet, () => {
			for (const gcRange of gcRanges) {
				applyFormat(sheet, gcRange, format);
			}
		});
		return { rangeCount: gcRanges.length };
	});
}

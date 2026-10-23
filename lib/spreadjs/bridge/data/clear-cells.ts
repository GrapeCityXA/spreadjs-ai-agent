import type { SpreadWorkbook, ResolvedRange } from "@/lib/agent/types";
import GC from "@grapecity-software/spread-sheets";
import { getSheet, safe, withSuspend } from "../internal";

export function clearCells(
	workbook: SpreadWorkbook,
	range: ResolvedRange,
	clearType: "content" | "format" | "all",
) {
	return safe(() => {
		const sheet = getSheet(workbook, range.sheetName);
		const storageMap = {
			content: GC.Spread.Sheets.StorageType.data,
			format: GC.Spread.Sheets.StorageType.style,
			all: GC.Spread.Sheets.StorageType.data | GC.Spread.Sheets.StorageType.style,
		};
		// clear 会触发 RangeChanged，并把被清区域逐格上报。挂起期间事件不会外溢，
		// 结束后统一重算一次——否则脏标记追踪会被成千上万个单元格拖住
		withSuspend(sheet, () => {
			sheet.clear(
				range.row, range.col, range.rowCount, range.colCount,
				GC.Spread.Sheets.SheetArea.viewport,
				storageMap[clearType],
			);
		});
		return null;
	});
}

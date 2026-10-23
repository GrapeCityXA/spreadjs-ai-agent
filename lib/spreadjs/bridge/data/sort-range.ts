import type { SpreadWorkbook, ResolvedRange } from "@/lib/agent/types";
import { colLetterToIndex } from "@/lib/spreadjs/utils";
import { getSheet, safe, withSuspend } from "../internal";

export function sortRange(
	workbook: SpreadWorkbook,
	range: ResolvedRange,
	sortKeys: Array<{ column: string; ascending: boolean }>,
) {
	return safe(() => {
		const sheet = getSheet(workbook, range.sheetName);
		const sortInfo = sortKeys.map((key) => ({
			index: colLetterToIndex(key.column.toUpperCase()),
			ascending: key.ascending,
		}));

		// 排序会移动整片值，结束后统一重算一次；挂起期间避免每个单元格触发重绘
		let success = false;
		withSuspend(sheet, () => {
			success = sheet.sortRange(
				range.row, range.col, range.rowCount, range.colCount,
				true, // byRows
				sortInfo,
			);
		});
		return { sorted: success };
	});
}

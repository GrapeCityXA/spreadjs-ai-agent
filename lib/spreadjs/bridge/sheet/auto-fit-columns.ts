import type { SpreadWorkbook } from "@/lib/agent/types";
import GC from "@grapecity-software/spread-sheets";
import { getSheet, safe, withSuspendNoRecalc } from "../internal";

export function autoFitColumns(
	workbook: SpreadWorkbook,
	sheetName: string | undefined,
	columns: number[],
	autoFitRows?: boolean,
) {
	return safe(() => {
		const sheet = getSheet(workbook, sheetName);

		withSuspendNoRecalc(sheet, () => {
			for (const col of columns) {
				sheet.autoFitColumn(col);
			}
			if (autoFitRows) {
				const usedRange = sheet.getUsedRange(
					GC.Spread.Sheets.UsedRangeType.data,
				);
				if (usedRange) {
					for (let r = usedRange.row; r < usedRange.row + usedRange.rowCount; r++) {
						sheet.autoFitRow(r);
					}
				}
			}
		});

		return { fittedColumns: columns.length };
	});
}

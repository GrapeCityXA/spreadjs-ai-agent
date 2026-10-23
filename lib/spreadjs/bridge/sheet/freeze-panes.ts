import type { SpreadWorkbook } from "@/lib/agent/types";
import { getSheet, safe, withSuspendNoRecalc } from "../internal";

export function freezePanes(
	workbook: SpreadWorkbook,
	sheetName: string | undefined,
	frozenRows: number,
	frozenColumns: number,
	trailingRows?: number,
	trailingColumns?: number,
) {
	return safe(() => {
		const sheet = getSheet(workbook, sheetName);

		withSuspendNoRecalc(sheet, () => {
			sheet.frozenRowCount(frozenRows);
			sheet.frozenColumnCount(frozenColumns);
			if (trailingRows !== undefined) sheet.frozenTrailingRowCount(trailingRows);
			if (trailingColumns !== undefined) sheet.frozenTrailingColumnCount(trailingColumns);
		});

		return {
			frozenRows,
			frozenColumns,
			...(trailingRows !== undefined && { trailingRows }),
			...(trailingColumns !== undefined && { trailingColumns }),
		};
	});
}

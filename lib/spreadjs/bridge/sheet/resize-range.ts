import type { SpreadWorkbook } from "@/lib/agent/types";
import { getSheet, safe, withSuspendNoRecalc } from "../internal";

interface ResizeSpec {
	rows?: Array<{ index: number; height: number }>;
	columns?: Array<{ index: number; width: number }>;
}

export function resizeRange(
	workbook: SpreadWorkbook,
	sheetName: string | undefined,
	spec: ResizeSpec,
) {
	return safe(() => {
		const sheet = getSheet(workbook, sheetName);

		withSuspendNoRecalc(sheet, () => {
			if (spec.rows) {
				for (const r of spec.rows) {
					sheet.setRowHeight(r.index, r.height);
				}
			}
			if (spec.columns) {
				for (const c of spec.columns) {
					sheet.setColumnWidth(c.index, c.width);
				}
			}
		});

		return {
			rowsResized: spec.rows?.length ?? 0,
			columnsResized: spec.columns?.length ?? 0,
		};
	});
}

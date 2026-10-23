import type { SpreadWorkbook } from "@/lib/agent/types";
import { getSheet, safe, withSuspendNoRecalc } from "../internal";

/** 移除指定区域的数据验证（设置 validator 为 null） */
export function removeValidation(
	workbook: SpreadWorkbook,
	sheetName: string | undefined,
	row: number,
	col: number,
	rowCount: number,
	colCount: number,
) {
	return safe(() => {
		const sheet = getSheet(workbook, sheetName);
		// 逐格 setDataValidator 会触发逐格重绘；数据验证不影响公式结果，恢复时不重算
		withSuspendNoRecalc(sheet, () => {
			for (let r = row; r < row + rowCount; r++) {
				for (let c = col; c < col + colCount; c++) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					sheet.setDataValidator(r, c, null as any);
				}
			}
		});
		return { removed: true, range: { row, col, rowCount, colCount } };
	});
}

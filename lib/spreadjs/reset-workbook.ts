import GC from "@grapecity-software/spread-sheets";
import type { SpreadWorkbook } from "@/lib/agent/types";

/**
 * 把工作簿重置为一张全新的空白 Sheet1。
 *
 * 用临时隐藏实例生成默认 JSON 再 `fromJSON` 覆盖当前实例：
 * - 当前实例保持不变，Designer 绑定、事件与上下文引用都不需要重建
 * - 工作表、图表、形状、表格、条件格式、自定义名称等一并回到初始状态
 *
 * `clearSheets()` + `addSheet()` 只处理工作表本身，工作簿级的命名样式、
 * 自定义名称仍会残留，因此这里不用它。
 */
export function resetWorkbook(workbook: SpreadWorkbook): void {
	const container = document.createElement("div");
	container.style.cssText =
		"position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";
	document.body.appendChild(container);

	let blank: SpreadWorkbook | null = null;
	try {
		blank = new GC.Spread.Sheets.Workbook(container);
		const json = blank.toJSON();

		workbook.suspendPaint();
		try {
			workbook.fromJSON(json);
		} finally {
			workbook.resumePaint();
		}
	} finally {
		try { blank?.destroy(); } catch { /* ignore cleanup errors */ }
		if (container.parentNode) container.parentNode.removeChild(container);
	}
}

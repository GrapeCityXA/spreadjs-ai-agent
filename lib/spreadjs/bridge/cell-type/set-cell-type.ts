import type { SpreadWorkbook } from "@/lib/agent/types";
import GC from "@grapecity-software/spread-sheets";
import { getSheet, safe, normalizeColor, withSuspendNoRecalc } from "../internal";

const CT = GC.Spread.Sheets.CellTypes;

export interface SetCellTypeInput {
	row: number;
	col: number;
	rowCount: number;
	colCount: number;
	type: string;
	// checkbox
	caption?: string;
	isThreeState?: boolean;
	textTrue?: string;
	textFalse?: string;
	// combobox
	items?: string[];
	editable?: boolean;
	// button
	text?: string;
	buttonBackColor?: string;
	// hyperlink
	linkColor?: string;
	visitedLinkColor?: string;
	linkToolTip?: string;
}

function createCellType(input: SetCellTypeInput) {
	switch (input.type) {
		case "checkbox": {
			const ct = new CT.CheckBox();
			if (input.caption != null) ct.caption(input.caption);
			if (input.isThreeState != null) ct.isThreeState(input.isThreeState);
			if (input.textTrue != null) ct.textTrue(input.textTrue);
			if (input.textFalse != null) ct.textFalse(input.textFalse);
			return ct;
		}
		case "combobox": {
			if (!input.items?.length) throw new Error("combobox 类型需要 items 参数（非空数组）");
			const ct = new CT.ComboBox();
			ct.items(input.items);
			if (input.editable) {
				ct.editorValueType(GC.Spread.Sheets.CellTypes.EditorValueType.text);
			}
			return ct;
		}
		case "button": {
			const ct = new CT.Button();
			if (input.text != null) ct.text(input.text);
			if (input.buttonBackColor != null) ct.buttonBackColor(normalizeColor(input.buttonBackColor));
			return ct;
		}
		case "hyperlink": {
			const ct = new CT.HyperLink();
			if (input.linkColor != null) ct.linkColor(normalizeColor(input.linkColor));
			if (input.visitedLinkColor != null) ct.visitedLinkColor(normalizeColor(input.visitedLinkColor));
			if (input.linkToolTip != null) ct.linkToolTip(input.linkToolTip);
			return ct;
		}
		default:
			throw new Error(`未知的单元格类型: ${input.type}。可选: checkbox, combobox, button, hyperlink`);
	}
}

export function setCellType(workbook: SpreadWorkbook, sheetName: string | undefined, input: SetCellTypeInput) {
	return safe(() => {
		const sheet = getSheet(workbook, sheetName);
		const cellType = createCellType(input);

		// 逐格 setCellType 会触发逐格重绘；单元格类型不影响公式结果，恢复时不重算
		withSuspendNoRecalc(sheet, () => {
			for (let r = input.row; r < input.row + input.rowCount; r++) {
				for (let c = input.col; c < input.col + input.colCount; c++) {
					sheet.setCellType(r, c, cellType);
				}
			}
		});

		return {
			type: input.type,
			appliedRange: { row: input.row, col: input.col, rowCount: input.rowCount, colCount: input.colCount },
		};
	});
}

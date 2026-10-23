import type { SpreadWorkbook } from "@/lib/agent/types";
import GC from "@grapecity-software/spread-sheets";
import { colIndexToLetter, parseRangeAddress } from "@/lib/spreadjs/utils";
import { safe, withSuspend } from "../internal";

interface FindReplaceInput {
	find: string;
	replace?: string;
	sheetName?: string;
	matchCase?: boolean;
	matchEntireCell?: boolean;
	useRegex?: boolean;
}

export function findAndReplace(workbook: SpreadWorkbook, input: FindReplaceInput) {
	return safe(() => {
		const Search = GC.Spread.Sheets.Search;

		let flags = 0;
		if (!input.matchCase) flags |= Search.SearchFlags.ignoreCase;
		if (input.matchEntireCell) flags |= Search.SearchFlags.exactMatch;
		if (input.useRegex) flags |= Search.SearchFlags.useWildCards;

		const condition = new Search.SearchCondition();
		condition.searchString = input.find;
		condition.searchFlags = flags;
		condition.searchOrder = Search.SearchOrder.nOrder;
		condition.searchTarget = Search.SearchFoundFlags.cellText;

		if (input.sheetName) {
			const sheetIndex = workbook.getSheetIndex(input.sheetName);
			if (sheetIndex === -1) throw new Error(`工作表 "${input.sheetName}" 不存在`);
			condition.startSheetIndex = sheetIndex;
			condition.endSheetIndex = sheetIndex;
		} else {
			condition.startSheetIndex = 0;
			condition.endSheetIndex = workbook.getSheetCount() - 1;
		}

		// 收集所有匹配
		const matches: Array<{ sheet: string; cell: string; value: string }> = [];
		let result = workbook.search(condition);

		while (result.searchFoundFlag !== Search.SearchFoundFlags.none && matches.length < 500) {
			const sheet = workbook.getSheet(result.foundSheetIndex);
			const foundCell = `${colIndexToLetter(result.foundColumnIndex)}${result.foundRowIndex + 1}`;
			matches.push({
				sheet: sheet.name(),
				cell: foundCell,
				value: String(result.foundString || ""),
			});
			// 继续搜索
			condition.startSheetIndex = result.foundSheetIndex;
			condition.rowStart = result.foundRowIndex;
			condition.columnStart = result.foundColumnIndex + 1;
			result = workbook.search(condition);

			// 避免重复找到同一个
			if (result.foundSheetIndex === condition.startSheetIndex
				&& result.foundRowIndex === condition.rowStart
				&& result.foundColumnIndex === (condition.columnStart! - 1)) break;
		}

		if (!input.replace || matches.length === 0) {
			return { matchCount: matches.length, matches: matches.slice(0, 50) };
		}

		// 替换：先按工作表分组、算好每个单元格的新文本，再每张表挂起一次写入。
		// 逐格 setValue 且不挂起时，每个匹配都会触发重绘与整表重算
		const perSheet = new Map<string, Array<{ row: number; col: number; text: string }>>();
		for (const m of matches) {
			const sheet = workbook.getSheetFromName(m.sheet);
			if (!sheet) continue;

			const addr = parseRangeAddress(m.cell);
			const current = sheet.getText(addr.startRow, addr.startCol);
			const regex = input.useRegex
				? new RegExp(input.find, input.matchCase ? "g" : "gi")
				: new RegExp(input.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), input.matchCase ? "g" : "gi");
			const text = current.replace(regex, input.replace);

			const list = perSheet.get(m.sheet);
			const entry = { row: addr.startRow, col: addr.startCol, text };
			if (list) list.push(entry);
			else perSheet.set(m.sheet, [entry]);
		}

		let replaceCount = 0;
		for (const [sheetName, cells] of perSheet) {
			const sheet = workbook.getSheetFromName(sheetName);
			if (!sheet) continue;
			withSuspend(sheet, () => {
				for (const cell of cells) {
					sheet.setValue(cell.row, cell.col, cell.text);
				}
			});
			replaceCount += cells.length;
		}

		return { matchCount: matches.length, replaceCount };
	});
}

import type { SpreadWorkbook } from "@/lib/agent/types";
import { addressToGCRanges, safe, withSuspendNoRecalc } from "../internal";
import { CF, toCondStyle } from "./helpers";

export function addHighlightRule(
	workbook: SpreadWorkbook,
	address: string,
	rule: Record<string, unknown>,
	style: { backColor?: string; foreColor?: string; bold?: boolean; italic?: boolean },
) {
	return safe(() => {
		const { sheet, ranges } = addressToGCRanges(workbook, address);
		const cfs = sheet.conditionalFormats;
		const condStyle = toCondStyle(style);
		const ruleType = rule.ruleType as string;

		const rulesBefore = cfs.count();
		console.warn("[addHighlightRule] input:", { address, ruleType, rule, style });
		console.warn("[addHighlightRule] resolved:", {
			sheetName: sheet.name(),
			rangeCount: ranges.length,
			ranges: ranges.map((r: { row: number; col: number; rowCount: number; colCount: number }) =>
				({ row: r.row, col: r.col, rowCount: r.rowCount, colCount: r.colCount })),
			condStyle: { backColor: condStyle.backColor, foreColor: condStyle.foreColor, font: condStyle.font },
			rulesBefore,
		});

		withSuspendNoRecalc(sheet, () => {
			switch (ruleType) {
				case "cellValue": {
					const opMap: Record<string, number> = {
						equalsTo: CF.ComparisonOperators.equalsTo,
						notEqualsTo: CF.ComparisonOperators.notEqualsTo,
						greaterThan: CF.ComparisonOperators.greaterThan,
						greaterThanOrEqualsTo: CF.ComparisonOperators.greaterThanOrEqualsTo,
						lessThan: CF.ComparisonOperators.lessThan,
						lessThanOrEqualsTo: CF.ComparisonOperators.lessThanOrEqualsTo,
						between: CF.ComparisonOperators.between,
						notBetween: CF.ComparisonOperators.notBetween,
					};
					const op = opMap[rule.operator as string];
					if (op === undefined) throw new Error(`未知的比较运算符: ${rule.operator}`);
					cfs.addCellValueRule(op, rule.value1 as number, (rule.value2 as number) ?? 0, condStyle, ranges);
					break;
				}
				case "top10": {
					const typeMap: Record<string, number> = {
						top: CF.Top10ConditionType.top,
						bottom: CF.Top10ConditionType.bottom,
					};
					const t = typeMap[rule.type as string];
					if (t === undefined) throw new Error(`未知的 top10 类型: ${rule.type}`);
					cfs.addTop10Rule(t, rule.rank as number, condStyle, ranges);
					break;
				}
				case "average": {
					const avgMap: Record<string, number> = {
						above: CF.AverageConditionType.above,
						below: CF.AverageConditionType.below,
						equalOrAbove: CF.AverageConditionType.equalOrAbove,
						equalOrBelow: CF.AverageConditionType.equalOrBelow,
						above1StdDev: CF.AverageConditionType.above1StdDev,
						below1StdDev: CF.AverageConditionType.below1StdDev,
						above2StdDev: CF.AverageConditionType.above2StdDev,
						below2StdDev: CF.AverageConditionType.below2StdDev,
						above3StdDev: CF.AverageConditionType.above3StdDev,
						below3StdDev: CF.AverageConditionType.below3StdDev,
					};
					const avg = avgMap[rule.type as string];
					if (avg === undefined) throw new Error(`未知的 average 类型: ${rule.type}`);
					cfs.addAverageRule(avg, condStyle, ranges);
					break;
				}
				case "duplicate":
					cfs.addDuplicateRule(condStyle, ranges);
					break;
				case "unique":
					cfs.addUniqueRule(condStyle, ranges);
					break;
				case "specificText": {
					const textOpMap: Record<string, number> = {
						contains: CF.TextComparisonOperators.contains,
						doesNotContain: CF.TextComparisonOperators.doesNotContain,
						beginsWith: CF.TextComparisonOperators.beginsWith,
						endsWith: CF.TextComparisonOperators.endsWith,
					};
					const textOp = textOpMap[rule.operator as string];
					if (textOp === undefined) throw new Error(`未知的文本运算符: ${rule.operator}`);
					cfs.addSpecificTextRule(textOp, rule.text as string, condStyle, ranges);
					break;
				}
				case "dateOccurring": {
					const dateMap: Record<string, number> = {
						today: CF.DateOccurringType.today,
						yesterday: CF.DateOccurringType.yesterday,
						tomorrow: CF.DateOccurringType.tomorrow,
						last7Days: CF.DateOccurringType.last7Days,
						thisMonth: CF.DateOccurringType.thisMonth,
						lastMonth: CF.DateOccurringType.lastMonth,
						nextMonth: CF.DateOccurringType.nextMonth,
						thisWeek: CF.DateOccurringType.thisWeek,
						lastWeek: CF.DateOccurringType.lastWeek,
						nextWeek: CF.DateOccurringType.nextWeek,
						thisQuarter: CF.DateOccurringType.thisQuarter,
						lastQuarter: CF.DateOccurringType.lastQuarter,
						nextQuarter: CF.DateOccurringType.nextQuarter,
						thisYear: CF.DateOccurringType.thisYear,
						lastYear: CF.DateOccurringType.lastYear,
						nextYear: CF.DateOccurringType.nextYear,
					};
					const dateOp = dateMap[rule.type as string];
					if (dateOp === undefined) throw new Error(`未知的日期类型: ${rule.type}`);
					cfs.addDateOccurringRule(dateOp, condStyle, ranges);
					break;
				}
				case "formula":
					cfs.addFormulaRule(rule.formula as string, condStyle, ranges);
					break;
				default:
					throw new Error(`未知的规则类型: ${ruleType}`);
			}
		});
		const rulesAfter = cfs.count();
		console.warn("[addHighlightRule] done:", { ruleType, rangeCount: ranges.length, rulesBefore, rulesAfter });
		return { ruleType, rangeCount: ranges.length };
	});
}

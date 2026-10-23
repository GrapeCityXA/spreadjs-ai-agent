import type { SpreadWorkbook, ResolvedRange } from "@/lib/agent/types";
import { getSheet, normalizeColor, safe, withSuspendNoRecalc } from "../internal";
import { toScaleValueType, toRanges } from "./helpers";

export function addColorScale(
	workbook: SpreadWorkbook,
	range: ResolvedRange,
	input: {
		scaleType: string;
		minType: string; minValue: number; minColor: string;
		midType?: string; midValue?: number; midColor?: string;
		maxType: string; maxValue: number; maxColor: string;
	},
) {
	return safe(() => {
		const sheet = getSheet(workbook, range.sheetName);
		const cfs = sheet.conditionalFormats;
		const ranges = toRanges(range);

		const minC = normalizeColor(input.minColor);
		const maxC = normalizeColor(input.maxColor);

		withSuspendNoRecalc(sheet, () => {
			if (input.scaleType === "threeColor" && input.midType && input.midColor !== undefined) {
				const midC = normalizeColor(input.midColor);
				cfs.add3ScaleRule(
					toScaleValueType(input.minType), input.minValue, minC,
					toScaleValueType(input.midType), input.midValue ?? 50, midC,
					toScaleValueType(input.maxType), input.maxValue, maxC,
					ranges,
				);
			} else {
				cfs.add2ScaleRule(
					toScaleValueType(input.minType), input.minValue, minC,
					toScaleValueType(input.maxType), input.maxValue, maxC,
					ranges,
				);
			}
		});
		return { scaleType: input.scaleType };
	});
}

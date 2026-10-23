import type { SpreadWorkbook, ResolvedRange } from "@/lib/agent/types";
import { getSheet, safe, withSuspendNoRecalc } from "../internal";
import { CF, toRanges } from "./helpers";

export function addIconSet(
	workbook: SpreadWorkbook,
	range: ResolvedRange,
	input: { iconSetType: string; reverseIconOrder: boolean; showIconOnly: boolean },
) {
	return safe(() => {
		const sheet = getSheet(workbook, range.sheetName);
		const cfs = sheet.conditionalFormats;
		const ranges = toRanges(range);

		const iconMap: Record<string, number> = {
			threeArrowsColored: CF.IconSetType.threeArrowsColored,
			threeArrowsGray: CF.IconSetType.threeArrowsGray,
			threeTriangles: CF.IconSetType.threeTriangles,
			threeStars: CF.IconSetType.threeStars,
			threeFlags: CF.IconSetType.threeFlags,
			threeTrafficLightsUnrimmed: CF.IconSetType.threeTrafficLightsUnrimmed,
			threeTrafficLightsRimmed: CF.IconSetType.threeTrafficLightsRimmed,
			threeSigns: CF.IconSetType.threeSigns,
			threeSymbolsCircled: CF.IconSetType.threeSymbolsCircled,
			threeSymbolsUncircled: CF.IconSetType.threeSymbolsUncircled,
			fourArrowsColored: CF.IconSetType.fourArrowsColored,
			fourArrowsGray: CF.IconSetType.fourArrowsGray,
			fourRedToBlack: CF.IconSetType.fourRedToBlack,
			fourRatings: CF.IconSetType.fourRatings,
			fourTrafficLights: CF.IconSetType.fourTrafficLights,
			fiveArrowsColored: CF.IconSetType.fiveArrowsColored,
			fiveArrowsGray: CF.IconSetType.fiveArrowsGray,
			fiveRatings: CF.IconSetType.fiveRatings,
			fiveQuarters: CF.IconSetType.fiveQuarters,
			fiveBoxes: CF.IconSetType.fiveBoxes,
		};

		withSuspendNoRecalc(sheet, () => {
			const rule = cfs.addIconSetRule(
				iconMap[input.iconSetType] ?? CF.IconSetType.threeArrowsColored,
				ranges,
			);

			if (input.reverseIconOrder && rule) {
				(rule as unknown as { reverseIconOrder: (v: boolean) => void }).reverseIconOrder(true);
			}
			if (input.showIconOnly && rule) {
				(rule as unknown as { showIconOnly: (v: boolean) => void }).showIconOnly(true);
			}
		});
		return { iconSetType: input.iconSetType };
	});
}

"use client";

import { memo, useMemo } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConfirmDialogState, ConfirmChoice } from "@/lib/hooks/useDestructiveGuard";
import { useTranslation } from "@/lib/i18n/react";

interface DestructiveConfirmInlineProps {
	dialog: ConfirmDialogState | null;
	onChoice: (choice: ConfirmChoice) => void;
}

export const DestructiveConfirmInline = memo(function DestructiveConfirmInline({
	dialog,
	onChoice,
}: DestructiveConfirmInlineProps) {
	const { t } = useTranslation();
	const labels = useMemo(
		() => ({
			write_data: { once: t("destructive.overwrite"), sameType: t("destructive.overwriteSkip") },
			set_cell: { once: t("destructive.write"), sameType: t("destructive.writeSkip") },
			auto_fill: { once: t("destructive.fill"), sameType: t("destructive.fillSkip") },
			clear_cells: { once: t("destructive.clear"), sameType: t("destructive.clearSkip") },
			delete_rows_cols: { once: t("destructive.delete"), sameType: t("destructive.deleteSkip") },
			find_and_replace: { once: t("destructive.replace"), sameType: t("destructive.replaceSkip") },
			merge_cells: { once: t("destructive.merge"), sameType: t("destructive.mergeSkip") },
			fallback: { once: t("destructive.confirm"), sameType: t("destructive.confirmSameType") },
		}),
		[t],
	);

	if (!dialog) return null;

	const current = labels[dialog.toolName as keyof typeof labels] ?? labels.fallback;

	return (
		<div className="mx-1 mb-2 rounded-lg border border-amber-200/70 bg-amber-50/80 px-3 py-2.5 dark:border-amber-500/20 dark:bg-amber-950/20">
			<div className="mb-2 flex items-start gap-2">
				<AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
				<div className="min-w-0 flex-1">
					<p className="text-xs font-medium leading-tight text-amber-900 dark:text-amber-200">
						{dialog.title}
					</p>
					<p className="mt-0.5 text-xs leading-relaxed text-amber-700/80 dark:text-amber-300/70">
						{dialog.description}
					</p>
				</div>
			</div>
			<div className="flex flex-col gap-1.5 pl-5">
				<div className="flex gap-1.5">
					<Button size="sm" variant="default" className="h-6 px-2.5 text-xs" onClick={() => onChoice("once")}>
						{current.once}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 px-2.5 text-xs text-muted-foreground"
						onClick={() => onChoice("cancel")}
					>
						{t("destructive.cancel")}
					</Button>
				</div>
				<Button
					size="sm"
					variant="outline"
					className="h-6 self-start px-2.5 text-xs"
					onClick={() => onChoice("same-type")}
				>
					{current.sameType}
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="h-6 self-start px-2.5 text-xs"
					onClick={() => onChoice("all")}
				>
					{t("destructive.confirmAll")}
				</Button>
			</div>
		</div>
	);
});

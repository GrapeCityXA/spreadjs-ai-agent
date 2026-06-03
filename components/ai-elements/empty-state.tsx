"use client";

import {
	SparklesIcon,
	TableIcon,
	BarChart3Icon,
	WandSparklesIcon,
	FileUpIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n/react";

interface EmptyStateProps {
	onSend: (text: string) => void;
	isReady: boolean;
}

export function EmptyState({ onSend, isReady }: EmptyStateProps) {
	const { t } = useTranslation();
	const capabilities = useMemo(
		() => [
			{ icon: TableIcon, label: t("empty.capability.data") },
			{ icon: WandSparklesIcon, label: t("empty.capability.format") },
			{ icon: BarChart3Icon, label: t("empty.capability.chart") },
			{ icon: FileUpIcon, label: t("empty.capability.file") },
		],
		[t],
	);
	const starterPrompts = useMemo(
		() => [
			{
				icon: TableIcon,
				label: t("empty.prompt.summary"),
				prompt: t("empty.prompt.summary.full"),
			},
			{
				icon: WandSparklesIcon,
				label: t("empty.prompt.style"),
				prompt: t("empty.prompt.style.full"),
			},
			{
				icon: BarChart3Icon,
				label: t("empty.prompt.chart"),
				prompt: t("empty.prompt.chart.full"),
			},
		],
		[t],
	);

	return (
		<div className="flex size-full flex-col items-center justify-center gap-5 px-6 py-8">
			<div className="flex flex-col items-center gap-2">
				<div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
					<SparklesIcon className="size-5 text-primary/80" />
				</div>
				<h3 className="text-[15px] font-semibold">{t("empty.title")}</h3>
				<p className="text-center text-[13px] text-muted-foreground/80">{t("empty.subtitle")}</p>
			</div>

			<div className="flex flex-wrap justify-center gap-1.5">
				{capabilities.map(({ icon: Icon, label }) => (
					<span
						key={label}
						className="inline-flex items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-0.5 text-[11px] text-muted-foreground/70"
					>
						<Icon className="size-3" />
						{label}
					</span>
				))}
			</div>

			<div className="flex w-full flex-col gap-1.5">
				{starterPrompts.map(({ icon: Icon, label, prompt }) => (
					<button
						key={label}
						type="button"
						disabled={!isReady}
						onClick={() => onSend(prompt)}
						className="group flex items-center gap-3 rounded-lg border border-border/50 px-3.5 py-2.5 text-left text-[13px] transition-all hover:border-border hover:bg-accent/40 disabled:opacity-50"
					>
						<Icon className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary/70" />
						<span className="text-foreground/90">{label}</span>
					</button>
				))}
			</div>
		</div>
	);
}

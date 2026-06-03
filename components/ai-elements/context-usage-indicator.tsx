"use client";

import { memo, type ComponentProps } from "react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import type { ContextUsage } from "@/lib/hooks/useContextUsage";
import { formatTokenCount } from "@/lib/token-estimate";
import { useTranslation } from "@/lib/i18n/react";

const RING_SIZE = 20;
const STROKE_WIDTH = 2.5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ percent }: { percent: number }) {
	const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
	const color = percent >= 90 ? "var(--destructive)" : percent >= 70 ? "var(--warning, #f59e0b)" : "currentColor";

	return (
		<svg
			width={RING_SIZE}
			height={RING_SIZE}
			viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
			className="rotate-[-90deg]"
			suppressHydrationWarning
		>
			<circle
				cx={RING_SIZE / 2}
				cy={RING_SIZE / 2}
				r={RADIUS}
				fill="none"
				stroke="currentColor"
				strokeWidth={STROKE_WIDTH}
				className="opacity-15"
				suppressHydrationWarning
			/>
			<circle
				cx={RING_SIZE / 2}
				cy={RING_SIZE / 2}
				r={RADIUS}
				fill="none"
				stroke={color}
				strokeWidth={STROKE_WIDTH}
				strokeDasharray={CIRCUMFERENCE}
				strokeDashoffset={offset}
				strokeLinecap="round"
				suppressHydrationWarning
			/>
		</svg>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between text-xs">
			<span className="text-popover-foreground/70">{label}</span>
			<span className="tabular-nums">{value}</span>
		</div>
	);
}

function percentOf(part: number, total: number): string {
	if (total === 0) return "0%";
	const percent = (part / total) * 100;
	return percent < 0.1 ? "<0.1%" : `${percent.toFixed(1)}%`;
}

interface ContextUsageIndicatorProps {
	usage: ContextUsage;
	visible?: boolean;
	side?: ComponentProps<typeof HoverCardContent>["side"];
}

export const ContextUsageIndicator = memo(function ContextUsageIndicator({
	usage,
	visible = false,
	side = "top",
}: ContextUsageIndicatorProps) {
	const { t } = useTranslation();
	if (!visible) return null;

	const { total, used, percent, isReal, breakdown } = usage;

	return (
		<HoverCard openDelay={200} closeDelay={100}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
					aria-label={t("contextUsage.ariaLabel", { percent })}
					suppressHydrationWarning
				>
					<ProgressRing percent={percent} />
				</button>
			</HoverCardTrigger>
			<HoverCardContent side={side} align="end" className="w-56 space-y-2.5 p-3 text-xs">
				<div>
					<div className="text-sm font-medium">{t("contextUsage.title")}</div>
					<div className="mt-0.5 text-popover-foreground/70">
						{formatTokenCount(used)} / {formatTokenCount(total)} tokens - {percent}%
						{isReal ? (
							<span className="ml-1 text-emerald-500" title={t("contextUsage.serverReported")}>●</span>
						) : (
							<span className="ml-1 text-popover-foreground/30" title={t("contextUsage.clientEstimate")}>○</span>
						)}
					</div>
				</div>

				<div className="space-y-1">
					<div className="text-[10px] font-medium uppercase tracking-wider text-popover-foreground/50">
						{t("contextUsage.system")}
					</div>
					<Row label={t("contextUsage.systemPrompt")} value={percentOf(breakdown.systemInstructions, total)} />
					<Row label={t("contextUsage.toolDefinitions")} value={percentOf(breakdown.toolDefinitions, total)} />
				</div>

				<div className="space-y-1">
					<div className="text-[10px] font-medium uppercase tracking-wider text-popover-foreground/50">
						{t("contextUsage.conversation")}
					</div>
					<Row label={t("contextUsage.messages")} value={percentOf(breakdown.messages, total)} />
					<Row label={t("contextUsage.toolResults")} value={percentOf(breakdown.toolResults, total)} />
				</div>
			</HoverCardContent>
		</HoverCard>
	);
});

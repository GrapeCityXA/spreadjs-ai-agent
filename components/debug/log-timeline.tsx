"use client";

import type { DebugLogEntry, DebugSession } from "@/lib/debug/types";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n/react";

const STATUS_ICON: Record<string, string> = {
	ok: "✅",
	error: "❌",
	warn: "⚠️",
	skip: "⏭️",
};

function formatJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

interface LogTimelineProps {
	session: DebugSession | null;
}

export function LogTimeline({ session }: LogTimelineProps) {
	const { t } = useTranslation();
	const stageLabels: Record<string, string> = {
		schema_validation: t("debug.stage.schemaValidation"),
		handler_resolution: t("debug.stage.handlerResolution"),
		env_check: t("debug.stage.envCheck"),
		execution: t("debug.stage.execution"),
		result_format: t("debug.stage.resultFormat"),
	};

	if (!session) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				{t("debug.clickExecute")}
			</div>
		);
	}

	return (
		<div className="space-y-1">
			<h3 className="text-xs font-medium text-muted-foreground mb-2">{t("debug.executionLog")}</h3>
			{session.logs.map((log, i) => (
				<LogEntry key={i} log={log} stageLabels={stageLabels} />
			))}
			<div className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground text-center">
				{t("debug.total")}: {session.totalMs}ms
			</div>
			{session.result !== undefined && (
				<div className="mt-3 space-y-1">
					<h3 className="text-xs font-medium text-muted-foreground">{t("debug.result")}</h3>
					<pre className="max-h-[300px] overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
						{formatJson(session.result)}
					</pre>
				</div>
			)}
		</div>
	);
}

function LogEntry({
	log,
	stageLabels,
}: {
	log: DebugLogEntry;
	stageLabels: Record<string, string>;
}) {
	const [expanded, setExpanded] = useState(false);
	const label = stageLabels[log.stage] ?? log.stage;
	const icon = STATUS_ICON[log.status] ?? "❓";
	const hasDetail = log.output || log.error || log.detail;

	return (
		<div className="rounded-md border border-border/40 bg-background">
			<button
				type="button"
				onClick={() => hasDetail && setExpanded(!expanded)}
				className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
					hasDetail ? "cursor-pointer hover:bg-accent/50" : "cursor-default"
				}`}
			>
				<span>{icon}</span>
				<span className="font-medium">{label}</span>
				<span className="ml-auto tabular-nums text-muted-foreground">
					{log.durationMs}ms
				</span>
				{hasDetail && (
					<span className="text-muted-foreground">{expanded ? "▾" : "▸"}</span>
				)}
			</button>
			{expanded && hasDetail && (
				<div className="border-t border-border/30 px-3 py-2">
					{log.error && (
						<p className="text-[11px] text-red-500 mb-1">{log.error}</p>
					)}
					{log.detail && (
						<p className="text-[11px] text-muted-foreground mb-1">{log.detail}</p>
					)}
					{log.output != null && (
						<pre className="max-h-[150px] overflow-auto rounded bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
							{formatJson(log.output)}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}

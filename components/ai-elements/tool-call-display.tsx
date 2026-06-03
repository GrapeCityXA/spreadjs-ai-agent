"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { getDisplayName, parseMcpName } from "@/lib/tools/registry";
import { TaskList, TaskListSnapshot } from "@/components/ai-elements/task-list";
import type { Task } from "@/lib/agent/task-types";
import {
	getAppToolName,
	getAskUserOutputData,
	getTaskToolData,
	isAskUserToolPart,
	isTaskToolPart,
	type AppToolUIPart,
	type AppUIMessagePart,
} from "@/lib/agent/ui-message";
import { AskUserOptions } from "@/components/ai-elements/ask-user-options";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Tool,
	ToolHeader,
	ToolContent,
	ToolInput,
	ToolOutput,
	type ToolPart,
} from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { ReasoningBlock } from "@/components/ai-elements/reasoning-block";
import { sandboxEvent, type SandboxPhase } from "@/lib/spreadjs/sandbox-event";
import { useTranslation } from "@/lib/i18n/react";

export type ToolPartLike = AppToolUIPart;
export const getToolName = getAppToolName;

export function findLastTaskToolIndex(parts: AppUIMessagePart[]): number {
	for (let i = parts.length - 1; i >= 0; i--) {
		if (isTaskToolPart(parts[i])) return i;
	}
	return -1;
}

export const SPECIAL_TOOLS = new Set(["add_tasks", "complete_task", "ask_user"]);

function extractTaskSnapshot(part: AppToolUIPart): { planId?: string; tasks: Task[] } | null {
	if (!isTaskToolPart(part)) return null;
	const data = getTaskToolData(part);
	if (!data) return null;
	return { planId: data.planId ?? undefined, tasks: data.tasks };
}

export function renderSpecialTool(
	part: AppToolUIPart,
	index: number,
	sendMessage: (msg: { text: string }) => void,
	lastTaskIdx: number,
	nextUserText?: string,
	messageId?: string,
	taskRenderDecision?: Map<string, "live" | "snapshot">,
): ReactNode | null {
	const toolName = getToolName(part);

	if (isTaskToolPart(part)) {
		if (messageId && taskRenderDecision) {
			const key = `${messageId}:${index}`;
			const decision = taskRenderDecision.get(key);
			if (decision === "live") return <TaskList key={`tool-${index}`} />;
			if (decision === "snapshot") {
				const snapshot = extractTaskSnapshot(part);
				if (snapshot) return <TaskListSnapshot key={`tool-${index}`} tasks={snapshot.tasks} />;
				return <TaskList key={`tool-${index}`} />;
			}
			return null;
		}
		if (index === lastTaskIdx) return <TaskList key={`tool-${index}`} />;
		const snapshot = extractTaskSnapshot(part);
		if (snapshot) return <TaskListSnapshot key={`tool-${index}`} tasks={snapshot.tasks} />;
		return null;
	}

	if (toolName === "ask_user" && isAskUserToolPart(part)) {
		const data = getAskUserOutputData(part);
		if (data) {
			const hasNext = nextUserText !== undefined;
			const restored = hasNext && data.options.includes(nextUserText) ? nextUserText : undefined;
			const allDisabled = hasNext && !data.options.includes(nextUserText);
			return (
				<AskUserOptions
					key={`tool-${index}`}
					question={data.question}
					options={data.options}
					onSelect={(option) => sendMessage({ text: option })}
					selectedOption={restored}
					disabled={allDisabled}
				/>
			);
		}
	}

	return <ToolCallDisplay key={`tool-${index}`} part={part} />;
}

export type MixedPartItem =
	| { kind: "reasoning"; text: string; state?: "streaming" | "done" }
	| { kind: "tool"; part: AppToolUIPart; index: number };

function isItemInProgress(item: MixedPartItem): boolean {
	if (item.kind === "reasoning") return item.state === "streaming";
	return item.part.state === "input-available";
}

export const MixedGroup = memo(function MixedGroup({
	items,
	interrupted,
}: {
	items: MixedPartItem[];
	interrupted?: boolean;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	if (items.length === 0) return null;
	if (items.length === 1) return renderMixedItem(items[0], 0, interrupted);

	const latestItem = items[items.length - 1];
	const latestInProgress = isItemInProgress(latestItem);
	const collapsedItems = latestInProgress ? items.slice(0, -1) : items;
	const exposedItem = latestInProgress ? latestItem : null;
	const reasoningCount = collapsedItems.filter((item) => item.kind === "reasoning").length;
	const toolCount = collapsedItems.filter((item) => item.kind === "tool").length;
	const typeText = reasoningCount > 0 && toolCount > 0
		? t("tool.more.mixed")
		: reasoningCount > 0
			? t("tool.more.reasoning")
			: t("tool.more.tools");
	const totalCount = collapsedItems.length;
	const label = open
		? t("tool.more.expanded", { count: totalCount, type: typeText })
		: t("tool.more.remaining", { count: totalCount, type: typeText });

	return (
		<div className="space-y-1">
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger className={cn("group/mg flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground")}>
					<ChevronRightIcon
						className={cn("size-3 transition-transform duration-150", "group-data-[state=open]/mg:rotate-90")}
					/>
					<span>{label}</span>
				</CollapsibleTrigger>
				<CollapsibleContent className="space-y-1 pt-1">
					{collapsedItems.map((item, i) => renderMixedItem(item, i, interrupted))}
				</CollapsibleContent>
			</Collapsible>
			{exposedItem !== null && renderMixedItem(exposedItem, collapsedItems.length, interrupted)}
		</div>
	);
});

function renderMixedItem(item: MixedPartItem, keyIndex: number, interrupted?: boolean): ReactNode {
	if (item.kind === "reasoning") {
		const reasoningKey = `mixed-r-${keyIndex}-${item.state ?? "done"}-${interrupted ? "interrupted" : "active"}`;
		return <ReasoningBlock key={reasoningKey} text={item.text} state={item.state} interrupted={interrupted} />;
	}
	return <ToolCallDisplay key={`mixed-t-${item.index}`} part={item.part} interrupted={interrupted} />;
}

const sandboxPhaseLabels = {
	"pre-executing": "tool.status.preflight",
	"executing": "tool.status.running",
	"done": null,
} as const satisfies Record<SandboxPhase, string | null>;

export const ToolCallDisplay = memo(function ToolCallDisplay({
	part,
	interrupted,
}: {
	part: AppToolUIPart;
	interrupted?: boolean;
}) {
	const { locale, t } = useTranslation();
	const isDynamic = part.type === "dynamic-tool";
	const toolName = getToolName(part);
	const isExecuteCode = toolName === "execute_code";
	const [phase, setPhase] = useState<SandboxPhase | null>(null);

	useEffect(() => {
		if (!isExecuteCode) return;
		return sandboxEvent.onPhase(({ phase: currentPhase }) => {
			setPhase(currentPhase === "done" ? null : currentPhase);
		});
	}, [isExecuteCode]);

	const statusLabel = isExecuteCode && phase && part.state === "input-available"
		? (sandboxPhaseLabels[phase] ? t(sandboxPhaseLabels[phase] as "tool.status.preflight" | "tool.status.running") : undefined)
		: undefined;

	const headerProps = isDynamic
		? { type: "dynamic-tool" as const, state: part.state as "input-available", toolName: part.toolName }
		: { type: part.type, state: part.state as "input-available" };

	const mcpInfo = parseMcpName(toolName);

	return (
		<Tool>
			<ToolHeader
				{...headerProps}
				title={getDisplayName(toolName, locale)}
				subtitle={mcpInfo?.serverName}
				statusLabel={statusLabel}
				interrupted={interrupted}
			/>
			<ToolContent>
				{part.input != null ? <ToolInput input={part.input as ToolPart["input"]} /> : null}
				{part.state === "output-available" || part.state === "output-error" ? (
					<ToolOutput output={part.output as ToolPart["output"]} errorText={part.errorText} />
				) : null}
			</ToolContent>
		</Tool>
	);
}, (prev, next) => prev.part.state === next.part.state && prev.part.toolCallId === next.part.toolCallId && prev.interrupted === next.interrupted);

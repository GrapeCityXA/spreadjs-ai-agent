"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
	CheckCircleIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	CircleIcon,
	ClockIcon,
	OctagonIcon,
	WrenchIcon,
	XCircleIcon,
} from "lucide-react";
import { isValidElement, memo, useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n/react";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, defaultOpen = false, ...props }: ToolProps) => (
	<Collapsible
		defaultOpen={defaultOpen}
		className={cn("group not-prose mb-1 w-full rounded-lg border border-border/50", className)}
		{...props}
	/>
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
	title?: string;
	subtitle?: string;
	statusLabel?: string;
	className?: string;
	interrupted?: boolean;
} & (
	| { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
	| {
			type: DynamicToolUIPart["type"];
			state: DynamicToolUIPart["state"];
			toolName: string;
	  }
);

const statusIcons: Record<ToolPart["state"], ReactNode> = {
	"approval-requested": <ClockIcon className="size-3.5 text-yellow-600" />,
	"approval-responded": <CheckCircleIcon className="size-3.5 text-blue-600" />,
	"input-available": <ClockIcon className="size-3.5 animate-pulse" />,
	"input-streaming": <CircleIcon className="size-3.5" />,
	"output-available": <CheckCircleIcon className="size-3.5 text-green-600" />,
	"output-denied": <XCircleIcon className="size-3.5 text-orange-600" />,
	"output-error": <XCircleIcon className="size-3.5 text-red-600" />,
};

export const getStatusBadge = (status: ToolPart["state"], label: string) => (
	<Badge className="gap-1 rounded-full text-[11px] font-normal" variant="secondary">
		{statusIcons[status]}
		{label}
	</Badge>
);

export const ToolHeader = ({
	className,
	title,
	subtitle,
	statusLabel,
	type,
	state,
	toolName,
	interrupted,
	...props
}: ToolHeaderProps) => {
	const { t } = useTranslation();
	const statusLabels: Record<ToolPart["state"], string> = useMemo(
		() => ({
			"approval-requested": t("tool.status.awaitingApproval"),
			"approval-responded": t("tool.status.approved"),
			"input-available": t("tool.status.running"),
			"input-streaming": t("tool.status.preparing"),
			"output-available": t("tool.status.done"),
			"output-denied": t("tool.status.denied"),
			"output-error": t("tool.status.error"),
		}),
		[t],
	);

	const derivedName = type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
	const isInProgress = state === "input-available" || state === "input-streaming";
	const effectiveBadge = interrupted && isInProgress
		? (
			<Badge className="gap-1 rounded-full text-[11px] font-normal" variant="secondary">
				<OctagonIcon className="size-3.5 text-amber-500" />
				{t("tool.status.interrupted")}
			</Badge>
		)
		: statusLabel
			? (
				<Badge className="gap-1 rounded-full text-[11px] font-normal" variant="secondary">
					{statusIcons[state]}
					{statusLabel}
				</Badge>
			)
			: getStatusBadge(state, statusLabels[state]);

	return (
		<CollapsibleTrigger
			className={cn("flex w-full items-center justify-between gap-3 px-3 py-2", className)}
			{...props}
		>
			<div className="flex min-w-0 items-center gap-2">
				<WrenchIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
				{subtitle && (
					<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
						{subtitle}
					</span>
				)}
				<span className="truncate text-[13px] font-medium">{title ?? derivedName}</span>
				{effectiveBadge}
			</div>
			<ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-data-[state=open]:rotate-180" />
		</CollapsibleTrigger>
	);
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
	<CollapsibleContent
		className={cn(
			"data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-3 border-t border-border/40 p-3 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
			className,
		)}
		{...props}
	/>
);

export type ToolInputProps = ComponentProps<"div"> & {
	input: ToolPart["input"];
};

function jsonPreview(data: unknown, maxKeys = 3): string {
	if (typeof data !== "object" || data === null) return String(data);
	const entries = Object.entries(data as Record<string, unknown>);
	const shown = entries.slice(0, maxKeys).map(([key]) => key).join(", ");
	const rest = entries.length > maxKeys ? `, +${entries.length - maxKeys}` : "";
	return `{ ${shown}${rest} }`;
}

export const ToolInput = memo(function ToolInput({ className, input, ...props }: ToolInputProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<div className={cn("overflow-hidden", className)} {...props}>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger className="group/ti flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
					<ChevronRightIcon className={cn("size-3 shrink-0 transition-transform duration-150", open && "rotate-90")} />
					<span className="font-medium tracking-wide">{t("tool.input")}</span>
					{!open && (
						<span className="ml-1 truncate font-mono text-[11px] text-muted-foreground/70">
							{jsonPreview(input)}
						</span>
					)}
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="mt-1 rounded-md bg-muted/50">
						<CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
});

export type ToolOutputProps = ComponentProps<"div"> & {
	output: ToolPart["output"];
	errorText: ToolPart["errorText"];
};

export const ToolOutput = memo(function ToolOutput({
	className,
	output,
	errorText,
	...props
}: ToolOutputProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	if (!(output || errorText)) {
		return null;
	}

	const isError = !!errorText;
	const label = isError ? t("tool.status.error") : t("tool.output");

	let preview = "";
	if (!isError) {
		if (typeof output === "string") {
			preview = output.length > 80 ? `${output.slice(0, 80)}...` : output;
		} else if (typeof output === "object" && !isValidElement(output)) {
			preview = jsonPreview(output);
		}
	}

	const renderContent = (): ReactNode => {
		if (typeof output === "object" && !isValidElement(output)) {
			return <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
		}
		if (typeof output === "string") {
			return <CodeBlock code={output} language="json" />;
		}
		return <div>{String(output)}</div>;
	};

	return (
		<div className={cn("overflow-hidden", className)} {...props}>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger className="group/to flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
					<ChevronRightIcon className={cn("size-3 shrink-0 transition-transform duration-150", open && "rotate-90")} />
					<span className={cn("font-medium uppercase tracking-wide", isError && "text-destructive")}>{label}</span>
					{!open && preview && (
						<span className="ml-1 truncate font-mono text-[11px] text-muted-foreground/70">
							{preview}
						</span>
					)}
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div
						className={cn(
							"mt-1 overflow-x-auto rounded-md text-xs [&_table]:w-full",
							isError ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground",
						)}
					>
						{errorText && <div className="p-2">{errorText}</div>}
						{output ? renderContent() : null}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
});

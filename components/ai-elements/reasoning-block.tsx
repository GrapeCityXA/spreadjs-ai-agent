"use client";

import { memo, useState, useEffect, useRef } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BrainIcon, ChevronRightIcon } from "lucide-react";
import { MessageResponse } from "./message";
import { useTranslation } from "@/lib/i18n/react";

interface ReasoningBlockProps {
	text: string;
	state?: "streaming" | "done";
	interrupted?: boolean;
}

function stripThinkTags(value: string): string {
	return value.replace(/<\/?think>/gi, "");
}

export const ReasoningBlock = memo(function ReasoningBlock({
	text: rawText,
	state,
	interrupted,
}: ReasoningBlockProps) {
	const { t } = useTranslation();
	const text = stripThinkTags(rawText);
	const isStreaming = state === "streaming";
	const [open, setOpen] = useState(() => !interrupted);
	const hasAutoCollapsed = useRef(false);

	useEffect(() => {
		if (state === "done" && !interrupted && !hasAutoCollapsed.current) {
			const timer = setTimeout(() => {
				setOpen(false);
				hasAutoCollapsed.current = true;
			}, 1000);
			return () => clearTimeout(timer);
		}
	}, [state, interrupted]);

	if (!text) return null;

	const triggerLabel = interrupted
		? t("reasoning.interrupted")
		: isStreaming
			? t("reasoning.thinking")
			: t("reasoning.title");

	return (
		<Collapsible
			open={open}
			onOpenChange={(next) => {
				hasAutoCollapsed.current = true;
				setOpen(next);
			}}
			className="group/reasoning w-full"
		>
			<CollapsibleTrigger className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground/90">
				<BrainIcon className={cn("size-3 shrink-0", isStreaming && !interrupted && "animate-pulse")} />
				<span className={cn(interrupted && "text-amber-600/70")}>{triggerLabel}</span>
				<span
					className={cn(
						"size-1.5 rounded-full",
						interrupted
							? "bg-amber-500/40"
							: isStreaming
								? "animate-pulse bg-amber-400/80"
								: "bg-muted-foreground/25",
					)}
					aria-hidden="true"
				/>
				{!isStreaming && (
					<ChevronRightIcon
						className={cn("size-3 shrink-0 transition-transform duration-150", open && "rotate-90")}
					/>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-1 border-l-2 border-border/40 pl-3">
					<div
						className="max-h-40 overflow-y-auto chat-scrollbar text-xs leading-relaxed text-muted-foreground/70"
						tabIndex={0}
						role="region"
						aria-label={t("reasoning.content")}
					>
						{isStreaming ? (
							<pre className="whitespace-pre-wrap font-sans">{text}</pre>
						) : (
							<MessageResponse>{text}</MessageResponse>
						)}
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
});

export interface ReasoningPartData {
	text: string;
	state?: "streaming" | "done";
}

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
import { useProgressiveReveal } from "@/lib/hooks/useProgressiveReveal";
import { useStickToBottom } from "@/lib/hooks/useStickToBottom";

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
	// 只有一路跟着流式走过来的推理，才需要在结束后自动收起。
	// 已经结束的推理是之后才挂载的（展开「还有 N 个…」分组、恢复历史会话），
	// 沿用流式那套会先展开渲染、一秒后再自己合上，页面高度跟着跳一下。
	const sawStreaming = useRef(isStreaming);
	const [open, setOpen] = useState(() => isStreaming && !interrupted);
	const hasAutoCollapsed = useRef(false);

	// 逐字显示。服务端低频下发（便宜），这里按帧推进（连续），两者解耦。
	// 放完之前一直停在纯文本上——markdown 解析开销大，且中途切换会造成跳动。
	const revealed = useProgressiveReveal(text, isStreaming);
	const showPlainText = isStreaming || revealed < text.length;

	// 内容长过 max-h-40 之后，新出来的字会落到折叠线以下。跟随到底部，
	// 但用户往上翻时不抢——见 useStickToBottom
	const attachScroll = useStickToBottom<HTMLDivElement>(revealed);

	useEffect(() => {
		if (isStreaming) {
			sawStreaming.current = true;
			return;
		}
		if (!sawStreaming.current) return;
		if (state === "done" && !interrupted && !hasAutoCollapsed.current) {
			const timer = setTimeout(() => {
				setOpen(false);
				hasAutoCollapsed.current = true;
			}, 1000);
			return () => clearTimeout(timer);
		}
	}, [isStreaming, state, interrupted]);

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
						ref={attachScroll}
						className="max-h-40 overflow-y-auto chat-scrollbar text-xs leading-relaxed text-muted-foreground/70"
						tabIndex={0}
						role="region"
						aria-label={t("reasoning.content")}
					>
						{showPlainText ? (
							<pre className="whitespace-pre-wrap font-sans">{text.slice(0, revealed)}</pre>
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

"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import type { FileUIPart } from "ai";
import { isAppToolPart, type AppUIMessage } from "@/lib/agent/ui-message";
import { type Session, getSession } from "@/lib/agent/session-store";
import { ImageIcon } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
	type MixedPartItem,
	getToolName,
	SPECIAL_TOOLS,
	renderSpecialTool,
	MixedGroup,
} from "@/components/ai-elements/tool-call-display";
import { createPortal } from "react-dom";
import { useTranslation } from "@/lib/i18n/react";

// ============================================================================
// SessionPreview — 会话历史悬停预览面板（固定 500×300，显示在 hover 会话左侧）
// ============================================================================

const PREVIEW_W = 500;
const PREVIEW_H = 300;
const GAP = 4;
const noop = () => {};

interface SessionPreviewProps {
	sessionId: string;
	anchor: { left: number; top: number };
	onMouseEnter: () => void;
	onMouseLeave: () => void;
}

export function SessionPreview({ sessionId, anchor, onMouseEnter, onMouseLeave }: SessionPreviewProps) {
	const { t } = useTranslation();
	const [session, setSession] = useState<Session | null>(null);

	useEffect(() => {
		let cancelled = false;
		getSession(sessionId).then((s) => {
			if (!cancelled && s) setSession(s);
		});
		return () => { cancelled = true; };
	}, [sessionId]);

	const style = useMemo<React.CSSProperties>(() => ({
		position: "fixed",
		left: anchor.left - PREVIEW_W - GAP,
		top: Math.max(8, Math.min(anchor.top, window.innerHeight - PREVIEW_H - 8)),
		width: PREVIEW_W,
		height: PREVIEW_H,
		zIndex: 9000,
	}), [anchor]);

	const panelClass = "bg-background border border-border/60 rounded-lg shadow-lg flex flex-col overflow-hidden";

	if (!session) {
		return createPortal(
			<div className={panelClass} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
				<div className="flex items-center justify-center h-full">
					<span className="text-xs text-muted-foreground">{t("common.loading")}</span>
				</div>
			</div>, document.body
		);
	}

	return createPortal(
		<div className={panelClass} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
			<div className="flex-1 overflow-y-auto chat-scrollbar">
				<div className="flex flex-col gap-5 px-4 py-4">
					{session.messages.map((msg) => (
						<PreviewMessage key={msg.id} message={msg} />
					))}
				</div>
			</div>
		</div>, document.body
	);
}

/** 复用 ChatPanel 的消息渲染逻辑，按相同规则分组工具调用和思考过程 */
function PreviewMessage({ message }: { message: AppUIMessage }) {
	const { t } = useTranslation();
	return (
		<Message from={message.role}>
			<MessageContent>
				{(() => {
					const elements: React.ReactNode[] = [];
					const mixedBuf: MixedPartItem[] = [];
					let mixedGroupIdx = 0;

					const flushMixed = () => {
						if (mixedBuf.length === 0) return;
						elements.push(
							<MixedGroup key={`mixed-group-${mixedGroupIdx++}`} items={[...mixedBuf]} />,
						);
						mixedBuf.length = 0;
					};

					for (let i = 0; i < message.parts.length; i++) {
						const part = message.parts[i];

						if (isAppToolPart(part)) {
							const toolName = getToolName(part);
							if (SPECIAL_TOOLS.has(toolName)) {
								flushMixed();
								const el = renderSpecialTool(part, i, noop, -1);
								if (el) elements.push(el);
							} else {
								mixedBuf.push({ kind: "tool", part, index: i });
							}
							continue;
						}

						const isTransparent =
							(part.type === "text" && !part.text?.trim()) ||
							part.type === "step-start" ||
							part.type === "reasoning" ||
							part.type === "source-url" ||
							part.type === "source-document";

						if (!isTransparent) {
							flushMixed();
						}

						if (part.type === "text" && part.text?.trim()) {
							elements.push(<MessageResponse key={i}>{part.text}</MessageResponse>);
						} else if (part.type === "reasoning" && part.text) {
							mixedBuf.push({ kind: "reasoning", text: part.text, state: part.state });
						} else if (part.type === "file" && part.mediaType?.startsWith("image/")) {
							const fp: FileUIPart = part;
							elements.push(
								<HoverCard key={i} openDelay={200} closeDelay={100}>
									<HoverCardTrigger asChild>
										<span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground cursor-default mt-1">
											<ImageIcon className="size-3.5 text-muted-foreground" />
											<span className="max-w-[160px] truncate">{fp.filename ?? t("common.image")}</span>
										</span>
									</HoverCardTrigger>
									<HoverCardContent className="w-auto max-w-xs p-2" side="top">
										<div className="relative h-48 w-72 max-w-[80vw]">
											<Image
												src={fp.url}
												alt={fp.filename ?? t("common.image")}
												fill
												unoptimized
												sizes="288px"
												className="rounded-md object-contain"
											/>
										</div>
									</HoverCardContent>
								</HoverCard>,
							);
						}
					}

					flushMixed();
					return elements;
				})()}
			</MessageContent>
		</Message>
	);
}

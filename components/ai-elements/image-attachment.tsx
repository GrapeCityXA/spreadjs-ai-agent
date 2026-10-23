"use client";

import { useState } from "react";
import type { FileUIPart } from "ai";
import { ImageIcon } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/react";

/**
 * 聊天记录里的图片附件。
 *
 * 默认只显示文件名；悬浮给出小图预览，**点击打开大图**——用户需要确认自己当时
 * 发出去的是哪张图，光看文件名不够。
 *
 * 图片是消息里的 data URL，因此直接用原生 `<img>`，不经过 next/image 的优化管线。
 */
export function ImageAttachment({ part }: { part: FileUIPart }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [hoverOpen, setHoverOpen] = useState(false);
	const label = part.filename ?? t("common.image");

	return (
		<>
			<HoverCard
				open={hoverOpen && !open}
				onOpenChange={setHoverOpen}
				openDelay={200}
				closeDelay={100}
			>
				<HoverCardTrigger asChild>
					<button
						type="button"
						onClick={() => {
							// 打开大图时收起悬浮预览，避免两个浮层叠在一起
							setHoverOpen(false);
							setOpen(true);
						}}
						className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ImageIcon className="size-3.5 text-muted-foreground" />
						<span className="max-w-[160px] truncate">{label}</span>
					</button>
				</HoverCardTrigger>
				<HoverCardContent className="w-auto max-w-xs p-2" side="top">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={part.url}
						alt={label}
						className="max-h-48 w-auto max-w-[288px] rounded-md object-contain"
					/>
				</HoverCardContent>
			</HoverCard>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-[min(92vw,1100px)] p-3 sm:max-w-[min(92vw,1100px)]">
					<DialogTitle className="sr-only">{label}</DialogTitle>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={part.url}
						alt={label}
						className="mx-auto max-h-[82vh] w-auto max-w-full rounded-md object-contain"
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}

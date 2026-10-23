"use client";

import {
	TableIcon,
	BarChart3Icon,
	WandSparklesIcon,
	FileUpIcon,
	DatabaseIcon,
	SearchIcon,
	CalendarDaysIcon,
	WalletIcon,
	ImageUpIcon,
	type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { FileUIPart } from "ai";
import { useTranslation } from "@/lib/i18n/react";

interface EmptyStateProps {
	/** 可以附带图片一起发送（快捷指令「还原图片表格」） */
	onSend: (text: string, files?: FileUIPart[]) => void;
	isReady: boolean;
}

type PromptLevel = "simple" | "medium" | "complex";

const LEVEL_KEY = {
	simple: "empty.level.simple",
	medium: "empty.level.medium",
	complex: "empty.level.complex",
} as const;

interface StarterPrompt {
	icon: LucideIcon;
	label: string;
	prompt: string;
	/** 粗档位。不给具体积分数字：AI 的输出量不稳定，写死一个数就成了承诺 */
	level: PromptLevel;
	/** 随提示词附带的一张示例图片（public 下的路径） */
	image?: { src: string; filename: string; mediaType: string };
}

/** 把 public 下的图片读成 AI SDK 的 FileUIPart（data URL） */
async function loadImagePart(image: NonNullable<StarterPrompt["image"]>): Promise<FileUIPart> {
	const response = await fetch(image.src);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const blob = await response.blob();
	const url = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
		reader.readAsDataURL(blob);
	});
	return { type: "file", mediaType: image.mediaType, filename: image.filename, url };
}

export function EmptyState({ onSend, isReady }: EmptyStateProps) {
	const { t } = useTranslation();
	const [loadingImage, setLoadingImage] = useState(false);
	const capabilities = useMemo(
		() => [
			{ icon: TableIcon, label: t("empty.capability.data") },
			{ icon: WandSparklesIcon, label: t("empty.capability.format") },
			{ icon: BarChart3Icon, label: t("empty.capability.chart") },
			{ icon: FileUpIcon, label: t("empty.capability.file") },
		],
		[t],
	);
	const starterPrompts = useMemo<StarterPrompt[]>(
		() => [
			// 五条都从零可用：不假设表里已经有数据，空工作簿也能直接跑。
			// 按档位从轻到重排列，右端标出档位供用户挑任务时参考。
			{
				icon: SearchIcon,
				label: t("empty.prompt.structure"),
				prompt: t("empty.prompt.structure.full"),
				level: "simple",
			},
			{
				icon: DatabaseIcon,
				label: t("empty.prompt.sample"),
				prompt: t("empty.prompt.sample.full"),
				level: "medium",
			},
			{
				icon: CalendarDaysIcon,
				label: t("empty.prompt.schedule"),
				prompt: t("empty.prompt.schedule.full"),
				level: "complex",
			},
			{
				icon: WalletIcon,
				label: t("empty.prompt.budget"),
				prompt: t("empty.prompt.budget.full"),
				level: "complex",
			},
			{
				icon: ImageUpIcon,
				label: t("empty.prompt.image"),
				prompt: t("empty.prompt.image.full"),
				level: "complex",
				image: {
					src: "/starter/detection-records.png",
					filename: "检测记录表.png",
					mediaType: "image/png",
				},
			},
		],
		[t],
	);

	const sendStarter = async (item: StarterPrompt) => {
		if (!item.image) {
			onSend(item.prompt);
			return;
		}
		if (loadingImage) return;
		setLoadingImage(true);
		try {
			onSend(item.prompt, [await loadImagePart(item.image)]);
		} catch (error) {
			console.error("[empty-state] 示例图片加载失败", error);
		} finally {
			setLoadingImage(false);
		}
	};

	return (
		<div className="flex size-full flex-col items-center justify-center gap-4 px-6 py-4">
			<div className="flex flex-col items-center gap-1.5">
				{/* 品牌图标：public/grape.svg。用原生 img 而非 next/image——
				    next/image 默认不处理 SVG，需要打开 dangerouslyAllowSVG */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src="/grape.svg" alt="" className="size-9" />
				<h3 className="text-[15px] font-semibold">{t("empty.title")}</h3>
				<p className="text-center text-[13px] text-muted-foreground/80">{t("empty.subtitle")}</p>
			</div>

			{/* 能力标签是介绍性的；屏幕矮时优先让五条快捷指令完整显示，别让它撑出滚动条 */}
			<div className="flex flex-wrap justify-center gap-1 [@media(max-height:640px)]:hidden">
				{capabilities.map(({ icon: Icon, label }) => (
					<span
						key={label}
						className="inline-flex items-center gap-1.5 rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground/70"
					>
						<Icon className="size-3" />
						{label}
					</span>
				))}
			</div>

			<div className="flex w-full flex-col gap-2">
				{starterPrompts.map((item) => {
					const { icon: Icon, label, level } = item;
					// 带图的那条要先 fetch 图片，加载期间禁用它，避免连点
					const loading = !!item.image && loadingImage;
					return (
						<button
							key={label}
							type="button"
							disabled={!isReady || loading}
							aria-busy={loading || undefined}
							onClick={() => void sendStarter(item)}
							className="group flex items-center gap-3 rounded-lg border border-border/50 px-3.5 py-2 text-left text-[13px] transition-all hover:border-border hover:bg-accent/40 disabled:opacity-50"
						>
							<Icon className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary/70" />
							<span className="min-w-0 truncate text-foreground/90">{label}</span>
							{/* 只标档位、不标积分：模型每次的输出量不稳定，写死数字等于给了承诺 */}
							<span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-muted-foreground/80">
								{t(LEVEL_KEY[level])}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

"use client";

import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

interface ServiceUnavailableBannerProps {
	missing: string[];
}

export function ServiceUnavailableBanner({ missing }: ServiceUnavailableBannerProps) {
	return (
		<div
			className="flex items-start gap-2.5 border-b px-4 py-2.5"
			style={{ backgroundColor: "#FFFBEB", borderBottomColor: "rgba(245, 158, 11, 0.3)" }}
		>
			<AlertTriangleIcon
				className="mt-0.5 shrink-0"
				style={{ width: 16, height: 16, color: "white", fill: "#F59E0B" }}
			/>
			<div className="flex flex-col gap-1.5 min-w-0 flex-1">
				<p className="text-xs leading-relaxed text-amber-800 dark:text-amber-950">
					AI 服务不可用：缺少环境变量 {missing.join(", ")}。
					请配置后重启服务。
				</p>
				<button
					type="button"
					className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-900 cursor-pointer transition-all duration-150 hover:bg-amber-500/15 hover:text-amber-950 dark:hover:text-amber-950 hover:shadow-sm active:scale-[0.97]"
					onClick={() => window.location.reload()}
				>
					<RefreshCwIcon className="size-3" />
					刷新页面
				</button>
			</div>
		</div>
	);
}

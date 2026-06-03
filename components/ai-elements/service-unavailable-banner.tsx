"use client";

import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/react";

interface ServiceUnavailableBannerProps {
	missing: string[];
}

export function ServiceUnavailableBanner({ missing }: ServiceUnavailableBannerProps) {
	const { t } = useTranslation();

	return (
		<div
			className="flex items-start gap-2.5 border-b px-4 py-2.5"
			style={{ backgroundColor: "#FFFBEB", borderBottomColor: "rgba(245, 158, 11, 0.3)" }}
		>
			<AlertTriangleIcon
				className="mt-0.5 shrink-0"
				style={{ width: 16, height: 16, color: "white", fill: "#F59E0B" }}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
					{t("serviceUnavailable.message", { missing: missing.join(", ") })}
				</p>
				<button
					type="button"
					className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-700 transition-all duration-150 hover:bg-amber-500/15 hover:text-amber-900 hover:shadow-sm active:scale-[0.97] dark:text-amber-300 dark:hover:text-amber-100"
					onClick={() => window.location.reload()}
				>
					<RefreshCwIcon className="size-3" />
					{t("common.reload")}
				</button>
			</div>
		</div>
	);
}

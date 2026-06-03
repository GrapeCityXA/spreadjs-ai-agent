"use client";

import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/react";

interface ErrorMessageProps {
	error: Error;
	onRetry?: () => void;
}

function truncate(msg: string, max = 200): string {
	return msg.length > max ? `${msg.slice(0, max)}...` : msg;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
	const { t } = useTranslation();

	return (
		<div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
			<AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive/70" />
			<div className="flex min-w-0 flex-col gap-1.5">
				<p className="text-xs leading-relaxed text-destructive/90">{truncate(error.message)}</p>
				{onRetry && (
					<button
						type="button"
						className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
						onClick={onRetry}
					>
						<RefreshCwIcon className="size-3" />
						{t("common.retry")}
					</button>
				)}
			</div>
		</div>
	);
}

"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { SpreadJSProvider } from "@/lib/spreadjs/context";
import { ErrorBoundary } from "@/components/error-boundary";
import { DebugPanel } from "@/components/debug/debug-panel";
import { useResizablePanel } from "@/lib/hooks/useResizablePanel";
import { useTranslation } from "@/lib/i18n/react";
import { BugIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";

function LoadingDesigner() {
	const { t } = useTranslation();
	return (
		<div className="flex h-full items-center justify-center text-muted-foreground">
			{t("app.loadingDesigner")}
		</div>
	);
}

const SpreadJSDesigner = dynamic(() => import("@/components/SpreadJSDesigner"), {
	ssr: false,
	loading: () => <LoadingDesigner />,
});

const HANDLE_BASE: React.CSSProperties = {
	width: 2,
	height: "100vh",
	cursor: "col-resize",
	flexShrink: 0,
	position: "relative",
	zIndex: 10,
	transition: "background 150ms",
};

const BG_ACTIVE = "hsl(var(--primary) / 0.35)";
const BG_IDLE = "hsl(var(--border) / 0.6)";
const BG_HOVER = "hsl(var(--primary) / 0.25)";

export default function DebugPage() {
	const { t, locale } = useTranslation();
	const [panelOpen, setPanelOpen] = useState(true);
	const { width, dragging, handleProps } = useResizablePanel();

	const handleStyle = useMemo<React.CSSProperties>(() => ({
		...HANDLE_BASE,
		background: dragging ? BG_ACTIVE : BG_IDLE,
	}), [dragging]);

	const onHandleEnter = useCallback((e: React.MouseEvent) => {
		(e.currentTarget as HTMLElement).style.background = BG_HOVER;
	}, []);

	const onHandleLeave = useCallback((e: React.MouseEvent) => {
		if (!dragging) (e.currentTarget as HTMLElement).style.background = BG_IDLE;
	}, [dragging]);

	return (
		<SpreadJSProvider>
			<div className="flex h-screen">
				{/* 拖拽时覆盖全屏透明层，防止 iframe/canvas 吞噬鼠标事件 */}
				{dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}

				{/* 左侧：SpreadJS Designer */}
				<div className="relative flex-1 min-w-0 overflow-hidden">
					<ErrorBoundary label={t("app.spreadjsDesigner")} locale={locale}>
						<SpreadJSDesigner />
					</ErrorBoundary>
					{/* 收起状态下的展开按钮 */}
					{!panelOpen && (
						<button
							type="button"
							onClick={() => setPanelOpen(true)}
							className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground transition-colors"
						>
							<BugIcon className="size-3.5 text-amber-500" />
							{t("common.debug")}
							<PanelRightOpenIcon className="size-3.5" />
						</button>
					)}
				</div>

				{/* 右侧：Debug Panel（含左边缘拖拽手柄） */}
				{panelOpen && (
					<div style={{ width }} className="flex-shrink-0 h-screen flex">
						{/* 拖拽手柄 */}
						<div
							{...handleProps}
							style={handleStyle}
							onMouseEnter={onHandleEnter}
							onMouseLeave={onHandleLeave}
						/>
						<div className="flex-1 min-w-0 flex flex-col border-l border-border/60 shadow-[-1px_0_3px_0_rgb(0_0_0/0.04)]">
							{/* Debug Panel Header */}
							<div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 flex-shrink-0">
								<BugIcon className="size-3.5 text-amber-500" />
								<h1 className="text-xs font-semibold">{t("debug.toolCall")}</h1>
								<button
									type="button"
									onClick={() => setPanelOpen(false)}
									className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
								>
									{t("common.collapse")}
									<PanelRightCloseIcon className="size-3.5" />
								</button>
							</div>
							<div className="flex-1 min-h-0 overflow-hidden">
								<DebugPanel />
							</div>
						</div>
					</div>
				)}
			</div>
		</SpreadJSProvider>
	);
}

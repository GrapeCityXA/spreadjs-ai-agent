"use client";

import { useMemo, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { SpreadJSProvider } from "@/lib/spreadjs/context";
import { ErrorBoundary } from "@/components/error-boundary";
import ChatPanel from "@/components/ChatPanel";
import { useResizablePanel } from "@/lib/hooks/useResizablePanel";
import { useTranslation } from "@/lib/i18n/react";
import { SparklesIcon, PanelRightOpenIcon, PanelRightCloseIcon } from "lucide-react";

function LoadingDesigner() {
    const { t } = useTranslation();
    return (
        <div className="flex h-full items-center justify-center text-muted-foreground">
            {t("app.loadingDesigner")}
        </div>
    );
}

const SpreadJSDesigner = dynamic(
    () => import("@/components/SpreadJSDesigner"),
    {
        ssr: false,
        loading: () => <LoadingDesigner />,
    },
);

const HANDLE_BASE: React.CSSProperties = {
    width: 2,
    height: "100vh",
    cursor: "col-resize",
    flexShrink: 0,
    position: "relative",
    zIndex: 10,
    transition: "background 150ms, width 150ms",
};

const BG_ACTIVE = "#2563eb";
const BG_IDLE = "var(--border)";
const BG_HOVER = "#3b82f6";

export default function Home() {
    const { t, locale } = useTranslation();
    const { width, dragging, handleProps, setWidth } = useResizablePanel();
    const [isChatCollapsed, setIsChatCollapsed] = useState(false);

    const toggleChat = useCallback(() => setIsChatCollapsed(v => !v), []);

    const handleStyle = useMemo<React.CSSProperties>(() => ({
        ...HANDLE_BASE,
        background: dragging ? BG_ACTIVE : BG_IDLE,
    }), [dragging]);

    const onHandleEnter = useCallback((e: React.MouseEvent) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = BG_HOVER;
        el.style.width = "6px";
    }, []);

    const onHandleLeave = useCallback((e: React.MouseEvent) => {
        const el = e.currentTarget as HTMLElement;
        if (!dragging) {
            el.style.background = BG_IDLE;
            el.style.width = "2px";
        }
    }, [dragging]);

    return (
        <SpreadJSProvider>
            <div className="flex h-screen">
                {/* 拖拽时覆盖全屏透明层，防止 iframe/canvas 吞噬鼠标事件 */}
                {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
                {/* 左侧：SpreadJS Designer（isolate 防止内部 shape/chart 的 z-index 穿透到全局） */}
                <div className="relative flex-1 min-w-0 isolate overflow-hidden">
                    <ErrorBoundary label={t("app.spreadjsDesigner")} locale={locale}>
                        <SpreadJSDesigner />
                    </ErrorBoundary>
                    {/* 展开/收起按鈕（浮层，始终显示在 designer 右上角） */}
                    <button
                        type="button"
                        onClick={toggleChat}
                        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground transition-colors"
                    >
                        <SparklesIcon className="size-3.5 text-primary" />
                        {t("app.aiAssistant")}
                        {isChatCollapsed ? (
                            <PanelRightOpenIcon className="size-3.5" />
                        ) : (
                            <PanelRightCloseIcon className="size-3.5" />
                        )}
                    </button>
                </div>
                {/* 右侧：Chat Panel（含左边缘拖拽手柄），始终挂载，收起时隐藏 */}
                <div
                    style={isChatCollapsed ? { width: 0, overflow: "hidden" } : { width }}
                    className="flex-shrink-0 h-screen flex"
                >
                    {/* 拖拽手柄 */}
                    <div
                        {...handleProps}
                        style={handleStyle}
                        onMouseEnter={onHandleEnter}
                        onMouseLeave={onHandleLeave}
                    />
                    <div className="flex-1 min-w-0 border-l border-border/60 shadow-[-1px_0_3px_0_rgb(0_0_0/0.04)]">
                        <ErrorBoundary label={t("app.chatPanel")} locale={locale}>
                            <ChatPanel chatPanelWidth={width} onChatPanelWidthChange={setWidth} />
                        </ErrorBoundary>
                    </div>
                </div>
            </div>
        </SpreadJSProvider>
    );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
	SearchIcon,
	MessageSquareIcon,
	ChevronDownIcon,
	Trash2Icon,
	MoreHorizontalIcon,
	DownloadIcon,
	UploadIcon,
	FileWarningIcon,
	BugIcon,
} from "lucide-react";
import {
	type SessionSummary,
	listSessionSummaries,
	searchSessionSummaries,
	deleteSession,
	getSession,
	clearAllSessions,
	PAGE_SIZE,
} from "@/lib/agent/session-store";
import { SessionPreview } from "@/components/ai-elements/session-preview";
import { MAX_ATTACHMENT_SIZE } from "@/lib/hooks/useAttachments";
import { snapshotStore, snapshotStoreIdb } from "@/lib/spreadjs/snapshot-store";
import { useTranslation } from "@/lib/i18n/react";
import { getLocaleConfig, type AppLocale } from "@/lib/i18n";

interface SessionHistoryProps {
	currentSessionId: string;
	onSelectSession: (sessionId: string) => void;
	onNewSession: () => void;
	refreshTrigger?: number;
	onExportSession?: (sessionId: string) => void;
	onImportSession?: (file: File) => Promise<void>;
	onExportDiagnostic?: () => void;
}

export function SessionHistory({
	currentSessionId,
	onSelectSession,
	onNewSession,
	refreshTrigger,
	onExportSession,
	onImportSession,
	onExportDiagnostic,
}: SessionHistoryProps) {
	const { t, locale } = useTranslation();
	const [query, setQuery] = useState("");
	const [sessions, setSessions] = useState<SessionSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [offset, setOffset] = useState(0);
	const [loading, setLoading] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const searchEffectMountedRef = useRef(false);
	const isSearching = query.trim().length > 0;

	const showError = useCallback((msg: string) => {
		setErrorMsg(msg);
		if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
		errorTimerRef.current = setTimeout(() => setErrorMsg(null), 3000);
	}, []);

	useEffect(() => () => {
		if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
	}, []);

	const load = useCallback(async (q: string, off: number, replace: boolean) => {
		setLoading(true);
		try {
			const result = q.trim()
				? await searchSessionSummaries(q.trim(), off, PAGE_SIZE)
				: await listSessionSummaries(off, PAGE_SIZE);
			if (replace) {
				setSessions(result.sessions);
			} else {
				setSessions((prev) => [...prev, ...result.sessions]);
			}
			setTotal(result.total);
			setOffset(off + result.sessions.length);
		} finally {
			setLoading(false);
		}
	}, []);

	// 挂载与刷新时立即加载；query 变化交给下面的防抖 effect，避免同一轮加载两次
	useEffect(() => {
		setSessions([]);
		setOffset(0);
		load(query, 0, true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [load, refreshTrigger]);

	useEffect(() => {
		// 首次挂载已经由上面的 effect 加载过，这里跳过，避免 300ms 后再清空重载一次
		if (!searchEffectMountedRef.current) {
			searchEffectMountedRef.current = true;
			return;
		}
		if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
		searchTimerRef.current = setTimeout(() => {
			setSessions([]);
			setOffset(0);
			load(query, 0, true);
		}, 300);
		return () => {
			if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
		};
	}, [load, query]);

	const handleLoadMore = () => {
		load(query, offset, false);
	};

	const handleDelete = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		const session = await getSession(id);
		await deleteSession(id);
		if (session) {
			const snapshotIds = Object.values(session.snapshotMap ?? {});
			if (session.latestSnapshotId) snapshotIds.push(session.latestSnapshotId);
			if (snapshotIds.length > 0) {
				snapshotStoreIdb.discardMany(snapshotIds).catch(() => {});
			}
		}
		setSessions((prev) => prev.filter((item) => item.id !== id));
		setTotal((current) => current - 1);
		if (id === currentSessionId) onNewSession();
	};

	const handleClearAll = async () => {
		setMenuOpen(false);
		await clearAllSessions();
		snapshotStoreIdb.clear().catch(() => {});
		snapshotStore.clear();
		setSessions([]);
		setTotal(0);
		onNewSession();
	};

	const handleExport = useCallback((e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		onExportSession?.(id);
	}, [onExportSession]);

	const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		e.target.value = "";
		setMenuOpen(false);
		if (!file.name.toLowerCase().endsWith(".json")) {
			showError(t("prompt.fileTypeNotAccepted"));
			return;
		}
		if (file.size > MAX_ATTACHMENT_SIZE) {
			showError(t("prompt.fileTooLarge"));
			return;
		}
		try {
			await onImportSession?.(file);
		} catch (err) {
			showError(err instanceof Error ? err.message : t("sessionHistory.importFailed"));
		}
	}, [onImportSession, showError, t]);

	useEffect(() => {
		if (!menuOpen) return;
		const handler = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				menuRef.current && !menuRef.current.contains(target) &&
				triggerRef.current && !triggerRef.current.contains(target)
			) {
				setMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

	const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
	const [previewAnchor, setPreviewAnchor] = useState<{ left: number; top: number } | null>(null);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => {
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
	}, []);

	const handleHoverPreview = useCallback((id: string, anchor: { left: number; top: number }) => {
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
			hideTimerRef.current = null;
		}
		setPreviewSessionId(id);
		setPreviewAnchor(anchor);
	}, []);

	const handleLeavePreview = useCallback(() => {
		hideTimerRef.current = setTimeout(() => setPreviewSessionId(null), 300);
	}, []);

	const handlePreviewEnter = useCallback(() => {
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
			hideTimerRef.current = null;
		}
	}, []);

	const handlePreviewLeave = useCallback(() => {
		setPreviewSessionId(null);
	}, []);

	const hasMore = sessions.length < total;

	return (
		<div className="relative flex h-full flex-col bg-background">
			<input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

			<div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t("sessionHistory.title")}
				</span>
				<button
					ref={triggerRef}
					type="button"
					onClick={() => {
						if (menuOpen) {
							setMenuOpen(false);
							return;
						}
						const rect = triggerRef.current?.getBoundingClientRect();
						if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
						setMenuOpen(true);
					}}
					className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					title={t("sessionHistory.moreActions")}
				>
					<MoreHorizontalIcon className="size-3.5" />
				</button>
				{menuOpen && menuPos && (
					<div
						ref={menuRef}
						className="fixed z-50 w-max rounded-md border border-border bg-popover py-1 shadow-lg"
						style={{ top: menuPos.top, right: menuPos.right }}
					>
						{onImportSession && (
							<button
								type="button"
								onClick={() => {
									setMenuOpen(false);
									fileInputRef.current?.click();
								}}
								className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
							>
								<UploadIcon className="size-3 shrink-0" />
								{t("sessionHistory.import")}
							</button>
						)}
						{onExportSession && (
							<button
								type="button"
								onClick={() => {
									setMenuOpen(false);
									onExportSession(currentSessionId);
								}}
								className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
							>
								<DownloadIcon className="size-3 shrink-0" />
								{t("sessionHistory.exportCurrent")}
							</button>
						)}
						{onExportDiagnostic && (
							<button
								type="button"
								onClick={() => {
									setMenuOpen(false);
									onExportDiagnostic();
								}}
								className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
							>
								<BugIcon className="size-3 shrink-0" />
								{t("sessionHistory.exportDiagnostics")}
							</button>
						)}
						<div className="my-1 border-t border-border/50" />
						<button
							type="button"
							onClick={handleClearAll}
							className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-accent"
						>
							<Trash2Icon className="size-3 shrink-0" />
							{t("sessionHistory.clearAll")}
						</button>
					</div>
				)}
			</div>

			{errorMsg && (
				<div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-3 py-2">
					<FileWarningIcon className="size-3.5 shrink-0 text-destructive" />
					<span className="flex-1 text-xs leading-snug text-destructive">{errorMsg}</span>
				</div>
			)}

			<div className="border-b border-border/40 px-3 py-2">
				<div className="relative">
					<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t("sessionHistory.search")}
						className="w-full rounded-md border border-border/60 bg-muted/30 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto chat-scrollbar">
				{sessions.length === 0 && !loading ? (
					<div className="flex h-24 flex-col items-center justify-center gap-1 text-xs text-muted-foreground/60">
						<MessageSquareIcon className="size-4" />
						{isSearching ? t("sessionHistory.noneMatching") : t("sessionHistory.none")}
					</div>
				) : (
					<ul className="py-1">
						{sessions.map((session) => (
							<SessionItem
								key={session.id}
								session={session}
								isActive={session.id === currentSessionId}
								locale={locale}
								onClick={() => onSelectSession(session.id)}
								onDelete={(e) => handleDelete(e, session.id)}
								onExport={onExportSession ? (e) => handleExport(e, session.id) : undefined}
								onHoverPreview={handleHoverPreview}
								onLeavePreview={handleLeavePreview}
							/>
						))}
					</ul>
				)}
				{loading && sessions.length > 0 && (
					<div className="flex justify-center py-2">
						<span className="text-xs text-muted-foreground/60">{t("sessionHistory.loading")}</span>
					</div>
				)}
				{hasMore && !loading && (
					<button
						type="button"
						onClick={handleLoadMore}
						className="flex w-full items-center justify-center gap-1 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
					>
						<ChevronDownIcon className="size-3.5" />
						{t("sessionHistory.loadMore", { remaining: total - sessions.length })}
					</button>
				)}
			</div>

			{previewSessionId && previewAnchor && (
				<SessionPreview
					sessionId={previewSessionId}
					anchor={previewAnchor}
					onMouseEnter={handlePreviewEnter}
					onMouseLeave={handlePreviewLeave}
				/>
			)}
		</div>
	);
}

interface SessionItemProps {
	session: SessionSummary;
	isActive: boolean;
	locale: AppLocale;
	onClick: () => void;
	onDelete: (e: React.MouseEvent) => void;
	onExport?: (e: React.MouseEvent) => void;
	onHoverPreview: (sessionId: string, anchor: { left: number; top: number }) => void;
	onLeavePreview: () => void;
}

function SessionItem({
	session,
	isActive,
	locale,
	onClick,
	onDelete,
	onExport,
	onHoverPreview,
	onLeavePreview,
}: SessionItemProps) {
	const { t } = useTranslation();
	const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const itemRef = useRef<HTMLDivElement>(null);

	useEffect(() => () => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
	}, []);

	const handleMouseEnter = useCallback(() => {
		hoverTimerRef.current = setTimeout(() => {
			const rect = itemRef.current?.getBoundingClientRect();
			if (rect) onHoverPreview(session.id, { left: rect.left, top: rect.top });
		}, 500);
	}, [onHoverPreview, session.id]);

	const handleMouseLeave = useCallback(() => {
		if (hoverTimerRef.current) {
			clearTimeout(hoverTimerRef.current);
			hoverTimerRef.current = null;
		}
		onLeavePreview();
	}, [onLeavePreview]);

	const date = new Date(session.updatedAt);
	const now = new Date();
	const isToday = date.toDateString() === now.toDateString();
	const localeTag = getLocaleConfig(locale).dateLocale;
	const timeStr = isToday
		? date.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" })
		: date.toLocaleDateString(localeTag, { month: "numeric", day: "numeric" });

	return (
		<li>
			<div
				ref={itemRef}
				role="button"
				tabIndex={0}
				onClick={onClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick();
					}
				}}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				className={`group relative flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 ${
					isActive ? "border-r-2 border-primary bg-primary/8" : ""
				}`}
			>
				<MessageSquareIcon className={`mt-0.5 size-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/50"}`} />
				<div className="min-w-0 flex-1">
					<p className={`truncate text-xs font-medium leading-tight ${isActive ? "text-primary" : "text-foreground"}`}>
						{session.title}
					</p>
					<p className="mt-0.5 text-[10px] text-muted-foreground/50">{timeStr}</p>
				</div>
				<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-all group-hover:opacity-100">
					{onExport && (
						<button
							type="button"
							onClick={onExport}
							className="rounded p-0.5 text-muted-foreground/60 transition-all hover:bg-accent hover:text-foreground"
							title={t("sessionHistory.export")}
						>
							<DownloadIcon className="size-3" />
						</button>
					)}
					<button
						type="button"
						onClick={onDelete}
						className="rounded p-0.5 text-muted-foreground/60 transition-all hover:bg-destructive/10 hover:text-destructive"
						title={t("sessionHistory.delete")}
					>
						<Trash2Icon className="size-3" />
					</button>
				</div>
			</div>
		</li>
	);
}

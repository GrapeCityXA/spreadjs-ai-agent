"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { FileUIPart } from "ai";
import { useSpreadJS } from "@/lib/spreadjs/context";
import { snapshotStoreIdb } from "@/lib/spreadjs/snapshot-store";
import { saveWorkbook, loadWorkbook, clearWorkbook, hasAutoSaveData } from "@/lib/spreadjs/autosave-store";
import { getDisplayName } from "@/lib/tools/registry";
import { CHAT_API_ENDPOINT } from "@/lib/config";
import {
	getPartState,
	getPartText,
	getTaskToolData,
	isAppToolPart,
	isRetryStatusPart,
	isTaskToolPart,
	type AppUIMessage,
} from "@/lib/agent/ui-message";
import { useAttachments } from "@/lib/hooks/useAttachments";
import { useChatContext } from "@/lib/hooks/useChatContext";
import { useDirtyTracker } from "@/lib/hooks/useDirtyTracker";
import { useToolDispatch } from "@/lib/hooks/useToolDispatch";
import { useDestructiveGuard } from "@/lib/hooks/useDestructiveGuard";
import { useSession, getActiveSessionId } from "@/lib/hooks/useSession";
import { useSheetInfo } from "@/lib/hooks/useSheetInfo";
import { useServiceStatus } from "@/lib/hooks/useServiceStatus";
import { getStoredMcpClientId, useMcpServers } from "@/lib/hooks/useMcpServers";
import { useContextUsage } from "@/lib/hooks/useContextUsage";
import { type AppLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/react";
import { SettingsPanel } from "@/components/settings-panel";
import { useSettings } from "@/lib/hooks/useSettings";
import { useTheme } from "@/lib/hooks/useTheme";
import { ServiceUnavailableBanner } from "@/components/ai-elements/service-unavailable-banner";
import { PlusIcon, XIcon, FileIcon, ImageIcon, SparklesIcon, HistoryIcon, PaperclipIcon, Settings2Icon, WrenchIcon, RotateCcwIcon, GitBranchIcon, CopyIcon, PlayIcon, LoaderIcon, BrainIcon, PenLineIcon, AlertCircleIcon, CircleCheckIcon, ChevronDownIcon, PauseCircleIcon, MousePointerIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ai-elements/empty-state";
import { ThinkingIndicator } from "@/components/ai-elements/thinking-indicator";
import { ErrorMessage } from "@/components/ai-elements/error-message";
import { ContextUsageIndicator } from "@/components/ai-elements/context-usage-indicator";
import {
	type MixedPartItem,
	getToolName,
	findLastTaskToolIndex,
	SPECIAL_TOOLS,
	renderSpecialTool,
	MixedGroup,
} from "@/components/ai-elements/tool-call-display";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputTextarea,
	PromptInputSubmit,
	PromptInputFooter,
} from "@/components/ai-elements/prompt-input";
import { SessionHistory } from "@/components/ai-elements/session-history";
import {
	downloadSessionFile,
	parseSessionImportFile,
	importFileToSession,
	downloadDiagnosticFile,
	type AutoSendDecisionSnapshot,
	type ChatRequestSnapshot,
} from "@/lib/agent/session-io";
import { getSession, saveSession } from "@/lib/agent/session-store";
import type { ErrorLogEntry } from "@/lib/logging/types";
import { DestructiveConfirmInline } from "@/components/ai-elements/destructive-confirm-inline";

// ============================================================================
// MessageItem — memo 化的单条消息渲染，避免兄弟消息变化时不必要的重渲染
// ============================================================================

interface MessageItemProps {
	message: AppUIMessage;
	msgId: string;
	taskRenderDecision: Map<string, "live" | "snapshot">;
	isLast: boolean;
	status: string;
	sendMessage: (msg: { text: string }) => void;
	hasSnapshot?: boolean;
	onFork?: (messageId: string, withRestore: boolean) => void;
	/** 下一条用户消息的文本，用于恢复 ask_user 的已选状态 */
	nextUserText?: string;
}

const MessageItem = memo(function MessageItem({ message, msgId, taskRenderDecision, isLast, status, sendMessage, hasSnapshot, onFork, nextUserText }: MessageItemProps) {
	const { t } = useTranslation();
	const lastTaskIdx = findLastTaskToolIndex(message.parts);
	const showInlineThinking = isLast && message.role === "assistant" && status === "submitted";
	const isUser = message.role === "user";
	// 中断标识：从消息本身读取，仅最后一条消息展示（避免历史中断消息误显示）
	const isInterrupted = !!message.interrupted;
	const showInterrupted = isInterrupted && isLast && !isUser;

	return (
		<Message from={message.role}>
			{isUser && onFork && (
				<div className="relative">
					<div className="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-10">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex size-7 items-center justify-center rounded-full border border-border/60 bg-background shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
									title={t("chat.forkSession")}
								>
									<RotateCcwIcon className="size-3.5" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={4}>
								<DropdownMenuItem onClick={() => onFork(message.id, false)}>
									<CopyIcon className="size-4" />
									<span>{t("chat.duplicateSession")}</span>
								</DropdownMenuItem>
								{hasSnapshot && (
									<DropdownMenuItem onClick={() => onFork(message.id, true)}>
										<GitBranchIcon className="size-4" />
										<span>{t("chat.duplicateSessionRestore")}</span>
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			)}
			<MessageContent>
					{(() => {
					const elements: React.ReactNode[] = [];
					const mixedBuf: MixedPartItem[] = [];
					let mixedGroupIdx = 0;

					const flushMixed = () => {
						if (mixedBuf.length === 0) return;
						elements.push(
							<MixedGroup key={`mixed-group-${mixedGroupIdx++}`} items={[...mixedBuf]} interrupted={showInterrupted} />,
						);
						mixedBuf.length = 0;
					};

					for (let i = 0; i < message.parts.length; i++) {
						const part = message.parts[i];

						if (isAppToolPart(part)) {
							const toolName = getToolName(part);
							if (SPECIAL_TOOLS.has(toolName)) {
								flushMixed();
								const el = renderSpecialTool(part, i, sendMessage, lastTaskIdx, nextUserText, msgId, taskRenderDecision);
								if (el) elements.push(el);
							} else {
								mixedBuf.push({ kind: "tool", part, index: i });
							}
							continue;
						}

						// 透明 part：不打断分组
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
							// 过滤流式传输中可能残留的 <think> 标签
							const cleaned = part.text.replace(/<\/?think>/g, "").trim();
							if (!cleaned) continue;
							mixedBuf.push({ kind: "reasoning", text: cleaned, state: part.state });
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
				{showInlineThinking && <ThinkingIndicator />}
				{showInterrupted && (
					<div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground/50">
						<span>{t("chat.sessionInterrupted")}</span>
					</div>
				)}
			</MessageContent>
		</Message>
	);
}, (prev, next) => {
	if (prev.message.id !== next.message.id) return false;
	if (prev.isLast !== next.isLast) return false;
	if (prev.hasSnapshot !== next.hasSnapshot) return false;
	// 流式传输期间，最后一条消息始终重渲染以确保内容实时更新。
	// AI SDK 可能对 message.parts 原地 mutation，导致 prevLast.text === nextLast.text
	// （同一引用），memo 无法检测到文本增长，内容在流结束后才一次性显示。
	if (next.isLast && (next.status === "streaming" || next.status === "submitted")) return false;
	// interrupted 字段变化（中断时写入消息对象）需触发重渲染
	if (prev.message.interrupted !== next.message.interrupted) return false;
	if (prev.message.parts.length !== next.message.parts.length) return false;
	// 最后一个 part 的 state 变化意味着 tool call 完成或新内容到达
	const prevLast = prev.message.parts[prev.message.parts.length - 1];
	const nextLast = next.message.parts[next.message.parts.length - 1];
	if (getPartState(prevLast) !== getPartState(nextLast)) return false;
	if (getPartText(prevLast) !== getPartText(nextLast)) return false;
	if (next.isLast && prev.status !== next.status) return false;
	return true;
});

// ============================================================================
// 标题栏状态文本：根据当前对话状态动态显示
// ============================================================================

/** 从最后一条助手消息中提取正在执行的工具名 */
function getActiveToolName(messages: AppUIMessage[], locale: AppLocale): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		for (let j = msg.parts.length - 1; j >= 0; j--) {
			const part = msg.parts[j];
			if (!isAppToolPart(part)) continue;
			if (part.state === "input-available" || part.state === "input-streaming") {
				return getDisplayName(getToolName(part), locale);
			}
			// 已经有完成的工具结果，不再往前搜索
			return null;
		}
		break;
	}
	return null;
}

/** 检查最后一条助手消息是否正在流式输出推理内容 */
function isReasoningStreaming(messages: AppUIMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		for (let j = msg.parts.length - 1; j >= 0; j--) {
			const part = msg.parts[j];
			if (part.type === "reasoning") {
				return part.state === "streaming";
			}
			// 跳过透明 part（空文本、step-start 等）
			if (part.type === "text" && !part.text?.trim()) continue;
			if (part.type === "step-start") continue;
			// 遇到非透明、非 reasoning 的 part，说明推理已过
			return false;
		}
		break;
	}
	return false;
}

// ============================================================================
// ChatPanel — 核心编排器
// ============================================================================

interface ChatPanelProps {
	chatPanelWidth?: number;
	onChatPanelWidthChange?: (width: number) => void;
}

export default function ChatPanel({ chatPanelWidth, onChatPanelWidthChange }: ChatPanelProps) {
	const { t, locale } = useTranslation();
	const { workbook, isReady } = useSpreadJS();
	// 每次渲染更新 ref，保证 handleSubmit（useCallback 闭包）拿到最新 workbook
	const workbookRef = useRef(workbook);
	workbookRef.current = workbook;
	const { info: sheetInfo, refresh: refreshSheetInfo } = useSheetInfo(workbook, locale);
	const serviceStatus = useServiceStatus();
	const serviceAvailable = serviceStatus.available;
	const visionAvailable = serviceStatus.visionAvailable;
	const [input, setInput] = useState("");
	const [showHistory, setShowHistory] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [historyRefresh, setHistoryRefresh] = useState(0);
	const [pendingAction, setPendingAction] = useState<{ message: string; action: () => void } | null>(null);

	// MCP
	const {
		servers: mcpServers,
		loading: mcpLoading,
		error: mcpError,
		configJson: mcpConfigJson,
		saveAndConnect: saveAndConnectMcp,
		toggleServer: toggleMcpServer,
		disconnectAll: disconnectAllMcp,
		authorizeServer: authorizeMcpServer,
		ensureConnected,
		toolCount,
	} = useMcpServers(locale);

	// 设置
	const { settings, updateSettings } = useSettings();
	useTheme(settings.theme, workbook);

	// 自动保存：中断标记 — 区分 AI 自然完成 vs 用户手动中断
	const wasStoppedRef = useRef(false);
	// 中断后等 status 回 ready 再发的待发消息（避免 stop+setTimeout(0) 竞态）
	const [pendingAfterStop, setPendingAfterStop] = useState<string | null>(null);

	// 会话管理
	const { session, syncMessages, flushMessages, switchSession, newSession, onTitleChange, linkSnapshot, getSnapshotId, forkSession, saveTokenUsage } = useSession(settings.locale);
	const sessionRef = useRef(session);
	useEffect(() => {
		sessionRef.current = session;
	}, [session]);

	// 提取的 hooks
	const { pendingFiles, pendingFilesRef, fileInputRef, handleFileSelect, handleFileDrop, handlePaste, removePendingFile, consumePendingFile, consumePendingImageParts, clearAttachments } = useAttachments({ visionAvailable });
	const [isDragging, setIsDragging] = useState(false);
	// 工作簿变更追踪：记录每次 HTTP 请求之间的所有 SpreadJS 变更
	const { consume: consumeDirty } = useDirtyTracker(workbook, settings.locale);
	// 防止 agent 循环无限迭代（每次用户发消息重置计数器）
	const autoStepCountRef = useRef(0);
	const lastAutoSendDecisionRef = useRef<AutoSendDecisionSnapshot | undefined>(undefined);
	const autoSendDecisionHistoryRef = useRef<AutoSendDecisionSnapshot[]>([]);
	const chatRequestHistoryRef = useRef<ChatRequestSnapshot[]>([]);
	const [stepLimitPaused, setStepLimitPaused] = useState(false);
	const { buildBody } = useChatContext(workbook, consumeDirty, settings.locale, () => {
		const requestId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const last = sessionRef.current.messages[sessionRef.current.messages.length - 1];
		chatRequestHistoryRef.current = [
			...chatRequestHistoryRef.current.slice(-49),
			{
				requestId,
				sessionId: sessionRef.current.id,
				startedAt: new Date().toISOString(),
				status: "started",
				messageCount: sessionRef.current.messages.length,
				lastMessageId: last?.id,
				lastMessageRole: last?.role,
			},
		];
		return {
			requestId,
			sessionId: sessionRef.current.id,
			clientLastMessageId: last?.id,
			clientLastMessageRole: last?.role,
			mcpClientId: getStoredMcpClientId(),
		};
	});
	const { confirmDialog, requestConfirm, onConfirmChoice } = useDestructiveGuard(settings.allowAllDestructive);
	const { onToolCall, addToolOutputRef } = useToolDispatch(workbook, pendingFilesRef, requestConfirm, refreshSheetInfo, locale);

	// 稳定引用：避免内联创建导致 useChat 每次重建触发 messages 无限 rerender
	const transport = useMemo(
		() => new DefaultChatTransport({ api: CHAT_API_ENDPOINT, body: buildBody }),
		[buildBody],
	);

	const sendAutomaticallyWhen = useCallback((params: { messages: AppUIMessage[] }) => {
		const last = params.messages[params.messages.length - 1];
		const recordDecision = (decision: boolean, reason: string) => {
			lastAutoSendDecisionRef.current = {
				timestamp: new Date().toISOString(),
				decision,
				reason,
				lastMessageId: last?.id,
				lastMessageRole: last?.role,
				lastAssistantPartCount: last?.role === "assistant" ? last.parts.length : undefined,
			};
			autoSendDecisionHistoryRef.current = [
				...autoSendDecisionHistoryRef.current.slice(-49),
				lastAutoSendDecisionRef.current,
			];
			return decision;
		};

		// stop() 后仍在运行的工具完成时，不触发自动循环
		if (wasStoppedRef.current) return recordDecision(false, "manual-stop-active");

		// ask_user 工具输出后暂停循环，等待用户选择
		if (last?.role === "assistant") {
			const hasAskUser = last.parts.some(
				(p) => isAppToolPart(p) && getToolName(p) === "ask_user" && p.state === "output-available",
			);
			if (hasAskUser) return recordDecision(false, "ask-user-awaiting-selection");
		}

		// 步数上限保护：仅在本轮所有工具都完成（即将触发下一次 auto-send）时才计步。
		// N 个并行工具调用会触发 N 次 addToolOutput，只有最后一次才会使
		// lastAssistantMessageIsCompleteWithToolCalls 返回 true，因此计数器只递增一次。
		const shouldSend = lastAssistantMessageIsCompleteWithToolCalls(params);
		if (!shouldSend) return recordDecision(false, "last-assistant-message-not-complete-with-tool-calls");

		autoStepCountRef.current++;
		if (autoStepCountRef.current > settings.maxAutoSteps) {
			console.warn(`[sendAutomatically] Auto-step limit ${settings.maxAutoSteps} reached. Pausing the loop.`);
			setStepLimitPaused(true);
			return recordDecision(false, "max-auto-steps-reached");
		}

		return recordDecision(true, "complete-tool-calls");
	}, [settings.maxAutoSteps]);

	const { messages, sendMessage, addToolOutput, error, clearError, status, stop, setMessages } = useChat<AppUIMessage>({
		transport,
		sendAutomaticallyWhen,
		onToolCall,
	});

	useEffect(() => {
		const last = chatRequestHistoryRef.current.at(-1);
		if (!last || last.status !== "started") return;
		if (status === "error") {
			last.status = "errored";
			last.endedAt = new Date().toISOString();
			last.errorMessage = error?.message ?? "Chat request failed";
		} else if (status === "ready") {
			last.status = "completed";
			last.endedAt = new Date().toISOString();
		}
	}, [error, status]);

	// 跨消息预计算：每个 planId 最后一次出现的位置，以及全局最后一个任务工具位置
	// key 格式 `${messageId}:${partIdx}`
	const taskRenderDecision = useMemo(() => {
		const decision = new Map<string, "live" | "snapshot">();
		const lastByPlan = new Map<string, string>(); // planId → key
		let globalLastKey: string | null = null;
		let globalLastCompleted = false;

		for (const msg of messages) {
			if (msg.role !== "assistant") continue;
			msg.parts.forEach((part, pi: number) => {
				if (isTaskToolPart(part)) {
					const key = `${msg.id}:${pi}`;
					globalLastKey = key;
					globalLastCompleted = part.state === "output-available";
					const planId = getTaskToolData(part)?.planId ?? undefined;
					if (planId) lastByPlan.set(planId, key);
				}
			});
		}

		// 每个 plan 的最后位置标记为 snapshot
		lastByPlan.forEach((key) => decision.set(key, "snapshot"));

		// 全局最后一个工具：
		// - 未完成（流式中）→ live（从 taskStore 实时读取）
		// - 已完成 → 保留 snapshot（历史重载时 taskStore 为空，live 会显示空）
		//   若没有 planId（旧数据）且已完成 → 也标为 snapshot 兜底
		if (globalLastKey) {
			if (!globalLastCompleted) {
				decision.set(globalLastKey, "live");
			} else if (!decision.has(globalLastKey)) {
				// 已完成但无 planId（旧数据），兜底显示
				decision.set(globalLastKey, "snapshot");
			}
		}

		return decision;
	}, [messages]);

	// isGenerating 提前到 handleStop 之前，供中断逻辑使用
	const isGenerating = status === "streaming" || status === "submitted";
	const isGeneratingRef = useRef(isGenerating);
	isGeneratingRef.current = isGenerating;

	// 同步绑定 addToolOutput（ref 在 onToolCall 异步执行前已就绪）
	addToolOutputRef.current = addToolOutput;

	// 自动保存：包装 stop，中断时在最后一条消息（user 或 assistant）上写入 interrupted 标记
	const handleStop = useCallback(() => {
		wasStoppedRef.current = true;
		if (isGeneratingRef.current) {
			setMessages((prev) => {
				if (prev.length === 0) return prev;
				const updated = [...prev];
				updated[updated.length - 1] = { ...updated[updated.length - 1], interrupted: true };
				return updated;
			});
		}
		stop();
	}, [stop, setMessages]);

	// 上下文 token 用量（跟随会话切换更新）
	const contextUsage = useContextUsage(messages, toolCount, status, session.id, session.tokenUsage, saveTokenUsage);

	// 重试进度：从最后一条 assistant 消息的 data-retry-status part 中提取
	const retryStatus = useMemo(() => {
		if (status !== 'streaming' && status !== 'submitted') return null;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role !== 'assistant') break;
			for (let j = msg.parts.length - 1; j >= 0; j--) {
				const part = msg.parts[j];
				if (isRetryStatusPart(part)) {
					return part.data;
				}
			}
		}
		return null;
	}, [messages, status]);
	// 上下文接近上限阈值
	const CONTEXT_WARN_THRESHOLD = 80;
	const CONTEXT_FULL_THRESHOLD = 95;
	const contextNearLimit = contextUsage.percent >= CONTEXT_WARN_THRESHOLD && contextUsage.percent < CONTEXT_FULL_THRESHOLD;
	const contextFull = contextUsage.percent >= CONTEXT_FULL_THRESHOLD;

	// 快照关联：保存待关联的 snapshotId，当新用户消息出现时与 messageId 绑定
	const pendingSnapshotRef = useRef<string | null>(null);
	const prevUserMsgCountRef = useRef(0);
	const [savingSnapshot, setSavingSnapshot] = useState(false);

	// 消息变化时同步到会话存储 + 快照关联
	const hasNotifiedNewSession = useRef(false);
	useEffect(() => {
		if (messages.length > 0) {
			syncMessages(messages);

			// 检测是否有新的用户消息，关联 pending snapshot
			const userMessages = messages.filter((m) => m.role === "user");
			if (userMessages.length > prevUserMsgCountRef.current && pendingSnapshotRef.current) {
				const latestUserMsg = userMessages[userMessages.length - 1];
				linkSnapshot(latestUserMsg.id, pendingSnapshotRef.current);
				pendingSnapshotRef.current = null;
			}
			prevUserMsgCountRef.current = userMessages.length;

			// 新会话首条消息时刷新一次，让列表出现该条目
			if (!hasNotifiedNewSession.current) {
				hasNotifiedNewSession.current = true;
				setHistoryRefresh((n) => n + 1);
			}
		}
	}, [messages, syncMessages, linkSnapshot]);

	// 标题生成完成时刷新历史列表
	useEffect(() => {
		return onTitleChange(() => {
			setHistoryRefresh((n) => n + 1);
		});
	}, [onTitleChange]);

	// Esc 快捷键中断生成（isGenerating / isGeneratingRef 已在 useChat 后定义）
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isGenerating) handleStop();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [isGenerating, handleStop]);

	// 标题栏副标题：跟随 UI 状态（而非仅数据层 status）
	// 数据流可能已结束（status=ready），但推理 UI 仍在流式渲染，此时副标题应跟随 UI 状态
	// 只要 AI 没有确定结束，就不显示"就绪"
	const lastMsgInterrupted = !!messages[messages.length - 1]?.interrupted;
	const headerStatus = useMemo<{ text: string; icon: React.ReactNode }>(() => {
		if (!isReady) return {
			text: t("chat.header.loading"),
			icon: <LoaderIcon className="size-3 animate-spin text-muted-foreground" />,
		};
		if (status === "submitted") return {
			text: t("chat.header.thinking"),
			icon: <BrainIcon className="size-3 animate-pulse text-primary" />,
		};
		if (status === "streaming") {
			const toolName = getActiveToolName(messages, locale);
			if (toolName) return {
				text: t("chat.header.running", { toolName }),
				icon: <WrenchIcon className="size-3 animate-pulse text-amber-500" />,
			};
			if (isReasoningStreaming(messages)) return {
				text: t("chat.header.thinking"),
				icon: <BrainIcon className="size-3 animate-pulse text-primary" />,
			};
			return {
				text: t("chat.header.responding"),
				icon: <PenLineIcon className="size-3 animate-pulse text-primary" />,
			};
		}
		if (status === "error") return {
			text: t("chat.header.error"),
			icon: <AlertCircleIcon className="size-3 text-destructive" />,
		};
		// 最后一条助手消息被中断 → 直接就绪，跳过残留的流式状态检查
		if (lastMsgInterrupted) return {
			text: t("chat.header.ready"),
			icon: <CircleCheckIcon className="size-3 text-emerald-500" />,
		};
		// 数据流已结束，但 UI 可能仍未完成：推理仍在流式渲染 / 工具仍在执行
		if (isReasoningStreaming(messages)) return {
			text: t("chat.header.thinking"),
			icon: <BrainIcon className="size-3 animate-pulse text-primary" />,
		};
		const activeToolAfterReady = getActiveToolName(messages, locale);
		if (activeToolAfterReady) return {
			text: t("chat.header.running", { toolName: activeToolAfterReady }),
			icon: <WrenchIcon className="size-3 animate-pulse text-amber-500" />,
		};
		// 步数上限暂停：AI 未真正结束，等待用户继续
		if (stepLimitPaused) return {
			text: t("chat.header.waiting"),
			icon: <PauseCircleIcon className="size-3 text-amber-500" />,
		};
		return {
			text: t("chat.header.ready"),
			icon: <CircleCheckIcon className="size-3 text-emerald-500" />,
		};
	}, [isReady, status, messages, stepLimitPaused, lastMsgInterrupted, locale, t]);

	const sendMessageRef = useRef(sendMessage);
	sendMessageRef.current = sendMessage;

	// 自动保存：AI 回复自然完成后保存工作簿到 IndexedDB
	// 延迟 500ms 触发，防止 tool call 自动循环时每步间隙都保存（ready → submitted 切换）
	const [autoSaveExists, setAutoSaveExists] = useState(false);
	const prevIsGeneratingRef = useRef(false);
	const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); }, []);
	useEffect(() => {
		const wasGenerating = prevIsGeneratingRef.current;
		prevIsGeneratingRef.current = isGenerating;

		// 重新进入生成状态（自动循环）→ 取消挂起的保存
		if (isGenerating) {
			if (autoSaveTimerRef.current) {
				clearTimeout(autoSaveTimerRef.current);
				autoSaveTimerRef.current = null;
			}
			return;
		}

		if (wasGenerating && !isGenerating && settings.autoSave && workbook) {
			if (wasStoppedRef.current || stepLimitPaused) {
				return;
			}
			autoSaveTimerRef.current = setTimeout(() => {
				autoSaveTimerRef.current = null;
				// 工作簿 + 会话消息一起保存
				flushMessages();
				saveWorkbook(workbook).then(() => setAutoSaveExists(true)).catch(() => {});
			}, 500);
		}
	}, [isGenerating, settings.autoSave, workbook, stepLimitPaused, flushMessages]);

	// 中断后等 status 回 ready 再发送（避免 stop()+setTimeout(0) 竞态）
	useEffect(() => {
		if (status !== "ready" || pendingAfterStop === null) return;
		const text = pendingAfterStop;
		setPendingAfterStop(null);
		wasStoppedRef.current = false;
		autoStepCountRef.current = 0;
		setStepLimitPaused(false);
		ensureConnected().finally(() => {
			sendMessageWithSnapshotRef.current({ text });
		});
	}, [status, pendingAfterStop, ensureConnected]);

	// 自动保存：页面加载后从 IndexedDB 恢复工作簿
	const autoRestoreDoneRef = useRef(false);
	useEffect(() => {
		if (!settings.autoSave || !workbook || autoRestoreDoneRef.current) return;
		autoRestoreDoneRef.current = true;
		loadWorkbook().then((data) => {
			if (!data) return;
			setAutoSaveExists(true);
			workbook.suspendPaint();
			workbook.fromJSON(data);
			workbook.resumePaint();
		}).catch(() => {});
	}, [settings.autoSave, workbook]);

	// 自动恢复会话：页面加载后从 IndexedDB 恢复上次活跃会话
	const sessionRestoreDoneRef = useRef(false);
	useEffect(() => {
		if (!settings.autoRestoreSession || sessionRestoreDoneRef.current) return;
		sessionRestoreDoneRef.current = true;
		const activeId = getActiveSessionId();
		if (!activeId) return;
		switchSession(activeId).then((msgs) => {
			if (msgs.length > 0) {
				setMessages(msgs);
				prevUserMsgCountRef.current = msgs.filter((m) => m.role === "user").length;
			}
		}).catch(() => {});
	}, [settings.autoRestoreSession, switchSession, setMessages]);

	// 页面加载时检测是否存在已保存数据
	useEffect(() => {
		if (settings.autoSave) {
			hasAutoSaveData().then(setAutoSaveExists).catch(() => {});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// 保存快照后发送消息（ask_user 选项点击 / 继续执行 场景）
	// 每次渲染更新 ref，保证闭包拿到最新的 workbook 和 session.id
	const sendMessageWithSnapshotRef = useRef<(msg: { text: string }) => void>(() => {});
	sendMessageWithSnapshotRef.current = async (msg: { text: string }) => {
		if (workbook) {
			const snapshotId = `snap_${session.id}_${Date.now()}`;
			setSavingSnapshot(true);
			try {
				await snapshotStoreIdb.save(snapshotId, workbook);
				pendingSnapshotRef.current = snapshotId;
				// 自动保存开启时，同步将同一份快照写入 autosave-store
				if (settings.autoSave) {
					saveWorkbook(workbook).then(() => setAutoSaveExists(true)).catch(() => {});
				}
			} catch {
				// 快照保存失败，继续执行
			} finally {
				setSavingSnapshot(false);
			}
		}
		sendMessageRef.current(msg);
	};
	const stableSendMessageWithSnapshot = useCallback(
		(msg: { text: string }) => sendMessageWithSnapshotRef.current(msg),
		[],
	);

	// 步数上限暂停后，用户点击"继续执行"
	const handleContinue = useCallback(() => {
		autoStepCountRef.current = 0;
		setStepLimitPaused(false);
		stableSendMessageWithSnapshot({ text: "Continue" });
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleSubmit= useCallback(async (msg: { text: string }) => {
		if (!msg.text.trim() && pendingFiles.length === 0) return;
		// 上下文已满时拒绝发送
		if (contextFull) return;
		// AI 正在回复时，弹出中断确认对话框
		if (isGeneratingRef.current) {
			const text = msg.text.trim();
			setPendingAction({
				message: t("chat.interrupt.sendMessage"),
				action: () => {
					handleStop();
					setInput("");
					// 等 status 变为 ready 后再发送，避免 stop()+setTimeout(0) 竞态
					setPendingAfterStop(text);
				},
			});
			return;
		}
		// 重置中断标记、agent 自动循环步数计数器
		wasStoppedRef.current = false;
		autoStepCountRef.current = 0;
		setStepLimitPaused(false);
		// 确保 MCP 连接存活（节流 60s），等待完成再发送消息
		await ensureConnected();

		// 发送消息前保存 SpreadJS 快照（用 workbookRef.current 避免 useCallback 闭包拿到 null）
		const wb = workbookRef.current;
		if (wb) {
			const snapshotId = `snap_${session.id}_${Date.now()}`;
			pendingSnapshotRef.current = snapshotId;
			snapshotStoreIdb.save(snapshotId, wb).then(() => {
				// 自动保存开启时，同步将同一份快照写入 autosave-store
				if (settings.autoSave) {
					saveWorkbook(wb).then(() => setAutoSaveExists(true)).catch(() => {});
				}
			}).catch(() => {
				pendingSnapshotRef.current = null;
			});
		}

		let text = msg.text.trim();

		const imageParts = consumePendingImageParts();
		const fileTag = consumePendingFile(locale);

		if (imageParts.length > 0) {
			const imageTags = imageParts
				.map((part) => t("chat.marker.image", { name: part.filename ?? t("common.image") }))
				.join("\n");
			const defaultPrompt = imageParts.length === 1
				? t("chat.imagePrompt.single")
				: t("chat.imagePrompt.multiple", { count: imageParts.length });
			text = text || defaultPrompt;
			const prefix = [fileTag, imageTags].filter(Boolean).join("\n");
			if (prefix) text = `${prefix}\n${text}`;
			sendMessageRef.current({ text, files: imageParts } as Parameters<typeof sendMessageRef.current>[0]);
		} else if (fileTag) {
			text = text ? `${fileTag}\n${text}` : `${fileTag}\n${t("chat.filePrompt")}`;
			sendMessageRef.current({ text });
		} else {
			sendMessageRef.current({ text });
		}

		setInput("");
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pendingFiles, consumePendingFile, consumePendingImageParts, contextFull, locale, t]);

	const doNewSession = useCallback(() => {
		handleStop();
		newSession();
		setMessages([]);
		clearError();
		setInput("");
		clearAttachments();
		setShowHistory(false);
		setShowSettings(false);
		hasNotifiedNewSession.current = false;
		prevUserMsgCountRef.current = 0;
		pendingSnapshotRef.current = null;
		autoStepCountRef.current = 0;
		setStepLimitPaused(false);
		setHistoryRefresh((n) => n + 1);
	}, [handleStop, newSession, setMessages, clearError, clearAttachments]);

	const handleNewSession = useCallback(() => {
		if (isGeneratingRef.current) {
			setPendingAction({ message: t("chat.interrupt.newChat"), action: doNewSession });
		} else {
			doNewSession();
		}
	}, [doNewSession, t]);

	const handleSelectSession = useCallback(async (sessionId: string) => {
		if (sessionId === session.id) {
			setShowHistory(false);
			return;
		}
		const doSwitch = async () => {
			handleStop();
			const msgs = await switchSession(sessionId);
			setMessages(msgs);
			clearError();
			setInput("");
			clearAttachments();
			prevUserMsgCountRef.current = msgs.filter((m) => m.role === "user").length;
			pendingSnapshotRef.current = null;
			autoStepCountRef.current = 0;
			setStepLimitPaused(false);
			setShowHistory(false);
		};
		if (isGeneratingRef.current) {
			setPendingAction({ message: t("chat.interrupt.switchChat"), action: doSwitch });
		} else {
			await doSwitch();
		}
	}, [session.id, handleStop, switchSession, setMessages, clearError, clearAttachments, t]);

	const handleEmptySend = useCallback((text: string) => {
		sendMessageWithSnapshotRef.current({ text });
	}, []);

	const handleFork = useCallback(async (messageId: string, withRestore: boolean) => {
		const doFork = async () => {
			handleStop();
			const { session: forked, inputText } = await forkSession(messageId, messages);
			setMessages(forked.messages);
			clearError();
			setInput(inputText);
			clearAttachments();
			prevUserMsgCountRef.current = forked.messages.filter((m) => m.role === "user").length;
			pendingSnapshotRef.current = null;
			hasNotifiedNewSession.current = forked.messages.length > 0;
			autoStepCountRef.current = 0;
			setStepLimitPaused(false);
			setHistoryRefresh((n) => n + 1);

			if (withRestore && workbook) {
				const snapshotId = getSnapshotId(messageId);
				if (snapshotId) {
					await snapshotStoreIdb.restore(snapshotId, workbook);
				}
			}
		};
		// 用 ref 读取最新值，避免 React 批量更新延迟导致闭包中 isGenerating 过期
		if (isGeneratingRef.current) {
			setPendingAction({ message: t("chat.interrupt.duplicateChat"), action: doFork });
		} else {
			await doFork();
		}
	}, [handleStop, forkSession, messages, setMessages, clearError, clearAttachments, workbook, getSnapshotId, t]);

	// 自动保存设置更新处理：关闭时清除已保存数据
	const handleUpdateSettings = useCallback((patch: Partial<typeof settings>) => {
		updateSettings(patch);
		if (patch.autoSave === false) {
			clearWorkbook().then(() => setAutoSaveExists(false)).catch(() => {});
		}
	}, [updateSettings]);

	const handleClearAutoSave = useCallback(async () => {
		await clearWorkbook();
		setAutoSaveExists(false);
	}, []);


	// 导出指定会话
	const handleExportSession = useCallback(async (sessionId: string) => {
		try {
			const target = await getSession(sessionId);
			if (!target) throw new Error("Session not found");
			downloadSessionFile(target);
		} catch (e) {
			console.error("[exportSession] Export failed", e);
		}
	}, []);

	// 导入会话文件
	const handleImportSession = useCallback(async (file: File) => {
		try {
			const text = await file.text();
			const parsed = parseSessionImportFile(text, locale);
			const imported = importFileToSession(parsed);
			await saveSession(imported);
			const msgs = await switchSession(imported.id);
			setMessages(msgs);
			clearError();
			setInput("");
			clearAttachments();
			prevUserMsgCountRef.current = msgs.filter((m) => m.role === "user").length;
			pendingSnapshotRef.current = null;
			hasNotifiedNewSession.current = msgs.length > 0;
			autoStepCountRef.current = 0;
			setStepLimitPaused(false);
			setHistoryRefresh((n) => n + 1);
			setShowHistory(false);
		} catch (e) {
			const msg = e instanceof Error ? e.message : t("sessionHistory.importFailed");
			console.error("[importSession] Import failed", e);
			throw e instanceof Error ? e : new Error(msg);
		}
	}, [switchSession, setMessages, clearError, clearAttachments, locale, t]);

	// 导出诊断包（当前会话 + 服务端日志）
	const handleExportDiagnostic = useCallback(async () => {
		let serverLogs: ErrorLogEntry[] = [];
		try {
			const date = new Date().toISOString().slice(0, 10);
			const res = await fetch(`/api/diagnostic-logs?date=${date}`, {
				headers: {
					"x-spreadjs-locale": locale,
				},
			});
			if (res.ok) {
				const data = await res.json();
				serverLogs = data.logs ?? [];
			}
		} catch {
			// 日志拉取失败不阻断导出
		}
		downloadDiagnosticFile(
			session,
			serverLogs,
			lastAutoSendDecisionRef.current,
			autoSendDecisionHistoryRef.current,
			chatRequestHistoryRef.current,
		);
	}, [locale, session]);
	// 正在回复的消息对应的快照 ID（最后一条用户消息的快照）
	const currentReplySnapshotId = useMemo(() => {
		const userMessages = messages.filter((m) => m.role === "user");
		if (userMessages.length === 0) return null;
		const lastUserMsg = userMessages[userMessages.length - 1];
		return getSnapshotId(lastUserMsg.id) ?? null;
	}, [messages, getSnapshotId]);

	const handleStopAndRestore = useCallback(() => {
		handleStop();
		if (!workbook || !currentReplySnapshotId) return;
		snapshotStoreIdb.restore(currentReplySnapshotId, workbook).catch(() => {});
	}, [handleStop, workbook, currentReplySnapshotId]);

	return (
		<div className="flex h-full flex-col bg-background relative">
			{/* 头部 */}
			<div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-2.5">
				<div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
					<SparklesIcon className="size-3.5 text-primary" />
				</div>
				<div className="flex flex-col flex-1 min-w-0">
					<h2 className="text-sm font-semibold leading-tight truncate">
						{messages.length > 0 ? session.title : t("empty.title")}
					</h2>
					<span className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
						{headerStatus.icon}
						<span className="truncate">{headerStatus.text}</span>
					</span>
				</div>
				{/* 右上角按钮组：新建 | 历史 | MCP */}
				<div className="flex items-center gap-1 flex-shrink-0">
					<button
						type="button"
						onClick={handleNewSession}
						className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						title={t("chat.new")}
					>
						<PlusIcon className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => { setShowHistory((v) => !v); setShowSettings(false); }}
						className={`inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground ${
							showHistory ? "bg-primary/10 text-primary" : "text-muted-foreground"
						}`}
						title={t("chat.history")}
					>
						<HistoryIcon className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => { setShowSettings((v) => !v); setShowHistory(false); }}
						className={`inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground ${
							showSettings ? "bg-primary/10 text-primary" : "text-muted-foreground"
						}`}
						title={t("chat.settings")}
					>
						<Settings2Icon className="size-4" />
					</button>
				</div>
			</div>

			{/* 设置面板 */}
			<div className={`absolute inset-x-0 top-[52px] bottom-0 z-20 border-t border-border/60 bg-background shadow-lg overflow-y-auto chat-scrollbar ${showSettings ? "" : "hidden"}`}>
				<SettingsPanel
					settings={settings}
					onUpdateSettings={handleUpdateSettings}
					chatPanelWidth={chatPanelWidth}
					onChatPanelWidthChange={onChatPanelWidthChange}
					onClearAutoSave={handleClearAutoSave}
					autoSaveExists={autoSaveExists}
					mcpServers={mcpServers}
					mcpLoading={mcpLoading}
					mcpError={mcpError}
					mcpConfigJson={mcpConfigJson}
					onMcpSaveAndConnect={saveAndConnectMcp}
					onMcpToggleServer={toggleMcpServer}
					onMcpDisconnectAll={disconnectAllMcp}
					onMcpAuthorize={authorizeMcpServer}
				/>
			</div>

			{/* 会话历史面板（始终挂载，CSS 控制显隐，避免重复加载） */}
			<div className={`absolute inset-x-0 top-[52px] bottom-0 z-20 border-t border-border/60 bg-background shadow-lg ${showHistory ? "" : "hidden"}`}>
				<SessionHistory
					currentSessionId={session.id}
					onSelectSession={handleSelectSession}
					onNewSession={handleNewSession}
					refreshTrigger={historyRefresh}
					onExportSession={handleExportSession}
					onImportSession={handleImportSession}
					onExportDiagnostic={handleExportDiagnostic}
				/>
			</div>

			{/* 消息区 */}
			<Conversation className="chat-scrollbar flex-1">
				<ConversationContent className="gap-5 px-4 py-4">
					{messages.length === 0 ? (
						<EmptyState onSend={handleEmptySend} isReady={isReady} />
					) : (
						messages.map((message, msgIdx) => {
							let nextUserText: string | undefined;
							if (message.role === "assistant") {
								const next = messages[msgIdx + 1];
								if (next?.role === "user") {
									const textPart = next.parts.find((p) => p.type === "text");
									nextUserText = textPart?.text;
								}
							}
							return (
								<MessageItem
									key={message.id}
									message={message}
									msgId={message.id}
									taskRenderDecision={taskRenderDecision}
									isLast={msgIdx === messages.length - 1}
									status={status}
									sendMessage={stableSendMessageWithSnapshot}
									hasSnapshot={!!getSnapshotId(message.id)}
									onFork={handleFork}
									nextUserText={nextUserText}
								/>
							);
						})
					)}
					{(() => { const lastMsg = messages[messages.length - 1]; return lastMsg?.role === "user" && !!lastMsg?.interrupted; })() && (<Message from="assistant"><MessageContent><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50"><span>{t("chat.sessionInterrupted")}</span></div></MessageContent></Message>)}
					{status === "error" && error && (
						<Message from="assistant">
							<MessageContent>
								<ErrorMessage error={error} onRetry={() => { clearError(); sendMessage(); }} />
							</MessageContent>
						</Message>
					)}
					{(status === "submitted" || status === "streaming") && (
						messages.length === 0 ||
						messages[messages.length - 1].role === "user"
					) && (
						<Message from="assistant">
							<MessageContent>
								{retryStatus ? (
									<div className="flex flex-col gap-1.5">
										<div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
											<LoaderIcon className="size-3.5 animate-spin shrink-0" />
											<span>{t("chat.retrying", { attempt: retryStatus.attempt, maxRetries: retryStatus.maxRetries })}</span>
										</div>
										<p className="text-[11px] text-muted-foreground/70 leading-relaxed pl-5 truncate max-w-[280px]" title={retryStatus.reason}>
											{retryStatus.reason.length > 60 ? retryStatus.reason.slice(0, 60) + "…" : retryStatus.reason}
										</p>
									</div>
								) : (
									<ThinkingIndicator />
								)}
							</MessageContent>
						</Message>
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			{/* 快照保存提示 */}
			{savingSnapshot && (
				<div className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-2">
					<LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
					<span className="text-xs text-muted-foreground">{t("chat.savingSnapshot")}</span>
				</div>
			)}

			{/* 步数上限暂停提示 */}
			{stepLimitPaused && !isGenerating && (
				<div className="flex items-center justify-center gap-2 border-t border-border/60 bg-muted/30 px-4 py-2">
					<span className="text-xs text-muted-foreground">{t("chat.autoRunPaused", { steps: settings.maxAutoSteps })}</span>
					<button
						type="button"
						onClick={handleContinue}
						className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						<PlayIcon className="size-3" />
						{t("common.continue")}
					</button>
					<button
						type="button"
						onClick={() => setStepLimitPaused(false)}
						className="ml-auto inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label={t("common.dismiss")}
					>
						<XIcon className="size-3.5" />
					</button>
				</div>
			)}

			{/* 上下文接近上限警告 */}
			{contextNearLimit && !isGenerating && (
				<div className="flex items-center gap-2 border-t border-amber-200/60 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-2">
					<AlertCircleIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
					<span className="text-xs text-amber-700 dark:text-amber-400 flex-1">
						{t("chat.contextLow", { percent: contextUsage.percent })}
					</span>
					<button
						type="button"
						onClick={handleNewSession}
						className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-600"
					>
						<PlusIcon className="size-3" />
						{t("chat.new")}
					</button>
				</div>
			)}

			{/* 上下文已达上限，禁止继续对话 */}
			{contextFull && !isGenerating && (
				<div className="flex items-center gap-2 border-t border-destructive/30 bg-destructive/8 px-4 py-2">
					<AlertCircleIcon className="size-4 shrink-0 text-destructive" />
					<span className="text-xs text-destructive flex-1">
						{t("chat.contextFull", { percent: contextUsage.percent })}
					</span>
					<button
						type="button"
						onClick={handleNewSession}
						className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
					>
						<PlusIcon className="size-3" />
						{t("chat.new")}
					</button>
				</div>
			)}

			{/* 输入区 — 服务不可用时被 banner 覆盖 */}
			{!serviceStatus.loading && !serviceAvailable ? (
				<ServiceUnavailableBanner missing={serviceStatus.missing} />
			) : (
			<div
				className={`relative border-t border-border/60 px-3 pb-3 pt-2.5 ${isDragging ? "ring-2 ring-inset ring-primary/30 bg-primary/5" : ""}`}
				onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
				onDragLeave={() => setIsDragging(false)}
				onDrop={(e) => { setIsDragging(false); handleFileDrop(e); }}
			>
				<input
					ref={fileInputRef}
					type="file"
					accept={visionAvailable ? ".xlsx,.csv,.sjs,.ssjson,.json,.png,.jpg,.jpeg,.gif,.webp" : ".xlsx,.csv,.sjs,.ssjson,.json"}
					multiple
					className="hidden"
					onChange={handleFileSelect}
				/>
				<DestructiveConfirmInline dialog={confirmDialog} onChoice={onConfirmChoice} />
				<PromptInput onSubmit={handleSubmit}>
					{(sheetInfo || pendingFiles.length > 0) && (
						<div className="flex w-full items-start gap-1 px-3 pt-2 flex-wrap overflow-y-auto chat-scrollbar" style={{ maxHeight: "6rem" }}>
							{sheetInfo && (() => {
								const fullText = sheetInfo.sheetName + (sheetInfo.selection ? `!${sheetInfo.selection}` : "");
								return (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground select-none max-w-[280px] cursor-default">
													<MousePointerIcon className="size-3 shrink-0" />
													<span className="truncate">{fullText}</span>
												</span>
											</TooltipTrigger>
											<TooltipContent side="top" className="max-w-[400px] break-all">
												{fullText}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								);
							})()}
							{pendingFiles.map((file, index) => {
								const badge = (
									<span key={`${file.name}-${index}`} className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
										{file.fileType === "image" ? <ImageIcon className="size-3" /> : <FileIcon className="size-3" />}
										<span className="max-w-[160px] truncate">{file.name}</span>
										<button
											type="button"
											className="ml-0.5 rounded-sm p-0.5 transition-colors hover:bg-primary/10"
											onClick={() => removePendingFile(index)}
										>
											<XIcon className="size-3" />
										</button>
									</span>
								);
								if (file.fileType === "image" && file.dataUrl) {
									return (
										<HoverCard key={`${file.name}-${index}`} openDelay={200} closeDelay={100}>
											<HoverCardTrigger asChild>{badge}</HoverCardTrigger>
											<HoverCardContent className="w-auto max-w-xs p-2" side="top">
												<div className="relative h-48 w-72 max-w-[80vw]">
													<Image
														src={file.dataUrl}
														alt={file.name}
														fill
														unoptimized
														sizes="288px"
														className="rounded-md object-contain"
													/>
												</div>
											</HoverCardContent>
										</HoverCard>
									);
								}
								return badge;
							})}
						</div>
					)}
					<PromptInputTextarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onPaste={handlePaste}
						placeholder={contextFull ? t("chat.placeholder.contextFull") : isReady ? t("chat.placeholder.ready") : t("chat.placeholder.loading")}
						disabled={!isReady || contextFull}
					/>
					<PromptInputFooter>
						<div className="flex items-center gap-1.5">
							<button
								type="button"
								className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
								disabled={!isReady}
								onClick={() => fileInputRef.current?.click()}
								title={visionAvailable ? t("chat.addFile") : t("chat.addFileVisionHint")}
							>
							<PaperclipIcon className="size-4" />
							</button>
						</div>
						<div className="flex items-center gap-1.5">
							<span className="text-[11px] leading-tight text-right text-muted-foreground/60 whitespace-pre-line">
								{isGenerating ? t("chat.shortcuts.stop") : `${t("chat.shortcuts.send")}\n${t("chat.shortcuts.newLine")}`}
							</span>
							<ContextUsageIndicator usage={contextUsage} visible={settings.showContextUsage} />
							<div className="flex items-center">
								<PromptInputSubmit
									status={status}
									onStop={handleStop}
									disabled={!isGenerating && (!isReady || (!input.trim() && pendingFiles.length === 0) || contextFull)}
									className={isGenerating && currentReplySnapshotId ? "rounded-r-none border-r-0" : ""}
								/>
								{isGenerating && currentReplySnapshotId && (
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<button
												type="button"
												className="inline-flex h-8 w-4 items-center justify-center rounded-r-md rounded-l-none bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
											>
												<ChevronDownIcon className="size-3" />
											</button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" sideOffset={4}>
											<DropdownMenuItem onClick={handleStopAndRestore}>
												<RotateCcwIcon className="size-4" />
												<span>{t("chat.stopRestore")}</span>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</div>
						</div>
					</PromptInputFooter>
				</PromptInput>
			</div>
			)}

			{/* 中断确认对话框 */}
			<Dialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
				<DialogContent showCloseButton={false} className="max-w-sm">
					<DialogHeader>
						<DialogTitle>{t("chat.interrupt.title")}</DialogTitle>
						<DialogDescription>{pendingAction?.message}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setPendingAction(null)}>{t("common.cancel")}</Button>
						<Button variant="destructive" onClick={() => { pendingAction?.action(); setPendingAction(null); }}>{t("chat.interrupt.confirm")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

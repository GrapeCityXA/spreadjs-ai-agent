"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { AppUIMessage } from "@/lib/agent/ui-message";
import {
	type Session,
	generateSessionId,
	saveSession,
	getSession,
} from "@/lib/agent/session-store";
import { taskStore } from "@/lib/agent/task-store";
import { normalizeLocale, type AppLocale } from "@/lib/i18n";

// ============================================================================
// useSession — 管理当前会话状态，自动持久化到 IndexedDB
// ============================================================================

const ACTIVE_SESSION_KEY = "spreadjs-agent-active-session";

export function getActiveSessionId(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(ACTIVE_SESSION_KEY);
}

function setActiveSessionId(id: string) {
	localStorage.setItem(ACTIVE_SESSION_KEY, id);
}

function clearActiveSessionId() {
	localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function getNewSessionTitle(locale: AppLocale): string {
	const resolved = normalizeLocale(locale);
	if (resolved === "zh-CN") return "新会话";
	return "New Chat";
}

function getBranchSuffix(locale: AppLocale): string {
	const resolved = normalizeLocale(locale);
	if (resolved === "zh-CN") return "（分支）";
	return " (Branch)";
}

function createNewSession(locale: AppLocale): Session {
	return {
		id: generateSessionId(),
		title: getNewSessionTitle(locale),
		messages: [],
		snapshotMap: {},
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
}

async function generateTitle(firstMessage: string, locale: AppLocale): Promise<string> {
	const fallback = getNewSessionTitle(locale);
	try {
		const res = await fetch("/api/title", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ firstMessage, locale }),
		});
		if (!res.ok) return fallback;
		const { title } = await res.json();
		return title || fallback;
	} catch {
		return fallback;
	}
}

interface UseSessionReturn {
	session: Session;
	/** 保存消息到当前会话（应在每次 messages 变化后调用） */
	syncMessages: (messages: AppUIMessage[]) => void;
	/** 立即刷新：取消防抖，将最新 messages 写入 DB（AI 回复结束时调用） */
	flushMessages: () => void;
	/** 切换到指定会话 */
	switchSession: (sessionId: string) => Promise<AppUIMessage[]>;
	/** 新建会话，返回新会话 */
	newSession: () => Session;
	/** 手动触发标题刷新（外部监听 session.title 变化） */
	onTitleChange: (cb: (title: string) => void) => () => void;
	/** 关联 messageId 和 snapshotId */
	linkSnapshot: (messageId: string, snapshotId: string) => void;
	/** 获取 messageId 对应的 snapshotId */
	getSnapshotId: (messageId: string) => string | undefined;
	/** Fork 会话：复制 messageId 之前的所有消息到新会话，返回新会话和被 fork 消息的文本 */
	forkSession: (messageId: string, messages: AppUIMessage[]) => Promise<{ session: Session; inputText: string }>;
	/** 保存本次 AI 回复的真实 token 用量到当前会话（不更新 updatedAt） */
	saveTokenUsage: (usage: { promptTokens: number; contextWindow: number }) => void;
}

export function useSession(locale: AppLocale = "en"): UseSessionReturn {
	const localeRef = useRef<AppLocale>(locale);
	const [session, setSession] = useState<Session>(() => createNewSession(locale));
	const titleCallbacksRef = useRef<Set<(title: string) => void>>(new Set());
	const titleGeneratedRef = useRef(false);

	useEffect(() => {
		localeRef.current = locale;
	}, [locale]);

	// ref 持有最新 messages，防抖定时器读取时始终拿到最新值
	const latestMessagesRef = useRef<AppUIMessage[]>([]);
	const dbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// switchSession 后跳过一次 syncMessages 的 updatedAt 更新
	const skipTimestampRef = useRef(false);
	// session 快照 ref，供 DB 写入读取而不触发 re-render
	const sessionRef = useRef(session);
	useEffect(() => {
		sessionRef.current = session;
	}, [session]);

	// 组件卸载时清理防抖定时器
	useEffect(() => () => { if (dbTimerRef.current) clearTimeout(dbTimerRef.current); }, []);

	const syncMessages = useCallback(
		(messages: AppUIMessage[]) => {
			// 始终保存最新 messages 到 ref（零成本，不触发 render）
			latestMessagesRef.current = messages;

			// 防抖：2s 内只触发一次 setSession + DB 写入（流式传输期间的安全网）
			if (dbTimerRef.current) clearTimeout(dbTimerRef.current);
			const shouldSkipTimestamp = skipTimestampRef.current;
			skipTimestampRef.current = false;
			dbTimerRef.current = setTimeout(() => {
				const msgs = latestMessagesRef.current;
				setSession((prev) => {
					// 切换会话时仅同步消息，不更新 updatedAt，避免仅选中就置顶
					const updated = {
						...prev,
						messages: msgs,
						updatedAt: shouldSkipTimestamp ? prev.updatedAt : Date.now(),
					};
					saveSession(updated).catch(() => {});
					setActiveSessionId(prev.id);
					return updated;
				});
			}, 2000);

			// 第一条用户消息出现时，异步生成标题（首次即刻触发，不受防抖影响）
			if (!titleGeneratedRef.current && messages.length > 0) {
				const firstUser = messages.find((m) => m.role === "user");
				if (firstUser) {
					const text = firstUser.parts
						.filter((p) => p.type === "text")
						.map((p) => (p as { type: "text"; text: string }).text)
						.join(" ")
						.trim();
					if (text) {
						titleGeneratedRef.current = true;
						// 捕获发起请求时的会话 ID，防止 API 返回时写入错误的会话
						const targetSessionId = sessionRef.current.id;
						generateTitle(text, localeRef.current).then((title) => {
							if (sessionRef.current.id !== targetSessionId) {
								// 会话已切换：将标题写入原始会话的 DB，不更新当前会话状态
								getSession(targetSessionId).then((original) => {
									if (original) {
										saveSession({ ...original, title, updatedAt: Date.now() }).catch(() => {});
										titleCallbacksRef.current.forEach((cb) => cb(title));
									}
								});
								return;
							}
							setSession((prev) => {
								const updated = { ...prev, title, updatedAt: Date.now() };
								saveSession(updated).catch(() => {});
								titleCallbacksRef.current.forEach((cb) => cb(title));
								return updated;
							});
						});
					}
				}
			}
		},
		[],
	);

	const flushMessages = useCallback(() => {
		// 取消挂起的防抖定时器
		if (dbTimerRef.current) {
			clearTimeout(dbTimerRef.current);
			dbTimerRef.current = null;
		}
		const msgs = latestMessagesRef.current;
		if (msgs.length === 0) return;
		const plans = taskStore.exportPlans();
		setSession((prev) => {
			const updated = {
				...prev,
				messages: msgs,
				taskPlans: plans.length > 0 ? plans : undefined,
				updatedAt: Date.now(),
			};
			saveSession(updated).catch(() => {});
			setActiveSessionId(prev.id);
			return updated;
		});
	}, []);

	const switchSession = useCallback(async (sessionId: string): Promise<AppUIMessage[]> => {
		// 取消挂起的防抖定时器，防止旧会话的消息写入新会话
		if (dbTimerRef.current) {
			clearTimeout(dbTimerRef.current);
			dbTimerRef.current = null;
		}

		// 保存当前会话的任务计划
		const plans = taskStore.exportPlans();
		if (plans.length > 0) {
			setSession((prev) => {
				const updated = { ...prev, taskPlans: plans };
				saveSession(updated).catch(() => {});
				return updated;
			});
		}

		const found = await getSession(sessionId);
		if (!found) return [];
		titleGeneratedRef.current = true;
		skipTimestampRef.current = true;
		latestMessagesRef.current = found.messages;
		setSession(found);
		setActiveSessionId(found.id);

		// 恢复目标会话的任务计划
		if (found.taskPlans && found.taskPlans.length > 0) {
			taskStore.importPlans(found.taskPlans);
		} else {
			taskStore.reset();
		}

		return found.messages;
	}, []);

	const newSession = useCallback((): Session => {
		// 取消挂起的防抖定时器，防止旧会话的消息写入新会话
		if (dbTimerRef.current) {
			clearTimeout(dbTimerRef.current);
			dbTimerRef.current = null;
		}

		// 保存当前会话的任务计划
		const plans = taskStore.exportPlans();
		if (plans.length > 0) {
			setSession((prev) => {
				const updated = { ...prev, taskPlans: plans };
				saveSession(updated).catch(() => {});
				return updated;
			});
		}

		taskStore.reset();
		const s = createNewSession(localeRef.current);
		titleGeneratedRef.current = false;
		latestMessagesRef.current = [];
		setSession(s);
		clearActiveSessionId();
		return s;
	}, []);

	const onTitleChange = useCallback((cb: (title: string) => void) => {
		titleCallbacksRef.current.add(cb);
		return () => { titleCallbacksRef.current.delete(cb); };
	}, []);

	const linkSnapshot = useCallback((messageId: string, snapshotId: string) => {
		setSession((prev) => {
			const map = { ...prev.snapshotMap, [messageId]: snapshotId };
			const updated = { ...prev, snapshotMap: map, updatedAt: Date.now() };
			saveSession(updated).catch(() => {});
			return updated;
		});
	}, []);

	const getSnapshotId = useCallback((messageId: string): string | undefined => {
		return sessionRef.current.snapshotMap?.[messageId];
	}, []);

	const saveTokenUsage = useCallback((usage: { promptTokens: number; contextWindow: number }) => {
		setSession((prev) => {
			// 仅更新 tokenUsage，保留 updatedAt 不变（避免无谓置顶）
			const updated = { ...prev, tokenUsage: usage };
			saveSession(updated).catch(() => {});
			return updated;
		});
	}, []);

	/** Fork 会话：复制 messageId 之前的所有消息到新会话，返回新会话和被 fork 消息的文本 */
	const forkSession = useCallback(async (messageId: string, messages: AppUIMessage[]): Promise<{ session: Session; inputText: string }> => {
		// 取消挂起的防抖定时器，防止旧会话的消息写入 fork 会话
		if (dbTimerRef.current) {
			clearTimeout(dbTimerRef.current);
			dbTimerRef.current = null;
		}

		const msgIdx = messages.findIndex((m) => m.id === messageId);
		// 不含当前消息，还原到"该消息尚未发出"的状态
		const forkedMessages = msgIdx <= 0 ? [] : messages.slice(0, msgIdx);

		// 提取被 fork 消息的文本，用于回填输入框
		const targetMsg = msgIdx === -1 ? undefined : messages[msgIdx];
		const inputText = targetMsg?.parts
			.filter((p) => p.type === "text")
			.map((p) => (p as { type: "text"; text: string }).text)
			.join("\n")
			.trim() ?? "";

		// 复制相关的 snapshotMap 条目
		const srcMap = sessionRef.current.snapshotMap ?? {};
		const forkedSnapshotMap: Record<string, string> = {};
		const forkedMsgIds = new Set(forkedMessages.map((m) => m.id));
		for (const [mid, sid] of Object.entries(srcMap)) {
			if (forkedMsgIds.has(mid)) forkedSnapshotMap[mid] = sid;
		}

		const forked: Session = {
			id: generateSessionId(),
			title: `${sessionRef.current.title}${getBranchSuffix(localeRef.current)}`,
			messages: forkedMessages,
			snapshotMap: forkedSnapshotMap,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		await saveSession(forked);
		titleGeneratedRef.current = forkedMessages.length > 0;
		latestMessagesRef.current = forkedMessages;
		taskStore.reset();
		setSession(forked);
		return { session: forked, inputText };
	}, []);

	// 注意：不再在初次挂载时持久化空会话。
	// 会话仅在收到第一条消息（syncMessages 调用）时才写入 DB，
	// 避免每次刷新都产生一个空的"新会话"记录。

	return { session, syncMessages, flushMessages, switchSession, newSession, onTitleChange, linkSnapshot, getSnapshotId, forkSession, saveTokenUsage };
}

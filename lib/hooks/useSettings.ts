"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { normalizeLocale, type AppLocale } from "@/lib/i18n";

const STORAGE_KEY = "spreadjs-agent-settings";

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
	maxAutoSteps: number;
	theme: ThemeMode;
	locale: AppLocale;
	showContextUsage: boolean;
	autoSave: boolean;
	autoRestoreSession: boolean;
	/** 全局跳过破坏性操作确认弹窗（覆盖数据、删除行列等） */
	allowAllDestructive: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
	maxAutoSteps: 25,
	theme: "system",
	locale: "zh-CN",
	showContextUsage: true,
	autoSave: false,
	autoRestoreSession: false,
	allowAllDestructive: false,
};

function loadSettings(): AppSettings {
	if (typeof window === "undefined") return DEFAULT_SETTINGS;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_SETTINGS;
		const parsed = JSON.parse(raw) as Partial<AppSettings>;
		return {
			...DEFAULT_SETTINGS,
			...parsed,
			locale: normalizeLocale(parsed.locale),
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
}

function saveSettings(settings: AppSettings) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

const listeners = new Set<() => void>();

// 模块级缓存：useSyncExternalStore 要求 getSnapshot 返回引用稳定的值
// 每次调用都返回新对象会导致 React 无限重渲染
let cachedSettings: AppSettings = typeof window !== "undefined" ? loadSettings() : DEFAULT_SETTINGS;

function invalidateCache() {
	cachedSettings = loadSettings();
}

function emitStoreChange() {
	invalidateCache();
	for (const listener of listeners) {
		listener();
	}
}

function subscribe(onStoreChange: () => void): () => void {
	listeners.add(onStoreChange);

	if (typeof window === "undefined") {
		return () => listeners.delete(onStoreChange);
	}

	const onStorage = (event: StorageEvent) => {
		if (event.key === STORAGE_KEY) {
			invalidateCache();
			onStoreChange();
		}
	};
	window.addEventListener("storage", onStorage);

	return () => {
		listeners.delete(onStoreChange);
		window.removeEventListener("storage", onStorage);
	};
}

function getSnapshot(): AppSettings {
	return cachedSettings;
}

function getServerSnapshot(): AppSettings {
	return DEFAULT_SETTINGS;
}

export function useSettings() {
	const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const updateSettings = useCallback((patch: Partial<AppSettings>) => {
		const next = { ...loadSettings(), ...patch };
		next.locale = normalizeLocale(next.locale);
		saveSettings(next);
		emitStoreChange();
	}, []);

	return useMemo(
		() => ({ settings, updateSettings }),
		[settings, updateSettings],
	);
}

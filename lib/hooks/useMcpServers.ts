"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createTranslator, type AppLocale } from "@/lib/i18n";
import type { McpServerStatus } from "@/lib/mcp/types";

const STORAGE_KEY = "spreadjs-agent-mcp-config";
const VERSION_KEY = "spreadjs-agent-mcp-config-version";
const CLIENT_ID_KEY = "spreadjs-agent-mcp-client-id";
const ENSURE_THROTTLE_MS = 5_000;
const OAUTH_CHANNEL = "mcp-oauth";

function getMcpClientId(): string {
	const existing = localStorage.getItem(CLIENT_ID_KEY);
	if (existing) return existing;
	const id = crypto.randomUUID();
	localStorage.setItem(CLIENT_ID_KEY, id);
	return id;
}

export function getStoredMcpClientId(): string | undefined {
	if (typeof window === "undefined") return undefined;
	return getMcpClientId();
}

/** 内置 spreadjs-mcp server 配置，随 BUILTIN_CONFIG_VERSION 版本化管理 */
const BUILTIN_CONFIG_VERSION = 4;

function buildBuiltinSpreadjsServer(enabled = false) {
	return {
		url: "https://developer.mescius.com/mcp/spreadjs",
		enabled,
	};
}

const BUILTIN_SPREADJS_SERVER = {
	...buildBuiltinSpreadjsServer(),
};

/** 默认 MCP 配置（含内置 spreadjs-mcp） */
export const DEFAULT_MCP_CONFIG = JSON.stringify({
	mcpServers: {
		"spreadjs-mcp": BUILTIN_SPREADJS_SERVER,
	},
}, null, "\t");

/**
 * 启动时迁移本地配置：若内置版本号高于本地记录，
 * 则用最新内置配置覆盖 spreadjs-mcp，保留用户自定义的其他 server。
 */
function migrateLocalConfig(): string {
	const localVersion = parseInt(localStorage.getItem(VERSION_KEY) ?? "0", 10);
	const raw = localStorage.getItem(STORAGE_KEY);

	if (!raw) {
		localStorage.setItem(STORAGE_KEY, DEFAULT_MCP_CONFIG);
		localStorage.setItem(VERSION_KEY, String(BUILTIN_CONFIG_VERSION));
		return DEFAULT_MCP_CONFIG;
	}

	if (localVersion >= BUILTIN_CONFIG_VERSION) {
		return raw;
	}

	// 版本落后：覆盖内置 server，保留用户自定义 server
	try {
		const config = JSON.parse(raw);
		config.mcpServers = config.mcpServers ?? {};
		const current = config.mcpServers["spreadjs-mcp"];
		const enabled = current?.enabled !== false;
		config.mcpServers["spreadjs-mcp"] = buildBuiltinSpreadjsServer(enabled);
		const migrated = JSON.stringify(config, null, "\t");
		localStorage.setItem(STORAGE_KEY, migrated);
		localStorage.setItem(VERSION_KEY, String(BUILTIN_CONFIG_VERSION));
		return migrated;
	} catch {
		// 本地配置损坏，重置
		localStorage.setItem(STORAGE_KEY, DEFAULT_MCP_CONFIG);
		localStorage.setItem(VERSION_KEY, String(BUILTIN_CONFIG_VERSION));
		return DEFAULT_MCP_CONFIG;
	}
}

interface McpServersState {
	servers: McpServerStatus[];
	loading: boolean;
	error: string | null;
	lastCheck: number;
}

export function useMcpServers(locale: AppLocale = "en") {
	const t = useMemo(() => createTranslator(locale), [locale]);
	const [state, setState] = useState<McpServersState>({
		servers: [],
		loading: false,
		error: null,
		lastCheck: 0,
	});
	const lastEnsure = useRef(0);
	const clientIdRef = useRef<string | null>(null);

	const getClientId = useCallback(() => {
		clientIdRef.current ??= getMcpClientId();
		return clientIdRef.current;
	}, []);

	const applyConfig = useCallback(async (configJson: string): Promise<McpServerStatus[]> => {
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			const res = await fetch("/api/mcp/servers", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-spreadjs-locale": locale,
					"x-mcp-client-id": getClientId(),
				},
				body: configJson,
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err?.error ?? t("mcp.httpStatus", { status: res.status }));
			}
			const data = await res.json();
			setState({
				servers: data.servers,
				loading: false,
				error: null,
				lastCheck: Date.now(),
			});
			return data.servers;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			setState((s) => ({ ...s, loading: false, error: msg }));
			throw e;
		}
	}, [getClientId, locale, t]);

	const refreshStatus = useCallback(async () => {
		try {
			const res = await fetch("/api/mcp/servers", {
				headers: {
					"x-spreadjs-locale": locale,
					"x-mcp-client-id": getClientId(),
				},
			});
			const data = await res.json();
			setState((s) => ({
				...s,
				servers: data.servers,
				lastCheck: Date.now(),
			}));
		} catch { /* ignore */ }
	}, [getClientId, locale]);

	useEffect(() => {
		// 迁移本地配置（自动覆盖过期的内置 server 地址）
		const config = migrateLocalConfig();
		applyConfig(config).catch(() => {});
	}, [applyConfig]);

	// 监听 OAuth 弹窗回调
	useEffect(() => {
		const bc = new BroadcastChannel(OAUTH_CHANNEL);
		bc.onmessage = (ev) => {
			const { success, error: oauthError } = ev.data ?? {};
			if (success) {
				refreshStatus();
			} else if (oauthError) {
				setState((s) => ({
					...s,
					error: t("mcp.oauthFailed", { error: oauthError }),
				}));
			}
		};
		return () => bc.close();
	}, [refreshStatus, t]);

	const saveAndConnect = useCallback(async (configJson: string) => {
		try { JSON.parse(configJson); } catch {
			throw new Error(t("mcp.invalidJsonFormat"));
		}
		localStorage.setItem(STORAGE_KEY, configJson);
		await applyConfig(configJson);
	}, [applyConfig, t]);

	const toggleServer = useCallback(async (name: string, enabled: boolean) => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return;
		const config = JSON.parse(saved);
		if (config.mcpServers?.[name]) {
			config.mcpServers[name].enabled = enabled;
			const json = JSON.stringify(config, null, 2);
			localStorage.setItem(STORAGE_KEY, json);
			await applyConfig(json);
		}
	}, [applyConfig]);

	const disconnectAll = useCallback(async () => {
		localStorage.removeItem(STORAGE_KEY);
		await applyConfig(JSON.stringify({ mcpServers: {} }));
	}, [applyConfig]);

	const ensureConnected = useCallback(async () => {
		if (Date.now() - lastEnsure.current < ENSURE_THROTTLE_MS) return;
		lastEnsure.current = Date.now();
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return;
		try {
			const res = await fetch("/api/mcp/servers", {
				headers: {
					"x-spreadjs-locale": locale,
					"x-mcp-client-id": getClientId(),
				},
			});
			const data = await res.json();
			// 后端内存丢失（server 数量与本地配置不一致）或有 enabled server 未连接时重连
			let expectedCount = 0;
			try {
				const localConfig = JSON.parse(saved);
				expectedCount = Object.values(localConfig.mcpServers ?? {}).filter(
					(s: unknown) => (s as { enabled?: boolean }).enabled !== false
				).length;
			} catch { /* ignore */ }
			const hasDisconnected = data.servers.some(
				(s: McpServerStatus) => s.enabled && !s.connected,
			);
			const backendLostState = data.servers.length < expectedCount;
			if (hasDisconnected || backendLostState) {
				await applyConfig(saved);
			} else {
				setState((s) => ({
					...s,
					servers: data.servers,
					lastCheck: Date.now(),
				}));
			}
		} catch {
			await applyConfig(saved).catch(() => {});
		}
	}, [applyConfig, getClientId, locale]);

	const authorizeServer = useCallback(async (name: string) => {
		setState((s) => ({ ...s, error: null }));
		try {
			const res = await fetch("/api/mcp/oauth/start", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-spreadjs-locale": locale,
					"x-mcp-client-id": getClientId(),
				},
				body: JSON.stringify({ serverName: name }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err?.error ?? t("mcp.httpStatus", { status: res.status }));
			}
			const { authorizationUrl } = await res.json();

			const w = 600, h = 700;
			const left = window.screenX + (window.outerWidth - w) / 2;
			const top = window.screenY + (window.outerHeight - h) / 2;
			window.open(
				authorizationUrl,
				"mcp-oauth-popup",
				`width=${w},height=${h},left=${left},top=${top},popup=yes`,
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			setState((s) => ({ ...s, error: msg }));
		}
	}, [getClientId, locale, t]);

	const toolCount = state.servers.reduce(
		(sum, s) => sum + (s.connected ? s.toolCount : 0), 0,
	);

	const configJson = typeof window !== "undefined"
		? localStorage.getItem(STORAGE_KEY) ?? ""
		: "";

	return {
		...state,
		toolCount,
		configJson,
		saveAndConnect,
		toggleServer,
		disconnectAll,
		ensureConnected,
		authorizeServer,
	};
}

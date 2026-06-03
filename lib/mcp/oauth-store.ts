import type {
	OAuthTokens,
	OAuthClientInformationMixed,
} from "@modelcontextprotocol/sdk/shared/auth.js";

/** 服务端内存 OAuth 存储，按 clientId + serverName 隔离 */
class OAuthStore {
	private tokens = new Map<string, OAuthTokens>();
	private tokenSavedAt = new Map<string, number>();
	private verifiers = new Map<string, string>();
	private clientInfo = new Map<string, OAuthClientInformationMixed>();
	private stateMap = new Map<string, { clientId: string; serverName: string; createdAt: number }>();

	private static STATE_TTL = 10 * 60_000; // 10 minutes

	// ── tokens ───────────────────────────────────────────────
	private key(clientId: string, name: string) {
		return `${clientId}:${name}`;
	}

	getTokens(clientId: string, name: string) { return this.tokens.get(this.key(clientId, name)); }
	setTokens(clientId: string, name: string, t: OAuthTokens) {
		const key = this.key(clientId, name);
		this.tokens.set(key, t);
		this.tokenSavedAt.set(key, Date.now());
	}
	getSavedAt(clientId: string, name: string) { return this.tokenSavedAt.get(this.key(clientId, name)); }
	hasTokens(clientId: string, name: string) { return this.tokens.has(this.key(clientId, name)); }

	// ── code verifier ────────────────────────────────────────
	getVerifier(clientId: string, name: string) { return this.verifiers.get(this.key(clientId, name)); }
	setVerifier(clientId: string, name: string, v: string) { this.verifiers.set(this.key(clientId, name), v); }

	// ── client info（动态注册） ───────────────────────────────
	getClientInfo(clientId: string, name: string) { return this.clientInfo.get(this.key(clientId, name)); }
	setClientInfo(clientId: string, name: string, info: OAuthClientInformationMixed) {
		this.clientInfo.set(this.key(clientId, name), info);
	}

	// ── state → clientId/serverName 映射（带 TTL） ───────────
	setState(state: string, clientId: string, name: string) {
		this.stateMap.set(state, { clientId, serverName: name, createdAt: Date.now() });
		if (this.stateMap.size > 10) this.sweepExpiredStates();
	}
	peekState(state: string) {
		const entry = this.stateMap.get(state);
		if (!entry) return undefined;
		if (Date.now() - entry.createdAt > OAuthStore.STATE_TTL) return undefined;
		return { clientId: entry.clientId, serverName: entry.serverName };
	}
	resolveState(state: string) {
		const entry = this.stateMap.get(state);
		if (!entry) return undefined;
		this.stateMap.delete(state);
		if (Date.now() - entry.createdAt > OAuthStore.STATE_TTL) return undefined;
		this.sweepExpiredStates();
		return { clientId: entry.clientId, serverName: entry.serverName };
	}

	private sweepExpiredStates() {
		const now = Date.now();
		for (const [key, entry] of this.stateMap) {
			if (now - entry.createdAt > OAuthStore.STATE_TTL) {
				this.stateMap.delete(key);
			}
		}
	}

	// ── 清除单个 server 的所有数据 ───────────────────────────
	clear(clientId: string, name: string) {
		const storeKey = this.key(clientId, name);
		this.tokens.delete(storeKey);
		this.tokenSavedAt.delete(storeKey);
		this.verifiers.delete(storeKey);
		this.clientInfo.delete(storeKey);
		for (const [key, entry] of this.stateMap) {
			if (entry.clientId === clientId && entry.serverName === name) this.stateMap.delete(key);
		}
	}
}

export const oauthStore = new OAuthStore();

import { McpManager } from "./manager";

const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,80}$/;
const MANAGER_TTL_MS = 2 * 60 * 60_000;

interface RegistryEntry {
	manager: McpManager;
	lastAccessAt: number;
}

class McpManagerRegistry {
	private entries = new Map<string, RegistryEntry>();
	private lastSweepAt = 0;

	get(clientId: string): McpManager {
		const now = Date.now();
		this.sweep(now);

		let entry = this.entries.get(clientId);
		if (!entry) {
			entry = { manager: new McpManager(clientId), lastAccessAt: now };
			this.entries.set(clientId, entry);
		} else {
			entry.lastAccessAt = now;
		}

		return entry.manager;
	}

	private sweep(now: number) {
		if (now - this.lastSweepAt < 10 * 60_000) return;
		this.lastSweepAt = now;

		for (const [clientId, entry] of this.entries) {
			if (now - entry.lastAccessAt <= MANAGER_TTL_MS) continue;
			this.entries.delete(clientId);
			entry.manager.close().catch((error: unknown) => {
				console.warn("[MCP] failed to close expired manager", error);
			});
		}
	}
}

export const mcpRegistry = new McpManagerRegistry();

export function resolveMcpClientId(req: Request, fallback?: unknown): string | null {
	const value = req.headers.get("x-mcp-client-id") ?? (typeof fallback === "string" ? fallback : null);
	if (!value || !CLIENT_ID_RE.test(value)) return null;
	return value;
}

export function getMcpManagerForRequest(req: Request, fallback?: unknown): McpManager | null {
	const clientId = resolveMcpClientId(req, fallback);
	return clientId ? mcpRegistry.get(clientId) : null;
}

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
	OAuthClientMetadata,
	OAuthClientInformationMixed,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { oauthStore } from "./oauth-store";
import { MCP_CLIENT_NAME } from "./types";
import type { McpServerConfig } from "./types";

export class OAuthRedirectError extends Error {
	constructor() { super("OAUTH_REDIRECT_NEEDED"); }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * 服务端 OAuthClientProvider 实现。
 * token / verifier / clientInfo 均存储在 oauthStore（内存）。
 * redirectToAuthorization 在服务端无法打开浏览器，抛异常由上层捕获。
 */
export class McpOAuthProvider implements OAuthClientProvider {
	constructor(
		private clientId: string,
		private serverName: string,
		private config: McpServerConfig,
	) {}

	get redirectUrl(): string {
		return `${APP_URL}/api/mcp/oauth/callback`;
	}

	get clientMetadata(): OAuthClientMetadata {
		return {
			redirect_uris: [this.redirectUrl],
			client_name: MCP_CLIENT_NAME,
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: this.config.scopes,
			token_endpoint_auth_method: this.config.clientSecret
				? "client_secret_post"
				: "none",
		};
	}

	async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
		// 优先使用动态注册后保存的 clientInfo
		const saved = oauthStore.getClientInfo(this.clientId, this.serverName);
		if (saved) return saved;
		if (!this.config.clientId) return undefined;
		return {
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret,
		};
	}

	async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
		oauthStore.setClientInfo(this.clientId, this.serverName, info);
	}

	async tokens(): Promise<OAuthTokens | undefined> {
		return oauthStore.getTokens(this.clientId, this.serverName);
	}

	async saveTokens(tokens: OAuthTokens): Promise<void> {
		oauthStore.setTokens(this.clientId, this.serverName, tokens);
	}

	async redirectToAuthorization(url: URL): Promise<void> {
		void url;
		// 服务端无法打开浏览器，抛异常让上层知道需要授权
		throw new OAuthRedirectError();
	}

	async saveCodeVerifier(v: string): Promise<void> {
		oauthStore.setVerifier(this.clientId, this.serverName, v);
	}

	async codeVerifier(): Promise<string> {
		return oauthStore.getVerifier(this.clientId, this.serverName) ?? "";
	}

	async state(): Promise<string> {
		const s = crypto.randomUUID();
		oauthStore.setState(s, this.clientId, this.serverName);
		return s;
	}
}

import { mcpRegistry } from "@/lib/mcp";
import { oauthStore } from "@/lib/mcp/oauth-store";
import { createTranslator } from "@/lib/i18n";
import { resolveRequestLocale } from "@/lib/i18n/request";

export async function GET(req: Request) {
	const locale = resolveRequestLocale(req);
	const t = createTranslator(locale);
	const { searchParams } = new URL(req.url);
	const code = searchParams.get("code") ?? "";
	const state = searchParams.get("state") ?? "";
	const error = searchParams.get("error") ?? "";

	let resultPayload: { success: boolean; serverName?: string; error?: string };

	if (error) {
		resultPayload = { success: false, error };
	} else if (!code || !state) {
		resultPayload = { success: false, error: t("mcp.oauthCallbackMissingState") };
	} else {
		try {
			const resolved = oauthStore.peekState(state);
			if (!resolved) throw new Error(t("mcp.oauthStateInvalid"));
			const mcpManager = mcpRegistry.get(resolved.clientId);
			const serverName = await mcpManager.completeAuth(state, code, locale);
			resultPayload = { success: true, serverName };
		} catch (e) {
			resultPayload = {
				success: false,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	}

	// 安全嵌入 JSON，BroadcastChannel 通知主窗口后关闭弹窗
	// escape </ 防止 script block 被截断（XSS）
	const payload = JSON.stringify(resultPayload).replace(/</g, "\\u003c");
	const displayMsg = resultPayload.success
		? t("mcp.oauthCallbackSuccess")
		: t("mcp.oauthCallbackFailure", { error: escapeHtml(resultPayload.error ?? t("mcp.unknownError")) });
	const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${t("mcp.oauthWindowTitle")}</title></head>
<body>
<p>${displayMsg}</p>
<script>
try {
	const bc = new BroadcastChannel("mcp-oauth");
	bc.postMessage(${payload});
	bc.close();
} catch(e) { console.error(e); }
setTimeout(() => window.close(), 1500);
</script>
</body></html>`;

	return new Response(html, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

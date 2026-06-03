import { getMcpManagerForRequest } from "@/lib/mcp";
import { createTranslator } from "@/lib/i18n";
import { resolveRequestLocale } from "@/lib/i18n/request";

export async function POST(req: Request) {
	const fallbackLocale = resolveRequestLocale(req);
	const fallbackT = createTranslator(fallbackLocale);
	let body: { serverName?: string };
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: fallbackT("mcp.invalidJson") }, { status: 400 });
	}
	const locale = resolveRequestLocale(req);
	const t = createTranslator(locale);
	const mcpManager = getMcpManagerForRequest(req);
	if (!mcpManager) return Response.json({ error: "Missing MCP client id" }, { status: 400 });

	const { serverName } = body;
	if (!serverName || typeof serverName !== "string") {
		return Response.json({ error: t("mcp.serverNameRequired") }, { status: 400 });
	}

	try {
		const result = await mcpManager.startAuth(serverName, locale);
		console.log(`[MCP:OAuth] startAuth success:`, result.authorizationUrl.slice(0, 100));
		return Response.json(result);
	} catch (e) {
		console.error(`[MCP:OAuth] startAuth failed:`, e instanceof Error ? e.message : e);
		return Response.json(
			{ error: e instanceof Error ? e.message : String(e) },
			{ status: 400 },
		);
	}
}

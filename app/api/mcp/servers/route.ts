import { getMcpManagerForRequest } from "@/lib/mcp";
import { createTranslator } from "@/lib/i18n";
import { resolveRequestLocale } from "@/lib/i18n/request";
import { McpConfigSchema } from "@/lib/mcp/types";

export async function GET(req: Request) {
	const mcpManager = getMcpManagerForRequest(req);
	if (!mcpManager) return Response.json({ error: "Missing MCP client id" }, { status: 400 });
	return Response.json({ servers: await mcpManager.getStatus() });
}

export async function POST(req: Request) {
	const locale = resolveRequestLocale(req);
	const t = createTranslator(locale);
	const mcpManager = getMcpManagerForRequest(req);
	if (!mcpManager) return Response.json({ error: "Missing MCP client id" }, { status: 400 });
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json(
			{ error: t("mcp.invalidJson") },
			{ status: 400 },
		);
	}

	const parsed = McpConfigSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: t("mcp.validationFailed"), issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	await mcpManager.applyConfig(parsed.data);
	return Response.json({ servers: await mcpManager.getStatus() });
}

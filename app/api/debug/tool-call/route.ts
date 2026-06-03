import { getToolDef, isServerTool } from "@/lib/tools/registry";
import type { ToolDef } from "@/lib/tools/types";
import { createTranslator } from "@/lib/i18n";
import { resolveRequestLocale } from "@/lib/i18n/request";
import { errorLogger } from "@/lib/logging";

export async function POST(req: Request) {
	const fallbackLocale = resolveRequestLocale(req);
	const fallbackT = createTranslator(fallbackLocale);
	if (process.env.NODE_ENV === "production") {
		return Response.json(
			{ error: fallbackT("debug.endpointDisabled") },
			{ status: 403 },
		);
	}

	try {
		const body = await req.json() as { toolName: string; input: unknown; locale?: string };
		const locale = resolveRequestLocale(req, body.locale);
		const t = createTranslator(locale);
		const { toolName, input } = body;

		if (!isServerTool(toolName)) {
			return Response.json(
				{ error: t("debug.serverToolRequired", { toolName }) },
				{ status: 400 },
			);
		}

		const def = getToolDef(toolName, locale) as ToolDef | undefined;
		if (!def?.execute) {
			return Response.json(
				{ error: t("debug.executeMissing", { toolName }) },
				{ status: 404 },
			);
		}

		const t0 = performance.now();
		const result = await def.execute(input);
		const durationMs = Math.round((performance.now() - t0) * 100) / 100;

		// 捕获工具返回的错误结果
		if (typeof result === "object" && result !== null) {
			errorLogger.captureToolResult(toolName, result as { success?: boolean; error?: string });
		}

		return Response.json({ result, durationMs });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.error("[debug/tool-call]", message);
		errorLogger.capture("debug/tool-call", e, { source: "debug/tool-call" });
		return Response.json({ error: message }, { status: 500 });
	}
}

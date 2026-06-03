import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "@/lib/i18n";
import { resolveRequestLocale } from "@/lib/i18n/request";
import { errorLogger } from "@/lib/logging";
import type { ErrorLogEntry } from "@/lib/logging/types";

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const MAX_ENTRIES = 200;

/**
 * GET /api/diagnostic-logs?date=YYYY-MM-DD
 *
 * 返回指定日期（默认今天）的服务端错误日志。
 * 先将内存缓冲区 flush 到文件，再读取当天日志文件，
 * 按时间降序返回最近 200 条。文件不存在或读取失败时返回空数组。
 */
export async function GET(req: Request) {
	const locale = resolveRequestLocale(req);
	const t = createTranslator(locale);
	const { searchParams } = new URL(req.url);
	const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

	// 校验日期格式，防止路径遍历
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return Response.json({ error: t("diagnostic.invalidDateFormat") }, { status: 400 });
	}

	// flush 缓冲区，确保最新日志已写入文件
	errorLogger.flush();

	const filePath = path.join(LOGS_DIR, `errors-${date}.jsonl`);
	const entries: ErrorLogEntry[] = [];

	try {
		if (fs.existsSync(filePath)) {
			const raw = fs.readFileSync(filePath, "utf-8");
			for (const line of raw.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					entries.push(JSON.parse(trimmed) as ErrorLogEntry);
				} catch {
					// 跳过损坏的行
				}
			}
		}
	} catch {
		// 文件读取失败，返回空日志而非 500
	}

	// 按时间降序，取最近 MAX_ENTRIES 条
	const sorted = entries
		.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
		.slice(0, MAX_ENTRIES);

	return Response.json({ logs: sorted, date });
}

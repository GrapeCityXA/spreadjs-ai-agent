import { APICallError } from "ai";
import { normalizeLocale, type AppLocale } from "@/lib/i18n";

const MESSAGE_KEYS = [
	"message",
	"error",
	"detail",
	"reason",
	"error_message",
	"error_description",
	"msg",
	"description",
] as const;

const NESTED_KEYS = ["data", "cause", "response", "body"] as const;

const LOW_BALANCE_RE = [
	/余额不足/i,
	/无可用资源包/i,
	/请充值/i,
	/insufficient[\s_-]*quota/i,
	/quota exceeded/i,
	/out of credits?/i,
	/credit balance/i,
	/billing/i,
	/payment required/i,
	/额度不足/i,
];

function tryParseJson(text: string): unknown | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}

function extractMessage(value: unknown, depth = 0): string | null {
	if (depth > 5 || value == null) return null;

	if (typeof value === "string") {
		const parsed = tryParseJson(value);
		if (parsed !== null) return extractMessage(parsed, depth + 1);
		const trimmed = value.trim();
		return trimmed ? trimmed : null;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const msg = extractMessage(item, depth + 1);
			if (msg) return msg;
		}
		return null;
	}

	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		for (const key of MESSAGE_KEYS) {
			const msg = extractMessage(obj[key], depth + 1);
			if (msg) return msg;
		}
		for (const key of NESTED_KEYS) {
			const msg = extractMessage(obj[key], depth + 1);
			if (msg) return msg;
		}
	}

	return null;
}

function includesLowBalanceSignal(text: string): boolean {
	return LOW_BALANCE_RE.some((re) => re.test(text));
}

function buildUserMessage(status: number, detail: string | null, locale: AppLocale): string {
	const resolved = normalizeLocale(locale);
	const isZh = resolved === "zh-CN";

	if (detail && includesLowBalanceSignal(detail)) {
		return isZh
			? `模型服务余额或额度不足：${detail}`
			: `The model service is out of balance or quota: ${detail}`;
	}

	if (status === 401) {
		if (detail && !/^unauthorized$/i.test(detail)) {
			return isZh
				? `模型服务鉴权失败（401）：${detail}`
				: `Model service authentication failed (401): ${detail}`;
		}
		return isZh
			? "模型服务鉴权失败（401 Unauthorized），请检查 API Key 是否正确。"
			: "Model service authentication failed (401 Unauthorized). Check whether the API key is valid.";
	}

	if (status === 403) {
		if (detail && !/^forbidden$/i.test(detail)) {
			return isZh
				? `模型服务拒绝请求（403）：${detail}`
				: `Model service rejected the request (403): ${detail}`;
		}
		return isZh
			? "模型服务拒绝请求（403 Forbidden）。常见原因：API Key 无权限、余额不足或模型未开通。"
			: "Model service rejected the request (403 Forbidden). Common causes include missing permissions, insufficient balance, or an unavailable model.";
	}

	if (status === 429) {
		if (detail) {
			return isZh
				? `模型服务限流或额度不足（429）：${detail}`
				: `Model service rate-limited the request or quota is exhausted (429): ${detail}`;
		}
		return isZh
			? "模型服务限流或额度不足（429 Too Many Requests）。"
			: "Model service rate-limited the request or quota is exhausted (429 Too Many Requests).";
	}

	return detail ?? (
		isZh
			? "模型服务调用失败，请稍后重试。"
			: "Model service call failed. Please try again later."
	);
}

function pickStatus(error: unknown): number {
	const e = error as { status?: unknown; statusCode?: unknown };
	if (typeof e.status === "number") return e.status;
	if (typeof e.statusCode === "number") return e.statusCode;
	if (APICallError.isInstance(error) && typeof error.statusCode === "number") {
		return error.statusCode;
	}
	return 500;
}

export function normalizeChatRouteError(
	error: unknown,
	locale: AppLocale = "en",
): { status: number; message: string } {
	const detailCandidates: unknown[] = [];

	if (APICallError.isInstance(error)) {
		detailCandidates.push(error.responseBody, error.data, error.message, error.cause);
	} else {
		const e = error as { message?: unknown; responseBody?: unknown; data?: unknown; cause?: unknown };
		detailCandidates.push(e.message, e.responseBody, e.data, e.cause);
	}

	let detail: string | null = null;
	for (const candidate of detailCandidates) {
		const extracted = extractMessage(candidate);
		if (extracted) {
			detail = extracted;
			break;
		}
	}

	const status = pickStatus(error);
	return { status, message: buildUserMessage(status, detail, locale) };
}

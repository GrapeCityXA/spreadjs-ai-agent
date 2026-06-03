import { normalizeLocale, type AppLocale } from "@/lib/i18n";

export function resolveRequestLocale(
	req: Request,
	explicitLocale?: string | null,
): AppLocale {
	if (explicitLocale) {
		return normalizeLocale(explicitLocale);
	}

	return normalizeLocale(
		req.headers.get("x-spreadjs-locale") ??
		req.headers.get("x-locale") ??
		req.headers.get("accept-language"),
	);
}

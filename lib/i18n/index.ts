import { enMessages, type TranslationKey } from "./locales/en";
import { zhCNMessages } from "./locales/zh-CN";
import type { AppLocale, TranslationValues } from "./types";

export type { AppLocale, TranslationValues } from "./types";
export type { TranslationKey } from "./locales/en";

export const DEFAULT_LOCALE: AppLocale = "zh-CN";

const resources = {
	en: enMessages,
	"zh-CN": zhCNMessages,
} satisfies Record<AppLocale, Record<TranslationKey, string>>;

export interface LocaleConfig {
	locale: AppLocale;
	dateLocale: "en-US" | "zh-CN";
	acceptLanguage: string;
	spreadCulture: "en-us" | "zh-cn";
	calcLanguage: "en" | "zh";
}

const LOCALE_CONFIGS = {
	en: {
		locale: "en",
		dateLocale: "en-US",
		acceptLanguage: "en-US,en;q=0.9",
		spreadCulture: "en-us",
		calcLanguage: "en",
	},
	"zh-CN": {
		locale: "zh-CN",
		dateLocale: "zh-CN",
		acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
		spreadCulture: "zh-cn",
		calcLanguage: "zh",
	},
} satisfies Record<AppLocale, LocaleConfig>;

export function normalizeLocale(input?: string | null): AppLocale {
	if (!input) return DEFAULT_LOCALE;
	const locale = input.split(",")[0]?.trim().toLowerCase().replace("_", "-");
	if (!locale) return DEFAULT_LOCALE;
	if (locale === "en" || locale.startsWith("en-")) {
		return "en";
	}
	if (locale === "zh" || locale.startsWith("zh-")) {
		return "zh-CN";
	}
	return DEFAULT_LOCALE;
}

export function isZhLocale(input?: string | null): boolean {
	return normalizeLocale(input) === "zh-CN";
}

export function getLocaleConfig(input?: string | null): LocaleConfig {
	return LOCALE_CONFIGS[normalizeLocale(input)];
}

export function humanizeSnakeCase(value: string): string {
	return value
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatMessage(message: string, values?: TranslationValues): string {
	if (!values) return message;
	return message.replace(/\{(\w+)\}/g, (_, key: string) => {
		const value = values[key];
		return value == null ? `{${key}}` : String(value);
	});
}

export function translate(
	locale: AppLocale,
	key: TranslationKey,
	values?: TranslationValues,
): string {
	const normalized = normalizeLocale(locale);
	const template = resources[normalized][key] ?? resources[DEFAULT_LOCALE][key] ?? key;
	return formatMessage(template, values);
}

export function createTranslator(locale: AppLocale = DEFAULT_LOCALE) {
	return (key: TranslationKey, values?: TranslationValues) => translate(locale, key, values);
}

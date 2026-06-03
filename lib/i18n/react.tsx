"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
	createTranslator,
	DEFAULT_LOCALE,
	normalizeLocale,
	type AppLocale,
	type TranslationKey,
	type TranslationValues,
} from "@/lib/i18n";

interface I18nContextValue {
	locale: AppLocale;
	t: (key: TranslationKey, values?: TranslationValues) => string;
}

const I18nContext = createContext<I18nContextValue>({
	locale: DEFAULT_LOCALE,
	t: createTranslator(DEFAULT_LOCALE),
});

interface I18nProviderProps {
	children: ReactNode;
	locale?: AppLocale;
}

export function I18nProvider({ children, locale = DEFAULT_LOCALE }: I18nProviderProps) {
	const normalizedLocale = normalizeLocale(locale);
	const value = useMemo<I18nContextValue>(
		() => ({
			locale: normalizedLocale,
			t: createTranslator(normalizedLocale),
		}),
		[normalizedLocale],
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
	return useContext(I18nContext);
}

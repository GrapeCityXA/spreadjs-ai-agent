"use client";

import { useEffect, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSettings } from "@/lib/hooks/useSettings";
import { normalizeLocale } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/react";

interface AppProvidersProps {
	children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	const { settings } = useSettings();
	const locale = normalizeLocale(settings.locale);

	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	return (
		<I18nProvider locale={locale}>
			<TooltipProvider>{children}</TooltipProvider>
		</I18nProvider>
	);
}

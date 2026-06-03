"use client";

import {
	useEffect,
	useRef,
	useState,
	type ComponentProps,
	type ComponentType,
} from "react";
import GC from "@grapecity-software/spread-sheets";
import "@grapecity-software/spread-sheets-languagepackages";

// Feature modules
import "@grapecity-software/spread-sheets-shapes";
import "@grapecity-software/spread-sheets-charts";
import "@grapecity-software/spread-sheets-datacharts-addon";
import "@grapecity-software/spread-sheets-slicers";
import "@grapecity-software/spread-sheets-print";
import "@grapecity-software/spread-sheets-barcode";
import "@grapecity-software/spread-sheets-pdf";
import "@grapecity-software/spread-sheets-pivot-addon";
import "@grapecity-software/spread-sheets-tablesheet";
import "@grapecity-software/spread-sheets-ganttsheet";
import "@grapecity-software/spread-sheets-reportsheet-addon";
import "@grapecity-software/spread-sheets-formula-panel";
import "@grapecity-software/spread-sheets-io";

import { useSpreadJS } from "@/lib/spreadjs/context";
import { getLocaleConfig, type AppLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/react";

type DesignerModule = typeof import("@grapecity-software/spread-sheets-designer");
type DesignerNamespace = DesignerModule["Spread"]["Sheets"]["Designer"];
type DesignerInstance = InstanceType<DesignerNamespace["Designer"]>;
type DesignerReactProps = ComponentProps<
	typeof import("@grapecity-software/spread-sheets-designer-react").Designer
>;

interface LoadedDesignerRuntime {
	DesignerComponent: ComponentType<DesignerReactProps>;
	designerModule: DesignerModule;
}

const runtimeLocaleLoaders: Partial<Record<AppLocale, () => Promise<unknown>>> = {
	"zh-CN": () => import("@grapecity-software/spread-sheets-resources-zh"),
};

const designerResourceLoaders: Record<AppLocale, () => Promise<unknown>> = {
	en: () => import("@grapecity-software/spread-sheets-designer-resources-en"),
	"zh-CN": () => import("@grapecity-software/spread-sheets-designer-resources-cn"),
};

const runtimeLocalePromises = new Map<AppLocale, Promise<void>>();
const designerResourcePromises = new Map<AppLocale, Promise<object>>();
const designerResourcesCache = new Map<AppLocale, object>();

let designerRuntimePromise: Promise<LoadedDesignerRuntime> | null = null;

// License keys are inlined at build time through NEXT_PUBLIC_* env vars.
GC.Spread.Sheets.LicenseKey = process.env.NEXT_PUBLIC_SPREADJS_LICENSE ?? "";

function attachGCToGlobal() {
	const globalWithGC = globalThis as typeof globalThis & { GC?: typeof GC };
	globalWithGC.GC = GC;
}

function cloneDesignerResources<T>(resources: T): T {
	if (typeof structuredClone === "function") {
		return structuredClone(resources);
	}

	return JSON.parse(JSON.stringify(resources)) as T;
}

function readDesignerResourceObject(): object {
	const designerNamespace = (GC.Spread.Sheets as typeof GC.Spread.Sheets & {
		Designer?: {
			DR?: {
				res?: object;
			};
		};
	}).Designer;
	const resources = designerNamespace?.DR?.res;

	if (!resources) {
		throw new Error("SpreadJS designer resources are not available.");
	}

	return resources;
}

function createDesignerConfig(spreadDesigner: DesignerNamespace) {
	return {
		...spreadDesigner.DefaultConfig,
		fileMenu: undefined,
	};
}

async function ensureRuntimeLocale(locale: AppLocale): Promise<void> {
	const cached = runtimeLocalePromises.get(locale);
	if (cached) {
		await cached;
		return;
	}

	const loader = runtimeLocaleLoaders[locale];
	if (!loader) return;

	const promise = (async () => {
		attachGCToGlobal();
		await loader();
	})();

	runtimeLocalePromises.set(locale, promise);

	try {
		await promise;
	} catch (error) {
		runtimeLocalePromises.delete(locale);
		throw error;
	}
}

async function getDesignerResources(locale: AppLocale): Promise<object> {
	const cachedResources = designerResourcesCache.get(locale);
	if (cachedResources) {
		return cloneDesignerResources(cachedResources);
	}

	const cachedPromise = designerResourcePromises.get(locale);
	if (cachedPromise) {
		return cloneDesignerResources(await cachedPromise);
	}

	const promise = (async () => {
		attachGCToGlobal();
		await designerResourceLoaders[locale]();
		const resources = cloneDesignerResources(readDesignerResourceObject());
		designerResourcesCache.set(locale, resources);
		return resources;
	})();

	designerResourcePromises.set(locale, promise);

	try {
		return cloneDesignerResources(await promise);
	} catch (error) {
		designerResourcePromises.delete(locale);
		throw error;
	}
}

async function ensureDesignerRuntime(initialLocale: AppLocale): Promise<LoadedDesignerRuntime> {
	if (!designerRuntimePromise) {
		designerRuntimePromise = (async () => {
			await getDesignerResources(initialLocale);
			attachGCToGlobal();

			const [designerModule, designerReactModule] = await Promise.all([
				import("@grapecity-software/spread-sheets-designer"),
				import("@grapecity-software/spread-sheets-designer-react"),
			]);

			designerModule.Spread.Sheets.Designer.LicenseKey =
				process.env.NEXT_PUBLIC_SPREADJS_DESIGNER_LICENSE ?? "";

			return {
				DesignerComponent: designerReactModule.Designer,
				designerModule,
			};
		})();
	}

	return designerRuntimePromise;
}

function applySpreadLocale(locale: AppLocale) {
	const config = getLocaleConfig(locale);
	const calcFunctions = GC.Spread.CalcEngine.Functions as typeof GC.Spread.CalcEngine.Functions & {
		setLanguagepackage?: (language: "en" | "zh") => void;
	};
	const calcLanguagePackages = GC.Spread.CalcEngine.LanguagePackages as
		| { languagePackages?: (language: "en" | "zh") => void }
		| undefined;

	if (typeof calcFunctions.setLanguagepackage === "function") {
		calcFunctions.setLanguagepackage(config.calcLanguage);
	} else if (typeof calcLanguagePackages?.languagePackages === "function") {
		calcLanguagePackages.languagePackages(config.calcLanguage);
	}

	GC.Spread.Common.CultureManager.culture(config.spreadCulture);
}

function refreshDesigner(designer: DesignerInstance | null) {
	if (!designer) return;

	try {
		const workbook = designer.getWorkbook() as GC.Spread.Sheets.Workbook;
		workbook.suspendPaint();
		try {
			workbook.refresh();
			designer.refresh();
		} finally {
			workbook.resumePaint();
		}
	} catch {
		designer.refresh();
	}
}

async function applyDesignerLocale(
	locale: AppLocale,
	runtime: LoadedDesignerRuntime,
	designer: DesignerInstance | null,
) {
	const spreadDesigner = runtime.designerModule.Spread.Sheets.Designer;
	const resources = await getDesignerResources(locale);
	spreadDesigner.setResources(resources);
	if (designer) {
		designer.setConfig(createDesignerConfig(spreadDesigner));
	}
}

export default function SpreadJSDesigner() {
	const { locale, t } = useTranslation();
	const { setWorkbook } = useSpreadJS();
	const designerRef = useRef<DesignerInstance | null>(null);
	const [runtime, setRuntime] = useState<LoadedDesignerRuntime | null>(null);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				await ensureRuntimeLocale(locale);
				applySpreadLocale(locale);

				const loadedRuntime = runtime ?? (await ensureDesignerRuntime(locale));
				if (cancelled) return;
				if (!runtime) {
					setRuntime(loadedRuntime);
				}

				await applyDesignerLocale(locale, loadedRuntime, designerRef.current);
				if (cancelled) return;
				refreshDesigner(designerRef.current);
			} catch (error) {
				console.error("Failed to apply SpreadJS locale.", error);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [locale, runtime]);

	const handleDesignerInitialized = (designer: DesignerInstance) => {
		if (!runtime) return;

		designerRef.current = designer;
		designer.setConfig(createDesignerConfig(runtime.designerModule.Spread.Sheets.Designer));
		applySpreadLocale(locale);
		const workbook = designer.getWorkbook() as GC.Spread.Sheets.Workbook;
		setWorkbook(workbook);
		refreshDesigner(designer);
	};

	if (!runtime) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				{t("app.loadingDesigner")}
			</div>
		);
	}

	const DesignerComponent = runtime.DesignerComponent;

	return (
		<DesignerComponent
			config={createDesignerConfig(runtime.designerModule.Spread.Sheets.Designer)}
			styleInfo={{ width: "100%", height: "100%" }}
			designerInitialized={handleDesignerInitialized}
		/>
	);
}

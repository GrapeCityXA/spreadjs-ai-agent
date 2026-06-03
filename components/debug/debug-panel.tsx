"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "@/lib/i18n/react";
import type { AppLocale } from "@/lib/i18n";
import { useSpreadJS } from "@/lib/spreadjs/context";
import { getToolList, getToolDef } from "@/lib/tools/registry";
import { introspectSchema } from "@/lib/debug/schema-introspect";
import { schemaToTemplate } from "@/lib/debug/schema-utils";
import { executeDebugDirect } from "@/lib/debug/runner";
import type { DebugSession } from "@/lib/debug/types";
import { ToolSelector } from "./tool-selector";
import { ParamEditor } from "./param-editor";
import { SchemaForm, buildDefaults } from "./schema-form";
import { LogTimeline } from "./log-timeline";
import { CodeIcon, ListIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";

type InputMode = "form" | "json";

export function DebugPanel() {
	const { t, locale } = useTranslation();
	const { workbook, isReady } = useSpreadJS();
	const tools = useMemo(() => getToolList(locale), [locale]);

	const [selectedTool, setSelectedTool] = useState(tools[0]?.name ?? "");
	const [inputMode, setInputMode] = useState<InputMode>("form");
	const [paramText, setParamText] = useState(() => getDefaultJson(selectedTool, locale));
	const [formValues, setFormValues] = useState<Record<string, unknown>>(() =>
		getDefaultFormValues(selectedTool, locale),
	);
	const [jsonError, setJsonError] = useState<string>();
	const [session, setSession] = useState<DebugSession | null>(null);
	const [running, setRunning] = useState(false);
	const [logOpen, setLogOpen] = useState(false);

	const fields = useMemo(() => {
		const def = getToolDef(selectedTool, locale);
		return def ? introspectSchema(def.inputSchema) : [];
	}, [locale, selectedTool]);

	const handleToolChange = useCallback((name: string) => {
		setSelectedTool(name);
		setParamText(getDefaultJson(name, locale));
		setFormValues(getDefaultFormValues(name, locale));
		setJsonError(undefined);
		setSession(null);
	}, [locale]);

	const handleModeSwitch = useCallback(
		(mode: InputMode) => {
			if (mode === "json" && inputMode === "form") {
				// Form → JSON: serialize current form values
				const clean = cleanUndefined(formValues);
				setParamText(JSON.stringify(clean, null, "\t"));
			} else if (mode === "form" && inputMode === "json") {
				// JSON → Form: parse JSON into form values
				try {
					const parsed = JSON.parse(paramText);
					if (typeof parsed === "object" && parsed !== null) {
						setFormValues(parsed);
					}
					setJsonError(undefined);
				} catch {
					// keep JSON mode if parse fails
					return;
				}
			}
			setInputMode(mode);
		},
		[inputMode, formValues, paramText],
	);

	const handleReset = useCallback(() => {
		setParamText(getDefaultJson(selectedTool, locale));
		setFormValues(getDefaultFormValues(selectedTool, locale));
		setJsonError(undefined);
	}, [locale, selectedTool]);

	const handleExecute = useCallback(async () => {
		let parsed: unknown;
		if (inputMode === "json") {
			try {
				parsed = JSON.parse(paramText);
			} catch (e) {
				setJsonError(t("debug.jsonParseFailed", { message: (e as Error).message }));
				return;
			}
		} else {
			parsed = cleanUndefined(formValues);
		}
		setJsonError(undefined);
		setRunning(true);
		setSession(null);

		try {
			const result = await executeDebugDirect(selectedTool, parsed, workbook, locale);
			setSession(result);
			setLogOpen(true);
		} catch (e) {
			setSession({
				toolName: selectedTool,
				startedAt: Date.now(),
				logs: [
					{
						stage: "execution",
						status: "error",
						durationMs: 0,
						error: (e as Error).message,
					},
				],
				totalMs: 0,
			});
			setLogOpen(true);
		} finally {
			setRunning(false);
		}
	}, [selectedTool, inputMode, paramText, formValues, workbook, locale, t]);

	const toolDescription = useMemo(() => {
		const def = getToolDef(selectedTool, locale);
		return def?.description;
	}, [locale, selectedTool]);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* 上部：工具选择 + 参数输入 */}
			<div className={`flex flex-col overflow-hidden ${logOpen ? "h-1/2" : "flex-1"}`}>
				{/* 顶部：工具下拉选择 */}
				<div className="flex-shrink-0 border-b border-border/40 p-3">
					<ToolSelector tools={tools} value={selectedTool} onChange={handleToolChange} />
				</div>

				{/* 参数输入 */}
				<div className="flex-1 min-w-0 overflow-y-auto p-3 flex flex-col gap-3">
					{/* 工具描述 */}
					{toolDescription && (
						<p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
							{toolDescription}
						</p>
					)}

					{/* Form / JSON 切换 */}
					<div className="flex items-center gap-1 rounded-md bg-muted/50 p-0.5">
						<button
							type="button"
							onClick={() => handleModeSwitch("form")}
							className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
								inputMode === "form"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<ListIcon className="size-3" />
							{t("debug.form")}
						</button>
						<button
							type="button"
							onClick={() => handleModeSwitch("json")}
							className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
								inputMode === "json"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<CodeIcon className="size-3" />
							{t("debug.json")}
						</button>
						<button
							type="button"
							onClick={handleReset}
							className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5"
						>
							{t("common.reset")}
						</button>
					</div>

					{/* 参数区 */}
					<div className="flex-1 min-h-0 overflow-y-auto">
						{inputMode === "form" ? (
							<SchemaForm fields={fields} values={formValues} onChange={setFormValues} />
						) : (
							<ParamEditor
								value={paramText}
								onChange={setParamText}
								error={jsonError}
							/>
						)}
					</div>

					{/* 执行按钮 */}
					<div className="flex-shrink-0 space-y-1.5">
						<button
							type="button"
							onClick={handleExecute}
							disabled={running || !selectedTool}
							className="w-full rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						>
							{running ? t("debug.running") : `▶ ${t("debug.execute")}`}
						</button>
						<div className="flex items-center gap-2 text-[10px]">
							<span className="text-amber-600 dark:text-amber-400">
								{`⚠ ${t("debug.liveWorkbookWarning")}`}
							</span>
							{!isReady && (
								<span className="text-red-500">· {t("debug.spreadjsNotReady")}</span>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* 下部：执行日志（可折叠） */}
			<div className={`border-t border-border/60 flex flex-col ${logOpen ? "h-1/2" : ""}`}>
				<button
					type="button"
					onClick={() => setLogOpen(!logOpen)}
					className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
				>
					{logOpen ? (
						<ChevronDownIcon className="size-3" />
					) : (
						<ChevronRightIcon className="size-3" />
					)}
					{t("debug.executionLog")}
					{session && (
						<span className="text-[10px] tabular-nums">
							({session.totalMs}ms)
						</span>
					)}
				</button>
				{logOpen && (
					<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
						<LogTimeline session={session} />
					</div>
				)}
			</div>
		</div>
	);
}

function getDefaultJson(toolName: string, locale?: AppLocale): string {
	if (!toolName) return "{}";
	const def = getToolDef(toolName, locale);
	if (!def) return "{}";
	try {
		const template = schemaToTemplate(def.inputSchema);
		return JSON.stringify(template, null, "\t");
	} catch {
		return "{}";
	}
}

function getDefaultFormValues(toolName: string, locale?: AppLocale): Record<string, unknown> {
	if (!toolName) return {};
	const def = getToolDef(toolName, locale);
	if (!def) return {};
	const fields = introspectSchema(def.inputSchema);
	return buildDefaults(fields);
}

/** Remove undefined values for clean JSON serialization */
function cleanUndefined(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(obj)) {
		if (val === undefined || val === "") continue;
		if (Array.isArray(val)) {
			result[key] = val.map((item) =>
				typeof item === "object" && item !== null && !Array.isArray(item)
					? cleanUndefined(item as Record<string, unknown>)
					: item,
			);
		} else if (typeof val === "object" && val !== null) {
			const cleaned = cleanUndefined(val as Record<string, unknown>);
			if (Object.keys(cleaned).length > 0) result[key] = cleaned;
		} else {
			result[key] = val;
		}
	}
	return result;
}

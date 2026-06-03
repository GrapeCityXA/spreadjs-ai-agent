"use client";

import { useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/react";

interface JsonEditorProps {
	value: string;
	onChange: (value: string) => void;
	minHeight?: string;
	maxHeight?: string;
	error?: string;
	className?: string;
}

function tryFormatJson(raw: string): string | null {
	try {
		return JSON.stringify(JSON.parse(raw), null, "\t");
	} catch {
		return null;
	}
}

export function JsonEditor({
	value,
	onChange,
	minHeight = "200px",
	maxHeight = "400px",
	error,
	className,
}: JsonEditorProps) {
	const { t } = useTranslation();
	const handleFormat = useCallback(() => {
		const formatted = tryFormatJson(value);
		if (formatted && formatted !== value) onChange(formatted);
	}, [value, onChange]);

	const extensions = useMemo(() => [json()], []);

	const isValidJson = useMemo(() => {
		try { JSON.parse(value); return true; } catch { return false; }
	}, [value]);

	return (
		<div className={cn("space-y-2", className)}>
			<div
				className={cn(
					"rounded-md border overflow-hidden relative group",
					"[&_.cm-gutters]:border-r-0",
					error ? "border-red-400" : "border-border",
				)}
			>
				<CodeMirror
					value={value}
					onChange={onChange}
					extensions={extensions}
					theme="dark"
					height={minHeight}
					maxHeight={maxHeight}
					basicSetup={{
						lineNumbers: true,
						foldGutter: true,
						bracketMatching: true,
						closeBrackets: true,
						indentOnInput: true,
						autocompletion: false,
						highlightActiveLine: true,
						tabSize: 4,
					}}
				/>
				{/* 格式化按钮 — hover 时显示 */}
				<button
					type="button"
					onClick={handleFormat}
					disabled={!isValidJson}
					title={t("jsonEditor.formatTitle")}
					className={cn(
						"absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-medium",
						"opacity-0 group-hover:opacity-100 transition-opacity",
						isValidJson
							? "bg-muted/80 text-muted-foreground hover:bg-muted cursor-pointer"
							: "bg-muted/40 text-muted-foreground/40 cursor-not-allowed",
					)}
				>
					{t("common.format")}
				</button>
			</div>
			{error && (
				<p className="text-[11px] text-red-500">{error}</p>
			)}
		</div>
	);
}

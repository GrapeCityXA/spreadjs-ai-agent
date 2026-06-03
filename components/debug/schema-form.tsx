"use client";

import { useState, useCallback } from "react";
import { useTranslation } from "@/lib/i18n/react";
import type { FieldMeta } from "@/lib/debug/schema-introspect";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { FieldControl } from "./field-controls";

interface SchemaFormProps {
	fields: FieldMeta[];
	values: Record<string, unknown>;
	onChange: (values: Record<string, unknown>) => void;
}

export function SchemaForm({ fields, values, onChange }: SchemaFormProps) {
	const { t } = useTranslation();
	const required = fields.filter((f) => f.required);
	const optional = fields.filter((f) => !f.required);

	const update = useCallback(
		(name: string, value: unknown) => {
			onChange({ ...values, [name]: value });
		},
		[values, onChange],
	);

	return (
		<div className="space-y-3">
			{required.length > 0 && (
				<fieldset className="space-y-2.5">
					<legend className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						{t("debug.required")}
					</legend>
					{required.map((f) => (
						<FieldControl
							key={f.name}
							field={f}
							value={values[f.name]}
							onChange={(v) => update(f.name, v)}
						/>
					))}
				</fieldset>
			)}
			{optional.length > 0 && (
				<OptionalSection
					fields={optional}
					values={values}
					onChange={onChange}
					label={t("debug.optional", { active: activeCount(optional, values), total: optional.length })}
				/>
			)}
		</div>
	);
}

function activeCount(fields: FieldMeta[], values: Record<string, unknown>): number {
	return fields.filter((field) => values[field.name] !== undefined && values[field.name] !== "").length;
}

function OptionalSection({
	fields,
	values,
	onChange,
	label,
}: {
	fields: FieldMeta[];
	values: Record<string, unknown>;
	onChange: (values: Record<string, unknown>) => void;
	label: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<div className="rounded-md border border-border/50">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
			>
				{open ? (
					<ChevronDownIcon className="size-3" />
				) : (
					<ChevronRightIcon className="size-3" />
				)}
				{label}
			</button>
			{open && (
				<div className="space-y-2.5 border-t border-border/30 px-2.5 py-2.5">
					{fields.map((f) => (
						<FieldControl
							key={f.name}
							field={f}
							value={values[f.name]}
							onChange={(v) => onChange({ ...values, [f.name]: v })}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/** Build default values object from field metadata */
export function buildDefaults(fields: FieldMeta[]): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const f of fields) {
		if (f.defaultValue !== undefined) {
			result[f.name] = f.defaultValue;
		} else if (f.required) {
			switch (f.type) {
				case "string":
					result[f.name] = "";
					break;
				case "number":
					result[f.name] = 0;
					break;
				case "boolean":
					result[f.name] = false;
					break;
				case "enum":
					result[f.name] = f.enumValues?.[0] ?? "";
					break;
				case "array":
					result[f.name] = [];
					break;
				case "object":
					result[f.name] = f.fields ? buildDefaults(f.fields) : {};
					break;
			}
		}
	}
	return result;
}

"use client";

import { useTranslation } from "@/lib/i18n/react";
import type { FieldMeta } from "@/lib/debug/schema-introspect";
import { PlusIcon, XIcon } from "lucide-react";
import { buildDefaults } from "./schema-form";

export interface FieldControlProps {
	field: FieldMeta;
	value: unknown;
	onChange: (value: unknown) => void;
}

export function FieldControl({ field, value, onChange }: FieldControlProps) {
	switch (field.type) {
		case "boolean":
			return <BooleanField field={field} value={value} onChange={onChange} />;
		case "enum":
			return <EnumField field={field} value={value} onChange={onChange} />;
		case "number":
			return <NumberField field={field} value={value} onChange={onChange} />;
		case "array":
			return <ArrayField field={field} value={value} onChange={onChange} />;
		case "object":
			return <ObjectField field={field} value={value} onChange={onChange} />;
		default:
			return <StringField field={field} value={value} onChange={onChange} />;
	}
}

function FieldLabel({ field }: { field: FieldMeta }) {
	return (
		<div className="flex items-baseline gap-1.5">
			<label className="text-xs font-medium font-mono">{field.name}</label>
			{field.description && (
				<span className="text-[10px] text-muted-foreground truncate">
					{field.description}
				</span>
			)}
		</div>
	);
}

function StringField({ field, value, onChange }: FieldControlProps) {
	return (
		<div className="space-y-1">
			<FieldLabel field={field} />
			<input
				type="text"
				value={typeof value === "string" ? value : ""}
				onChange={(e) => onChange(e.target.value || undefined)}
				placeholder={
					field.defaultValue !== undefined
						? String(field.defaultValue)
						: field.description ?? ""
				}
				className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/40"
			/>
		</div>
	);
}

function NumberField({ field, value, onChange }: FieldControlProps) {
	const placeholder =
		field.defaultValue !== undefined ? String(field.defaultValue) : "";

	return (
		<div className="space-y-1">
			<FieldLabel field={field} />
			<input
				type="number"
				value={typeof value === "number" ? value : ""}
				onChange={(e) => {
					const v = e.target.value;
					onChange(v === "" ? undefined : Number(v));
				}}
				placeholder={placeholder}
				className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
			/>
		</div>
	);
}

function BooleanField({ field, value, onChange }: FieldControlProps) {
	const checked = typeof value === "boolean" ? value : field.defaultValue === true;

	return (
		<div className="flex items-center gap-2">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="size-3.5 rounded border-border accent-primary cursor-pointer"
			/>
			<label className="text-xs font-medium font-mono cursor-pointer" onClick={() => onChange(!checked)}>
				{field.name}
			</label>
			{field.description && (
				<span className="text-[10px] text-muted-foreground truncate">
					{field.description}
				</span>
			)}
		</div>
	);
}

function EnumField({ field, value, onChange }: FieldControlProps) {
	const { t } = useTranslation();
	const options = field.enumValues ?? [];

	return (
		<div className="space-y-1">
			<FieldLabel field={field} />
			<select
				value={typeof value === "string" ? value : ""}
				onChange={(e) => onChange(e.target.value || undefined)}
				className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/40"
			>
				{!field.required && <option value="">{t("debug.unset")}</option>}
				{options.map((opt) => (
					<option key={opt} value={opt}>
						{opt}
					</option>
				))}
			</select>
		</div>
	);
}

function ArrayField({ field, value, onChange }: FieldControlProps) {
	const { t } = useTranslation();
	const items = Array.isArray(value) ? value : [];

	const addItem = () => {
		const newItem = field.items?.type === "object"
			? buildDefaults(field.items.fields ?? [])
			: "";
		onChange([...items, newItem]);
	};

	const removeItem = (index: number) => {
		onChange(items.filter((_, i) => i !== index));
	};

	const updateItem = (index: number, val: unknown) => {
		const next = [...items];
		next[index] = val;
		onChange(next);
	};

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<FieldLabel field={field} />
				<button
					type="button"
					onClick={addItem}
					className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-accent transition-colors"
				>
					<PlusIcon className="size-3" />
					{t("debug.add")}
				</button>
			</div>
			{items.map((item, i) => (
				<div key={i} className="relative rounded-md border border-border/40 bg-muted/20 p-2">
					<button
						type="button"
						onClick={() => removeItem(i)}
						className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
					>
						<XIcon className="size-3" />
					</button>
					{field.items?.type === "object" && field.items.fields ? (
						<div className="space-y-2 pr-5">
							{field.items.fields.map((subField) => (
								<FieldControl
									key={subField.name}
									field={subField}
									value={
										typeof item === "object" && item !== null
											? (item as Record<string, unknown>)[subField.name]
											: undefined
									}
									onChange={(v) => {
										const obj = typeof item === "object" && item !== null
											? { ...(item as Record<string, unknown>) }
											: {};
										if (v === undefined) {
											delete obj[subField.name];
										} else {
											obj[subField.name] = v;
										}
										updateItem(i, obj);
									}}
								/>
							))}
						</div>
					) : (
						<input
							type="text"
							value={typeof item === "string" ? item : JSON.stringify(item)}
							onChange={(e) => updateItem(i, e.target.value)}
							className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 pr-5"
						/>
					)}
				</div>
			))}
			{items.length === 0 && (
				<p className="text-[10px] text-muted-foreground italic px-1">
					{t("debug.addItem")}
				</p>
			)}
		</div>
	);
}

function ObjectField({ field, value, onChange }: FieldControlProps) {
	const obj = typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};

	if (!field.fields?.length) {
		return <StringField field={field} value={JSON.stringify(obj)} onChange={onChange} />;
	}

	return (
		<div className="space-y-1.5">
			<FieldLabel field={field} />
			<div className="rounded-md border border-border/40 bg-muted/10 p-2 space-y-2">
				{field.fields.map((subField) => (
					<FieldControl
						key={subField.name}
						field={subField}
						value={obj[subField.name]}
						onChange={(v) => {
							const next = { ...obj };
							if (v === undefined) {
								delete next[subField.name];
							} else {
								next[subField.name] = v;
							}
							onChange(next);
						}}
					/>
				))}
			</div>
		</div>
	);
}

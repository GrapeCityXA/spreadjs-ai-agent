import type { z } from "zod/v4";

/** Field metadata extracted from a Zod schema for form rendering */
export interface FieldMeta {
	name: string;
	type: "string" | "number" | "boolean" | "enum" | "array" | "object" | "union" | "unknown";
	description?: string;
	required: boolean;
	defaultValue?: unknown;
	enumValues?: string[];
	/** For arrays: describes each item */
	items?: FieldMeta;
	/** For objects: child fields */
	fields?: FieldMeta[];
}

/**
 * Walk a Zod object schema and extract FieldMeta[] for form generation.
 * Only handles the top-level object shape — nested objects/arrays recurse.
 */
export function introspectSchema(schema: z.ZodType): FieldMeta[] {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const def = (schema as any)?._zod?.def ?? (schema as any)?.def;
	if (!def || def.type !== "object" || !def.shape) return [];

	const fields: FieldMeta[] = [];
	for (const [key, val] of Object.entries(def.shape)) {
		fields.push(extractField(key, val));
	}
	return fields;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractField(name: string, schema: any): FieldMeta {
	const info = unwrap(schema);
	const description =
		typeof info.description === "string" && /[\u4e00-\u9fff]/.test(info.description)
			? undefined
			: info.description;

	const base: FieldMeta = {
		name,
		type: "unknown",
		required: info.required,
		description,
		defaultValue: info.defaultValue,
	};

	const def = info.innerDef;
	if (!def) return base;

	switch (def.type) {
		case "string":
			return { ...base, type: "string" };
		case "number":
			return { ...base, type: "number" };
		case "boolean":
			return { ...base, type: "boolean" };
		case "enum": {
			const entries = def.entries;
			if (entries) {
				base.enumValues = Object.keys(entries);
			}
			return { ...base, type: "enum" };
		}
		case "literal":
			return { ...base, type: "string", defaultValue: def.value };
		case "array": {
			const itemSchema = def.element ?? def.type_?.element;
			const items = itemSchema ? extractField("item", itemSchema) : undefined;
			return { ...base, type: "array", items };
		}
		case "object": {
			const fields: FieldMeta[] = [];
			if (def.shape) {
				for (const [key, val] of Object.entries(def.shape)) {
					fields.push(extractField(key, val));
				}
			}
			return { ...base, type: "object", fields };
		}
		case "union":
		case "discriminatedUnion": {
			// Try to simplify: if all options are primitives, treat as enum
			const options = def.options as unknown[];
			if (options?.length) {
				const types = options.map((o) => getDefType(o));
				const uniqueTypes = [...new Set(types)];
				if (uniqueTypes.length === 1 && uniqueTypes[0] === "string") {
					return { ...base, type: "string" };
				}
				if (uniqueTypes.every((t) => t === "string" || t === "number")) {
					return { ...base, type: "string" };
				}
			}
			return { ...base, type: "union" };
		}
		default:
			return base;
	}
}

interface UnwrapResult {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	innerDef: any;
	required: boolean;
	description?: string;
	defaultValue?: unknown;
}

/** Unwrap optional/nullable/default/describe wrappers to reach the inner type */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(schema: any): UnwrapResult {
	let required = true;
	let description: string | undefined;
	let defaultValue: unknown;

	// Walk through the Zod 4 schema chain
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let current: any = schema;
	for (let depth = 0; depth < 10; depth++) {
		const def = current?._zod?.def ?? current?.def;
		if (!def) break;

		// Zod 4: description is a property accessor, not on def
		if (!description) {
			const propDesc = current?.description;
			if (typeof propDesc === "string" && propDesc) description = propDesc;
			if (typeof def.description === "string" && def.description) description = def.description;
		}

		if (def.type === "optional" || def.type === "nullable") {
			required = false;
			current = def.innerType;
			continue;
		}
		if (def.type === "default") {
			required = false;
			defaultValue = def.defaultValue;
			current = def.innerType;
			continue;
		}

		return { innerDef: def, required, description, defaultValue };
	}

	return { innerDef: null, required, description, defaultValue };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDefType(schema: any): string | null {
	const def = schema?._zod?.def ?? schema?.def;
	return def?.type ?? null;
}

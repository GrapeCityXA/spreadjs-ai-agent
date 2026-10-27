/** Designer 字体下拉中需要额外提供的中文字体 */
export const CUSTOM_DESIGNER_FONTS = [
	{ value: "宋体", text: "宋体" },
	{ value: "黑体", text: "黑体" },
	{ value: "楷体", text: "楷体" },
	{ value: "隶书", text: "隶书" },
] as const;

interface FontOption {
	value: string;
	text: string;
}

interface DesignerLike {
	getCommand?: (name: string) => unknown;
	getTemplate?: (name: string) => unknown;
	registerTemplate?: (name: string, template: unknown) => void;
	TemplateNames?: { FormatDialogTemplate?: string };
}

/** 默认字体列表里出现这些值，就认为找到了格式对话框的字体选择框 */
const FONT_VALUE_HINTS = new Set([
	"Arial",
	"Calibri",
	"Times New Roman",
	"Courier New",
	"宋体",
	"黑体",
	"楷体",
	"隶书",
]);

let formatDialogRegistered = false;

/** 把中文字体插到工具栏 fontFamily 下拉框最前面 */
export function withCustomFontFamilies<T extends { commandMap?: Record<string, unknown> }>(
	designer: unknown,
	config: T,
): T {
	const d = designer as DesignerLike;
	const base = d.getCommand?.("fontFamily") as
		| { dropdownList?: FontOption[] }
		| undefined;
	if (!base) return config;

	const existing = base.dropdownList ?? [];
	const existingValues = new Set(existing.map((item) => item.value));
	const missing = CUSTOM_DESIGNER_FONTS.filter((item) => !existingValues.has(item.value));
	if (missing.length === 0) return config;

	return {
		...config,
		commandMap: {
			...config.commandMap,
			fontFamily: {
				...base,
				dropdownList: [...missing.map((item) => ({ ...item })), ...existing],
			},
		},
	};
}

/** 把中文字体加到“设置单元格格式”对话框的字体列表 */
export function registerCustomFontsInFormatDialog(designer: unknown): void {
	if (formatDialogRegistered) return;

	const d = designer as DesignerLike;
	const templateName = d.TemplateNames?.FormatDialogTemplate;
	if (!templateName || !d.getTemplate || !d.registerTemplate) return;

	const template = d.getTemplate(templateName);
	if (!template) return;

	const items = findFontItems(template);
	if (!items) return;

	const existing = new Set(items.map((item) => item.value));
	const missing = CUSTOM_DESIGNER_FONTS.filter((item) => !existing.has(item.value));
	if (missing.length > 0) {
		items.unshift(...missing.map((item) => ({ ...item })));
		d.registerTemplate(templateName, template);
	}
	formatDialogRegistered = true;
}

/** 把中文字体加到 Designer 资源里的字体表（富文本 / 图表等入口共用） */
export function addCustomFontsToResources(resources: object): void {
	const ribbon = (resources as {
		ribbon?: { fontFamilies?: Record<string, { name?: string; text?: string }> };
	}).ribbon;
	if (!ribbon?.fontFamilies) return;

	const customNames = new Set<string>(CUSTOM_DESIGNER_FONTS.map((item) => item.value));
	const existing = Object.values(ribbon.fontFamilies).filter(
		(item) => !customNames.has(item?.name ?? ""),
	);

	const merged = [
		...CUSTOM_DESIGNER_FONTS.map((item) => ({ name: item.value, text: item.text })),
		...existing,
	];

	ribbon.fontFamilies = {};
	merged.forEach((item, index) => {
		ribbon.fontFamilies![`ff${index + 1}`] = item;
	});
}

/** 在模板树里递归找字体选择框，避免依赖易变的 children 下标路径 */
function findFontItems(node: unknown, depth = 0): FontOption[] | null {
	if (node == null || typeof node !== "object" || depth > 20) return null;

	const record = node as { items?: unknown };
	if (Array.isArray(record.items)) {
		const items = record.items as Array<{ value?: unknown }>;
		if (items.some((item) => typeof item?.value === "string" && FONT_VALUE_HINTS.has(item.value))) {
			return record.items as FontOption[];
		}
	}

	for (const value of Object.values(node as Record<string, unknown>)) {
		const found = findFontItems(value, depth + 1);
		if (found) return found;
	}

	return null;
}

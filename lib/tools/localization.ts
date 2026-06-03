import { jsonSchema } from "ai";
import { z } from "zod/v4";
import { DEFAULT_LOCALE, humanizeSnakeCase, normalizeLocale, type AppLocale } from "@/lib/i18n";
import type { ToolDef } from "./types";

type ToolText = {
	displayName: string;
	description: string;
};

const EN_TOOL_TEXT: Record<string, ToolText> = {
	read_ranges: { displayName: "Read Ranges", description: "Read values, formulas, and formatted text from one or more ranges." },
	write_data: { displayName: "Write Data", description: "Write a 2D array of values or formulas into a worksheet range." },
	clear_cells: { displayName: "Clear Cells", description: "Clear values, formulas, formats, styles, or comments from a range." },
	search_data: { displayName: "Search Data", description: "Search worksheet data by keyword, pattern, or exact value." },
	sort_range: { displayName: "Sort Range", description: "Sort a range or table by one or more sort keys." },
	set_cell: { displayName: "Set Cell", description: "Write a single value or formula into one cell." },
	auto_fill: { displayName: "Auto Fill", description: "Extend values, formulas, or series from a source range into a destination range." },
	find_and_replace: { displayName: "Find And Replace", description: "Find matching cells and optionally replace the matches." },
	filter_range_or_table: { displayName: "Filter Range Or Table", description: "Apply or clear filter conditions on a range or a table." },
	get_workbook_metadata: { displayName: "Get Workbook Metadata", description: "Get workbook-level metadata such as sheet names, sizes, and used ranges." },
	create_worksheet: { displayName: "Create Worksheet", description: "Create a new worksheet at an optional position." },
	rename_worksheet: { displayName: "Rename Worksheet", description: "Rename an existing worksheet." },
	delete_worksheet: { displayName: "Delete Worksheet", description: "Delete a worksheet and all of its contents." },
	insert_rows_cols: { displayName: "Insert Rows Or Columns", description: "Insert blank rows or columns before a target index." },
	delete_rows_cols: { displayName: "Delete Rows Or Columns", description: "Delete rows or columns starting at a target index." },
	resize_range: { displayName: "Resize Rows Or Columns", description: "Set row heights or column widths for a target range." },
	auto_fit_columns: { displayName: "Auto Fit Columns", description: "Auto fit column widths and optionally row heights based on cell contents." },
	freeze_panes: { displayName: "Freeze Panes", description: "Freeze or unfreeze rows and columns in a worksheet." },
	change_active_sheet: { displayName: "Change Active Sheet", description: "Switch the active worksheet." },
	copy_sheet: { displayName: "Copy Sheet", description: "Copy a worksheet into a new worksheet." },
	move_sheet: { displayName: "Move Sheet", description: "Move a worksheet to another index." },
	hide_show_sheet: { displayName: "Set Sheet Visibility", description: "Set a worksheet to visible, hidden, or veryHidden." },
	protect_sheet: { displayName: "Protect Sheet", description: "Protect or unprotect a worksheet, optionally with a password." },
	set_tab_color: { displayName: "Set Tab Color", description: "Change the tab color of a worksheet." },
	format_range: { displayName: "Format Range", description: "Apply fonts, colors, alignment, number formats, and borders to a range." },
	add_highlight_rule: { displayName: "Add Highlight Rule", description: "Add a highlight-style conditional formatting rule to a range." },
	add_color_scale: { displayName: "Add Color Scale", description: "Add a color scale conditional formatting rule to a range." },
	add_data_bar: { displayName: "Add Data Bar", description: "Add a data bar conditional formatting rule to a range." },
	add_icon_set: { displayName: "Add Icon Set", description: "Add an icon set conditional formatting rule to a range." },
	get_cell_format: { displayName: "Get Cell Format", description: "Read the effective formatting of a cell or range." },
	merge_cells: { displayName: "Merge Cells", description: "Merge or unmerge cells in a target range." },
	add_chart: { displayName: "Add Chart", description: "Create a new chart from a data range." },
	add_pivot_table: { displayName: "Add Pivot Table", description: "Create a pivot table from a table name or an absolute range formula such as =Sheet1!$A$1:$D$11. Use this after manage_pivot." },
	get_all_objects: { displayName: "Get All Objects", description: "List charts and pivot tables in the workbook or a worksheet." },
	modify_chart: { displayName: "Modify Chart", description: "Update an existing chart's type, title, size, position, or data source." },
	remove_chart: { displayName: "Remove Chart", description: "Delete an existing chart." },
	modify_pivot_table: { displayName: "Modify Pivot Table", description: "Update fields in an existing pivot table." },
	remove_pivot_table: { displayName: "Remove Pivot Table", description: "Delete an existing pivot table." },
	import_file: { displayName: "Import File", description: "Import an uploaded file such as xlsx, csv, ssjson, or sjs into the workbook." },
	export_file: { displayName: "Export File", description: "Export the current workbook as xlsx, csv, pdf, or sjs." },
	goal_seek: { displayName: "Goal Seek", description: "Run goal seek on a formula cell by changing another cell." },
	trace_dependencies: { displayName: "Trace Dependencies", description: "Trace formula precedents and dependents for a target cell." },
	add_tasks: { displayName: "Add Tasks", description: "Create a step-by-step task plan for a complex request." },
	complete_task: { displayName: "Complete Task", description: "Mark one task as complete and advance the task plan." },
	ask_user: { displayName: "Ask User", description: "Ask the user to choose between several options and pause the workflow." },
	web_search: { displayName: "Web Search", description: "Search the web and return concise results for external information lookup." },
	fetch_url: { displayName: "Fetch URL", description: "Read and summarize the contents of a web page." },
	execute_code: { displayName: "Execute Code", description: "Execute generated SpreadJS code in the browser sandbox for advanced operations." },
	exit_module: { displayName: "Exit Module", description: "Exit the current module and return to the base tool set." },
	add_validation: { displayName: "Add Validation", description: "Add a data validation rule to a range." },
	remove_validation: { displayName: "Remove Validation", description: "Remove data validation rules from a range." },
	get_validation: { displayName: "Get Validation", description: "Inspect data validation rules on a range." },
	add_table: { displayName: "Add Table", description: "Create a table from a worksheet range." },
	remove_table: { displayName: "Remove Table", description: "Delete a table and optionally remove its data." },
	set_table_style: { displayName: "Set Table Style", description: "Apply a built-in style to a table." },
	set_table_option: { displayName: "Set Table Option", description: "Update table options such as banding, headers, totals, or filter buttons." },
	get_table_info: { displayName: "Get Table Info", description: "Read metadata and options for an existing table." },
	set_hyperlink: { displayName: "Set Hyperlink", description: "Add or update a hyperlink in a cell." },
	remove_hyperlink: { displayName: "Remove Hyperlink", description: "Remove a hyperlink from a cell." },
	get_hyperlinks: { displayName: "Get Hyperlinks", description: "List hyperlinks in a worksheet or range." },
	set_cell_type: { displayName: "Set Cell Type", description: "Assign a custom cell type such as checkbox, button, or combobox." },
	remove_cell_type: { displayName: "Remove Cell Type", description: "Remove a custom cell type from a range." },
	get_cell_type: { displayName: "Get Cell Type", description: "Inspect custom cell types in a range." },
	add_comment: { displayName: "Add Comment", description: "Add a comment to a cell." },
	edit_comment: { displayName: "Edit Comment", description: "Update the contents of an existing comment." },
	remove_comment: { displayName: "Remove Comment", description: "Delete a comment from a cell." },
	get_comments: { displayName: "Get Comments", description: "List comments in a worksheet or range." },
	add_cell_state: { displayName: "Add Cell State", description: "Apply a cell-state style such as hover, active, or dirty." },
	remove_cell_state: { displayName: "Remove Cell State", description: "Clear cell-state styles from a range." },
	get_cell_states: { displayName: "Get Cell States", description: "Read configured cell-state styles from a worksheet." },
	add_shape: { displayName: "Add Shape", description: "Insert a built-in shape into a worksheet." },
	modify_shape: { displayName: "Modify Shape", description: "Update the size, position, or style of an existing shape." },
	remove_shape: { displayName: "Remove Shape", description: "Delete an existing shape or picture." },
	add_image: { displayName: "Add Image From URL", description: "Insert an image from a URL into a worksheet." },
	add_picture: { displayName: "Add Picture", description: "Insert an uploaded or base64-encoded image into a worksheet." },
	add_slicer: { displayName: "Add Slicer", description: "Create a slicer for a table or pivot table." },
	modify_slicer: { displayName: "Modify Slicer", description: "Update the size, position, style, or behavior of an existing slicer." },
	remove_slicer: { displayName: "Remove Slicer", description: "Delete an existing slicer." },
	manage_chart: { displayName: "Manage Charts", description: "Enter chart mode to create, inspect, update, or remove charts. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_pivot: { displayName: "Manage Pivot Tables", description: "Enter pivot-table mode. Call this first; the next step will expose add_pivot_table, modify_pivot_table, and remove_pivot_table. Do not assume pivot sub-tools are unavailable before calling this gateway." },
	manage_format: { displayName: "Manage Formatting", description: "Enter formatting mode for style-related tools. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_conditional_formatting: { displayName: "Manage Conditional Formatting", description: "Enter conditional-formatting mode for highlight rules, scales, bars, and icon sets. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_table: { displayName: "Manage Tables", description: "Enter table mode to create or modify structured tables. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_validation: { displayName: "Manage Validation", description: "Enter validation mode for data-validation rules. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_comment: { displayName: "Manage Comments", description: "Enter comment mode to add, edit, inspect, or remove comments. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_cell_state: { displayName: "Manage Cell States", description: "Enter cell-state mode for interactive cell-state styles. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_cell_type: { displayName: "Manage Cell Types", description: "Enter cell-type mode for checkboxes, buttons, and other custom types. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_shape: { displayName: "Manage Shapes", description: "Enter shape mode to insert or modify shapes and images. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_hyperlink: { displayName: "Manage Hyperlinks", description: "Enter hyperlink mode to add, inspect, or remove hyperlinks. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
	manage_slicer: { displayName: "Manage Slicers", description: "Enter slicer mode to create or modify slicers. Call this first; the next step will expose this module's sub-tools. Do not assume sub-tools are unavailable before calling this gateway." },
};

function stripDescriptions(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripDescriptions);
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	const result: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (key === "description") continue;
		result[key] = stripDescriptions(entry);
	}
	return result;
}

export function getLocalizedToolText(
	tool: Pick<ToolDef, "name" | "displayName" | "description">,
	locale: AppLocale = DEFAULT_LOCALE,
): ToolText {
	if (normalizeLocale(locale) === "zh-CN") {
		return {
			displayName: tool.displayName,
			description: tool.description,
		};
	}

	return EN_TOOL_TEXT[tool.name] ?? {
		displayName: humanizeSnakeCase(tool.name),
		description: `Use the ${humanizeSnakeCase(tool.name)} tool.`,
	};
}

export function getLocalizedToolInputSchema(
	inputSchema: ToolDef["inputSchema"],
	locale: AppLocale = DEFAULT_LOCALE,
): ToolDef["inputSchema"] | ReturnType<typeof jsonSchema> {
	if (normalizeLocale(locale) === "zh-CN") {
		return inputSchema;
	}

	return jsonSchema(stripDescriptions(z.toJSONSchema(inputSchema)) as Record<string, unknown>);
}

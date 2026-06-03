"use client";

import { useMemo, useState } from "react";
import { RotateCcwIcon, SunIcon, MoonIcon, MonitorIcon, Trash2Icon } from "lucide-react";
import type { McpServerStatus } from "@/lib/mcp/types";
import { type AppSettings, type ThemeMode, DEFAULT_SETTINGS } from "@/lib/hooks/useSettings";
import { CHAT_PANEL_WIDTH } from "@/lib/config";
import { McpSettings } from "@/components/mcp-settings";
import { useTranslation } from "@/lib/i18n/react";

interface SettingsPanelProps {
	settings: AppSettings;
	onUpdateSettings: (patch: Partial<AppSettings>) => void;
	chatPanelWidth?: number;
	onChatPanelWidthChange?: (width: number) => void;
	onClearAutoSave?: () => Promise<void>;
	autoSaveExists?: boolean;
	mcpServers: McpServerStatus[];
	mcpLoading: boolean;
	mcpError: string | null;
	mcpConfigJson: string;
	onMcpSaveAndConnect: (json: string) => Promise<void>;
	onMcpToggleServer: (name: string, enabled: boolean) => Promise<void>;
	onMcpDisconnectAll: () => Promise<void>;
	onMcpAuthorize?: (name: string) => Promise<void>;
}

type Tab = "general" | "mcp";

export function SettingsPanel({
	settings,
	onUpdateSettings,
	chatPanelWidth,
	onChatPanelWidthChange,
	onClearAutoSave,
	autoSaveExists,
	mcpServers,
	mcpLoading,
	mcpError,
	mcpConfigJson,
	onMcpSaveAndConnect,
	onMcpToggleServer,
	onMcpDisconnectAll,
	onMcpAuthorize,
}: SettingsPanelProps) {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState<Tab>("general");

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-1 border-b border-border/60 px-4 pb-0 pt-3">
				<TabButton active={activeTab === "general"} onClick={() => setActiveTab("general")}>
					{t("settings.tab.general")}
				</TabButton>
				<TabButton active={activeTab === "mcp"} onClick={() => setActiveTab("mcp")}>
					{t("settings.tab.mcp")}
				</TabButton>
			</div>

			<div className="flex-1 overflow-y-auto chat-scrollbar">
				{activeTab === "general" && (
					<GeneralSettings
						settings={settings}
						onUpdate={onUpdateSettings}
						chatPanelWidth={chatPanelWidth}
						onChatPanelWidthChange={onChatPanelWidthChange}
						onClearAutoSave={onClearAutoSave}
						autoSaveExists={autoSaveExists}
					/>
				)}
				{activeTab === "mcp" && (
					<McpSettings
						key={mcpConfigJson || "default-mcp-config"}
						servers={mcpServers}
						loading={mcpLoading}
						error={mcpError}
						configJson={mcpConfigJson}
						onSaveAndConnect={onMcpSaveAndConnect}
						onToggleServer={onMcpToggleServer}
						onDisconnectAll={onMcpDisconnectAll}
						onAuthorize={onMcpAuthorize}
					/>
				)}
			</div>
		</div>
	);
}

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 800;

function GeneralSettings({
	settings,
	onUpdate,
	chatPanelWidth,
	onChatPanelWidthChange,
	onClearAutoSave,
	autoSaveExists,
}: {
	settings: AppSettings;
	onUpdate: (patch: Partial<AppSettings>) => void;
	chatPanelWidth?: number;
	onChatPanelWidthChange?: (width: number) => void;
	onClearAutoSave?: () => Promise<void>;
	autoSaveExists?: boolean;
}) {
	const { t } = useTranslation();
	const isDefaultSteps = settings.maxAutoSteps === DEFAULT_SETTINGS.maxAutoSteps;
	const isDefaultWidth = chatPanelWidth === CHAT_PANEL_WIDTH;
	const isDefaultTheme = settings.theme === DEFAULT_SETTINGS.theme;
	const resetLabel = t("common.reset");

	return (
		<div className="flex flex-col gap-5 p-4">
			<h3 className="text-sm font-semibold text-foreground">{t("settings.title")}</h3>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<label className="text-xs font-medium text-foreground" htmlFor="theme-mode">
						{t("settings.theme.label")}
					</label>
					{!isDefaultTheme && (
						<ResetButton label={resetLabel} onClick={() => onUpdate({ theme: DEFAULT_SETTINGS.theme })} />
					)}
				</div>
				<p className="text-xs text-muted-foreground">{t("settings.theme.description")}</p>
				<ThemeSelector value={settings.theme} onChange={(theme) => onUpdate({ theme })} />
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-xs font-medium text-foreground" htmlFor="locale">
					{t("settings.language.label")}
				</label>
				<p className="text-xs text-muted-foreground">{t("settings.language.description")}</p>
				<select
					id="locale"
					value={settings.locale}
					onChange={(e) => onUpdate({ locale: e.target.value as AppSettings["locale"] })}
					className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
				>
					<option value="en">{t("settings.language.en")}</option>
					<option value="zh-CN">{t("settings.language.zh")}</option>
				</select>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<label className="text-xs font-medium text-foreground" htmlFor="max-auto-steps">
						{t("settings.maxAutoSteps.label")}
					</label>
					<div className="flex items-center gap-2">
						{!isDefaultSteps && (
							<ResetButton
								label={resetLabel}
								onClick={() => onUpdate({ maxAutoSteps: DEFAULT_SETTINGS.maxAutoSteps })}
							/>
						)}
						<input
							id="max-auto-steps"
							type="number"
							min={1}
							max={100}
							value={settings.maxAutoSteps}
							onChange={(e) => {
								const next = parseInt(e.target.value, 10);
								if (!Number.isNaN(next) && next >= 1 && next <= 100) {
									onUpdate({ maxAutoSteps: next });
								}
							}}
							className="h-7 w-16 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
						/>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{t("settings.maxAutoSteps.description")}</p>
			</div>

			<ToggleRow
				description={t("settings.autoRestore.description")}
				id="auto-restore-session"
				label={t("settings.autoRestore.label")}
				value={settings.autoRestoreSession}
				onToggle={() => onUpdate({ autoRestoreSession: !settings.autoRestoreSession })}
			/>

			<div className="flex flex-col gap-2">
				<ToggleRow
					description={t("settings.autoSave.description")}
					id="auto-save"
					label={t("settings.autoSave.label")}
					value={settings.autoSave}
					onToggle={() => onUpdate({ autoSave: !settings.autoSave })}
				/>
				{settings.autoSave && onClearAutoSave && (
					<button
						type="button"
						onClick={onClearAutoSave}
						disabled={!autoSaveExists}
						className="inline-flex items-center gap-1.5 self-start rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
					>
						<Trash2Icon className="size-3.5" />
						{t("settings.autoSave.clear")}
					</button>
				)}
			</div>

			<ToggleRow
				description={t("settings.skipConfirm.description")}
				id="allow-all-destructive"
				label={t("settings.skipConfirm.label")}
				value={settings.allowAllDestructive}
				onToggle={() => onUpdate({ allowAllDestructive: !settings.allowAllDestructive })}
			/>

			<ToggleRow
				description={t("settings.showContext.description")}
				id="show-context-usage"
				label={t("settings.showContext.label")}
				value={settings.showContextUsage}
				onToggle={() => onUpdate({ showContextUsage: !settings.showContextUsage })}
			/>

			{chatPanelWidth != null && onChatPanelWidthChange && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<label className="text-xs font-medium text-foreground" htmlFor="chat-panel-width">
							{t("settings.chatWidth.label")}
						</label>
						<div className="flex items-center gap-2">
							{!isDefaultWidth && (
								<ResetButton label={resetLabel} onClick={() => onChatPanelWidthChange(CHAT_PANEL_WIDTH)} />
							)}
							<input
								id="chat-panel-width"
								type="number"
								min={MIN_PANEL_WIDTH}
								max={MAX_PANEL_WIDTH}
								step={10}
								value={chatPanelWidth}
								onChange={(e) => {
									const next = parseInt(e.target.value, 10);
									if (!Number.isNaN(next) && next >= MIN_PANEL_WIDTH && next <= MAX_PANEL_WIDTH) {
										onChatPanelWidthChange(next);
									}
								}}
								className="h-7 w-16 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">{t("settings.chatWidth.description")}</p>
				</div>
			)}
		</div>
	);
}

function ToggleRow({
	description,
	id,
	label,
	onToggle,
	value,
}: {
	description: string;
	id: string;
	label: string;
	onToggle: () => void;
	value: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<label className="text-xs font-medium text-foreground" htmlFor={id}>
					{label}
				</label>
				<button
					id={id}
					type="button"
					role="switch"
					aria-checked={value}
					onClick={onToggle}
					className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
						value ? "bg-primary" : "bg-input"
					}`}
				>
					<span
						className={`pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${
							value ? "translate-x-4" : "translate-x-0"
						}`}
					/>
				</button>
			</div>
			<p className="text-xs text-muted-foreground">{description}</p>
		</div>
	);
}

function ThemeSelector({ value, onChange }: { value: ThemeMode; onChange: (theme: ThemeMode) => void }) {
	const { t } = useTranslation();
	const options = useMemo(
		() => [
			{ value: "light" as const, label: t("settings.theme.light"), icon: <SunIcon className="size-3.5" /> },
			{ value: "dark" as const, label: t("settings.theme.dark"), icon: <MoonIcon className="size-3.5" /> },
			{ value: "system" as const, label: t("settings.theme.system"), icon: <MonitorIcon className="size-3.5" /> },
		],
		[t],
	);

	return (
		<div className="flex rounded-md border border-input bg-background p-0.5 shadow-sm">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm py-1.5 text-xs font-medium transition-colors ${
						value === option.value
							? "bg-primary text-primary-foreground shadow-sm"
							: "text-muted-foreground hover:bg-accent hover:text-foreground"
					}`}
				>
					{option.icon}
					{option.label}
				</button>
			))}
		</div>
	);
}

function ResetButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<RotateCcwIcon className="size-3" />
			{label}
		</button>
	);
}

function TabButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`relative px-3 py-2 text-xs font-medium transition-colors ${
				active
					? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			{children}
		</button>
	);
}

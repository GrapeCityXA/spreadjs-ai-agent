"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JsonEditor } from "@/components/ui/json-editor";
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { McpServerStatus } from "@/lib/mcp/types";
import { DEFAULT_MCP_CONFIG } from "@/lib/hooks/useMcpServers";
import { useTranslation } from "@/lib/i18n/react";
import { ChevronRightIcon, KeyRoundIcon } from "lucide-react";

interface McpSettingsProps {
	servers: McpServerStatus[];
	loading: boolean;
	error: string | null;
	configJson: string;
	onSaveAndConnect: (json: string) => Promise<void>;
	onToggleServer: (name: string, enabled: boolean) => Promise<void>;
	onDisconnectAll: () => Promise<void>;
	onAuthorize?: (name: string) => Promise<void>;
}

export function McpSettings({
	servers,
	loading,
	error,
	configJson,
	onSaveAndConnect,
	onToggleServer,
	onDisconnectAll,
	onAuthorize,
}: McpSettingsProps) {
	const { t } = useTranslation();
	const [code, setCode] = useState(() => configJson || DEFAULT_MCP_CONFIG);
	const [localError, setLocalError] = useState<string | null>(null);

	const handleSave = async () => {
		setLocalError(null);
		try {
			await onSaveAndConnect(code);
		} catch (e) {
			setLocalError(e instanceof Error ? e.message : String(e));
		}
	};

	const handleDisconnect = async () => {
		setLocalError(null);
		try {
			await onDisconnectAll();
			setCode(DEFAULT_MCP_CONFIG);
		} catch (e) {
			setLocalError(e instanceof Error ? e.message : String(e));
		}
	};

	const displayError = localError ?? error;

	return (
		<div className="flex flex-col gap-4 p-4">
			<h3 className="text-sm font-semibold text-foreground">{t("mcp.title")}</h3>

			<JsonEditor
				value={code}
				onChange={setCode}
				minHeight="240px"
				maxHeight="384px"
				error={displayError ?? undefined}
			/>

			<div className="flex gap-2">
				<Button size="sm" onClick={handleSave} disabled={loading}>
					{loading ? <Spinner className="mr-1" /> : null}
					{t("mcp.saveConnect")}
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handleDisconnect}
					disabled={loading || servers.length === 0}
				>
					{t("mcp.disconnectAll")}
				</Button>
			</div>

			{servers.length > 0 && (
				<div className="flex flex-col gap-2">
					<h4 className="text-xs font-medium text-muted-foreground">{t("mcp.connectionStatus")}</h4>
					{servers.map((server) => (
						<ServerCard
							key={server.name}
							server={server}
							onToggle={onToggleServer}
							onAuthorize={onAuthorize}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function ServerCard({
	server,
	onToggle,
	onAuthorize,
}: {
	server: McpServerStatus;
	onToggle: (name: string, enabled: boolean) => Promise<void>;
	onAuthorize?: (name: string) => Promise<void>;
}) {
	const { t } = useTranslation();
	const dotColor = !server.enabled
		? "bg-muted-foreground/40"
		: server.connected
			? "bg-emerald-500"
			: "bg-destructive";
	const needsAuth = server.oauthStatus === "unauthorized" || server.oauthStatus === "expired";
	const toolCount = t("mcp.toolsCount", { count: server.toolCount });
	const columns = useMemo(
		() => ({
			name: t("mcp.name"),
			description: t("mcp.description"),
			parameters: t("mcp.parameters"),
		}),
		[t],
	);

	return (
		<Collapsible>
			<div className="rounded-md border border-border bg-card p-3">
				<div className="flex items-center justify-between">
					<CollapsibleTrigger className="group flex cursor-pointer items-center gap-2">
						<ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
						<span className={`size-2 rounded-full ${dotColor}`} />
						<span className="text-sm font-medium">{server.name}</span>
						{server.oauthStatus && <OAuthBadge status={server.oauthStatus} />}
					</CollapsibleTrigger>
					<div className="flex items-center gap-2">
						{needsAuth && onAuthorize && (
							<Button
								size="sm"
								variant="outline"
								className="h-6 gap-1 px-2 text-xs"
								onClick={() => onAuthorize(server.name)}
							>
								<KeyRoundIcon className="size-3" />
								{t("mcp.authorize")}
							</Button>
						)}
						<Badge variant="secondary" className="text-[10px]">
							{toolCount}
						</Badge>
						<button
							type="button"
							role="switch"
							aria-checked={server.enabled}
							onClick={() => onToggle(server.name, !server.enabled)}
							className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
								server.enabled ? "bg-primary" : "bg-muted"
							}`}
						>
							<span
								className={`pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform ${
									server.enabled ? "translate-x-4" : "translate-x-0"
								}`}
							/>
						</button>
					</div>
				</div>

				{server.error && (
					<p className="ml-7 mt-1 text-xs text-destructive">{server.error}</p>
				)}

				<CollapsibleContent>
					{server.tools.length > 0 ? (
						<div className="mt-2 overflow-x-auto">
							<table className="w-full border-collapse text-xs">
								<thead>
									<tr className="border-b border-border/50 text-muted-foreground/70">
										<th className="px-2 py-1.5 text-left font-medium">{columns.name}</th>
										<th className="px-2 py-1.5 text-left font-medium">{columns.description}</th>
										<th className="px-2 py-1.5 text-left font-medium">{columns.parameters}</th>
									</tr>
								</thead>
								<tbody>
									{server.tools.map((tool, index) => {
										const params = extractParamNames(tool.inputSchema);
										return (
											<tr key={`${server.name}:${tool.name}:${index}`} className="border-b border-border/30 last:border-0">
												<td className="whitespace-nowrap px-2 py-1.5 align-top font-mono text-foreground/80">
													{tool.name}
												</td>
												<td className="max-w-[200px] px-2 py-1.5 align-top text-muted-foreground/70">
													{tool.description ? (
														<TooltipProvider delayDuration={500}>
															<Tooltip>
																<TooltipTrigger asChild>
																	<span className="line-clamp-2 cursor-default">{tool.description}</span>
																</TooltipTrigger>
																<TooltipContent
																	side="top"
																	className="max-w-xs whitespace-normal border border-border bg-popover text-popover-foreground shadow-md [--tooltip-bg:var(--color-popover)]"
																>
																	{tool.description}
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													) : (
														<span>-</span>
													)}
												</td>
												<td className="px-2 py-1.5 align-top">
													{params.length > 0 ? (
														<span className="flex flex-wrap gap-1">
															{params.map((param) => (
																<span
																	key={param}
																	className="whitespace-nowrap rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
																>
																	{param}
																</span>
															))}
														</span>
													) : (
														<span className="text-muted-foreground/40">-</span>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					) : (
						<p className="ml-7 mt-2 text-xs text-muted-foreground">{t("mcp.noTools")}</p>
					)}
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

function OAuthBadge({ status }: { status: McpServerStatus["oauthStatus"] }) {
	const { t } = useTranslation();

	if (status === "authorized") {
		return (
			<Badge variant="secondary" className="bg-emerald-500/15 text-[10px] text-emerald-600">
				{t("mcp.oauth.authorized")}
			</Badge>
		);
	}
	if (status === "expired") {
		return (
			<Badge variant="secondary" className="bg-amber-500/15 text-[10px] text-amber-600">
				{t("mcp.oauth.expired")}
			</Badge>
		);
	}
	return (
		<Badge variant="secondary" className="bg-destructive/15 text-[10px] text-destructive">
			{t("mcp.oauth.unauthorized")}
		</Badge>
	);
}

function extractParamNames(schema: Record<string, unknown>): string[] {
	const props = schema?.properties;
	if (!props || typeof props !== "object") return [];
	return Object.keys(props as Record<string, unknown>);
}

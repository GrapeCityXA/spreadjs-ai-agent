"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/react";
import {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
} from "@/components/ui/command";

interface ToolInfo {
	name: string;
	displayName: string;
	hasHandler: boolean;
	hasExecute: boolean;
}

interface ToolSelectorProps {
	tools: ToolInfo[];
	value: string;
	onChange: (name: string) => void;
}

export function ToolSelector({ tools, value, onChange }: ToolSelectorProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const selected = tools.find((t) => t.name === value);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleSelect = useCallback(
		(name: string) => {
			onChange(name);
			setOpen(false);
		},
		[onChange],
	);

	return (
		<div ref={containerRef} className="relative">
			{/* Trigger */}
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-left transition-colors hover:border-primary/40"
			>
				<span
					className={`inline-block size-1.5 flex-shrink-0 rounded-full ${
						selected?.hasExecute && !selected?.hasHandler
							? "bg-amber-500"
							: "bg-emerald-500"
					}`}
				/>
				<span className="flex-1 truncate font-mono text-xs">
					{selected?.name ?? t("debug.selectTool")}
				</span>
				<ChevronDownIcon
					className={`size-3.5 flex-shrink-0 text-muted-foreground transition-transform ${
						open ? "rotate-180" : ""
					}`}
				/>
			</button>

			{/* Dropdown */}
			{open && (
				<div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
					<Command>
						<CommandInput placeholder={t("debug.searchTools")} className="text-xs" />
						<CommandList className="!max-h-[260px] overflow-y-auto [--cmdk-list-height:auto]">
							<CommandEmpty>{t("debug.noMatchingTools")}</CommandEmpty>
							<CommandGroup>
								{tools.map((t) => (
									<CommandItem
										key={t.name}
										value={t.name}
										keywords={[t.displayName]}
										onSelect={() => handleSelect(t.name)}
										className="gap-2"
									>
										<span
											className={`inline-block size-1.5 flex-shrink-0 rounded-full ${
												t.hasExecute && !t.hasHandler
													? "bg-amber-500"
													: "bg-emerald-500"
											}`}
										/>
										<span className="flex-1 truncate font-mono text-xs">
											{t.name}
										</span>
										{t.name === value && (
											<CheckIcon className="size-3.5 text-primary" />
										)}
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</div>
			)}
		</div>
	);
}

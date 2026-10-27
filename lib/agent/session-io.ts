import { generateSessionId } from "@/lib/agent/session-store";
import {
	getAppToolName,
	getPartText,
	isAppToolPart,
	type AppUIMessage,
} from "@/lib/agent/ui-message";
import { createTranslator, type AppLocale } from "@/lib/i18n";
import type { Session } from "@/lib/agent/session-store";
import type { ErrorLogEntry } from "@/lib/logging/types";

export interface SessionExportFile {
	version: 1;
	exportedAt: string;
	session: Omit<Session, "snapshotMap" | "latestSnapshotId">;
}

export interface ToolCallRecord {
	messageId: string;
	toolName: string;
	input: unknown;
	output: unknown;
	state: string;
}

export interface DiagnosticExportFile {
	version: 1;
	exportedAt: string;
	environment: {
		userAgent: string;
		url: string;
	};
	session: Omit<Session, "snapshotMap" | "latestSnapshotId">;
	toolCallSummary: ToolCallRecord[];
	clientDiagnostics: ClientDiagnostics;
	serverLogs: ErrorLogEntry[];
}

export interface AssistantMessageDiagnostics {
	messageId: string;
	partCount: number;
	partSummary: Array<{
		type: string;
		state?: string;
		toolName?: string;
		textLength?: number;
		textPreview?: string;
		hasOutput?: boolean;
	}>;
	textPartCount: number;
	nonEmptyTextPartCount: number;
	reasoningPartCount: number;
	toolPartCount: number;
	errorToolCount: number;
	lastToolState: string | null;
	lastToolName: string | null;
	lastNonEmptyText: string | null;
	hasPendingTool: boolean;
	hasOnlyEmptyTextAfterLastErrorTool: boolean;
	hasRetryPromiseAfterLastErrorTool: boolean;
}

export interface ClientDiagnostics {
	lastAssistant: AssistantMessageDiagnostics | null;
	allAssistantMessages: AssistantMessageDiagnostics[];
	lastAutoSendDecision?: AutoSendDecisionSnapshot;
	autoSendDecisionHistory?: AutoSendDecisionSnapshot[];
	chatRequestHistory?: ChatRequestSnapshot[];
	autoContinueRisk: {
		hasErrorToolWithoutLaterSuccess: boolean;
		hasRetryPromiseWithoutLaterTool: boolean;
		lastAssistantLooksIncomplete: boolean;
		reason: string | null;
	};
}

export interface AutoSendDecisionSnapshot {
	timestamp: string;
	decision: boolean;
	reason: string;
	status?: string;
	lastMessageId?: string;
	lastMessageRole?: string;
	lastAssistantPartCount?: number;
}

export interface ChatRequestSnapshot {
	requestId: string;
	sessionId: string;
	startedAt: string;
	endedAt?: string;
	status: "started" | "completed" | "errored";
	messageCount: number;
	lastMessageId?: string;
	lastMessageRole?: string;
	errorMessage?: string;
}

export function exportSessionToJson(session: Session): string {
	const sessionData = omitSnapshotMap(session);
	const file: SessionExportFile = {
		version: 1,
		exportedAt: new Date().toISOString(),
		session: sessionData,
	};
	return JSON.stringify(file, null, 2);
}

export function downloadSessionFile(session: Session): void {
	const json = exportSessionToJson(session);
	const date = new Date().toISOString().slice(0, 10);
	const safeTitle = (session.title || "session").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
	const filename = `${safeTitle}-${date}.json`;
	triggerDownload(json, filename, "application/json");
}

export function parseSessionImportFile(
	json: string,
	locale: AppLocale = "en",
): SessionExportFile {
	const t = createTranslator(locale);
	let parsed: unknown;

	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error(t("sessionImport.invalidJson"));
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error(t("sessionImport.invalidRoot"));
	}

	const obj = parsed as Record<string, unknown>;

	if (obj.version !== 1) {
		throw new Error(t("sessionImport.versionMismatch", { version: String(obj.version) }));
	}

	if ("toolCallSummary" in obj || "serverLogs" in obj) {
		throw new Error(t("sessionImport.diagnostic"));
	}

	if (!obj.session || typeof obj.session !== "object") {
		throw new Error(t("sessionImport.missingSession"));
	}

	const session = obj.session as Record<string, unknown>;

	if (!Array.isArray(session.messages)) {
		throw new Error(t("sessionImport.missingMessages"));
	}

	if (typeof session.id !== "string" || !session.id) {
		throw new Error(t("sessionImport.missingId"));
	}

	return parsed as SessionExportFile;
}

export function importFileToSession(file: SessionExportFile): Session {
	return {
		...file.session,
		id: generateSessionId(),
		snapshotMap: {},
		latestSnapshotId: undefined,
		updatedAt: Date.now(),
	};
}

export function extractToolCallSummary(messages: AppUIMessage[]): ToolCallRecord[] {
	const records: ToolCallRecord[] = [];
	const safeMessages = Array.isArray(messages) ? messages : [];

	for (const message of safeMessages) {
		if (message.role !== "assistant") continue;
		const parts = Array.isArray(message.parts) ? message.parts : [];

		for (const part of parts) {
			if (!isAppToolPart(part)) continue;

			records.push({
				messageId: message.id,
				toolName: getAppToolName(part),
				input: part.input ?? null,
				output: part.output ?? null,
				state: part.state ?? "unknown",
			});
		}
	}

	return records;
}

function previewText(text: string): string {
	return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

function analyzeAssistantMessage(message: AppUIMessage): AssistantMessageDiagnostics {
	const parts = Array.isArray(message.parts) ? message.parts : [];
	let textPartCount = 0;
	let nonEmptyTextPartCount = 0;
	let reasoningPartCount = 0;
	let toolPartCount = 0;
	let errorToolCount = 0;
	let lastToolState: string | null = null;
	let lastToolName: string | null = null;
	let lastErrorToolIndex = -1;
	let lastSuccessToolIndex = -1;
	let lastNonEmptyText: string | null = null;
	let hasPendingTool = false;

	const partSummary = parts.map((part, index) => {
		const state = getPartStateSafe(part);
		const text = getPartText(part);
		const summary: AssistantMessageDiagnostics["partSummary"][number] = {
			type: part.type,
		};
		if (state) summary.state = state;

		if (text != null) {
			textPartCount++;
			summary.textLength = text.length;
			summary.textPreview = previewText(text);
			if (text.trim()) {
				nonEmptyTextPartCount++;
				lastNonEmptyText = previewText(text);
			}
		}

		if (part.type === "reasoning") {
			reasoningPartCount++;
		}

		if (isAppToolPart(part)) {
			const toolName = getAppToolName(part);
			toolPartCount++;
			lastToolName = toolName;
			lastToolState = state ?? "unknown";
			summary.toolName = toolName;
			summary.hasOutput = "output" in part && part.output != null;
			if (state === "output-error") {
				errorToolCount++;
				lastErrorToolIndex = index;
			}
			if (state === "output-available") {
				lastSuccessToolIndex = index;
			}
			if (state === "input-streaming" || state === "input-available") {
				hasPendingTool = true;
			}
		}

		return summary;
	});

	const hasOnlyEmptyTextAfterLastErrorTool = lastErrorToolIndex >= 0
		&& lastSuccessToolIndex < lastErrorToolIndex
		&& parts.slice(lastErrorToolIndex + 1).every((part) => {
			if (part.type === "step-start" || part.type === "reasoning") return true;
			if (part.type === "text") return !part.text?.trim();
			return false;
		});
	const hasRetryPromiseAfterLastErrorTool = lastErrorToolIndex >= 0
		&& lastSuccessToolIndex < lastErrorToolIndex
		&& parts.slice(lastErrorToolIndex + 1).some((part) => (
			part.type === "text" && /重试|再试|retry|try again/i.test(part.text ?? "")
		))
		&& !parts.slice(lastErrorToolIndex + 1).some(isAppToolPart);

	return {
		messageId: message.id,
		partCount: parts.length,
		partSummary,
		textPartCount,
		nonEmptyTextPartCount,
		reasoningPartCount,
		toolPartCount,
		errorToolCount,
		lastToolState,
		lastToolName,
		lastNonEmptyText,
		hasPendingTool,
		hasOnlyEmptyTextAfterLastErrorTool,
		hasRetryPromiseAfterLastErrorTool,
	};
}

function getPartStateSafe(part: AppUIMessage["parts"][number]): string | undefined {
	return "state" in part && typeof part.state === "string" ? part.state : undefined;
}

export function buildClientDiagnostics(
	messages: AppUIMessage[],
	lastAutoSendDecision?: AutoSendDecisionSnapshot,
	autoSendDecisionHistory?: AutoSendDecisionSnapshot[],
	chatRequestHistory?: ChatRequestSnapshot[],
): ClientDiagnostics {
	const safeMessages = Array.isArray(messages) ? messages : [];
	const assistantMessages = safeMessages
		.filter((message) => message.role === "assistant")
		.map(analyzeAssistantMessage);
	const lastAssistant = assistantMessages[assistantMessages.length - 1] ?? null;

	let reason: string | null = null;
	const hasErrorToolWithoutLaterSuccess = !!lastAssistant?.hasOnlyEmptyTextAfterLastErrorTool;
	const hasRetryPromiseWithoutLaterTool = !!lastAssistant?.hasRetryPromiseAfterLastErrorTool;
	const lastAssistantLooksIncomplete = !!lastAssistant
		&& !lastAssistant.hasPendingTool
		&& (
			lastAssistant.hasOnlyEmptyTextAfterLastErrorTool
			|| lastAssistant.hasRetryPromiseAfterLastErrorTool
			|| (
				lastAssistant.reasoningPartCount > 0
				&& lastAssistant.toolPartCount === 0
				&& lastAssistant.nonEmptyTextPartCount === 0
			)
		);

	if (hasErrorToolWithoutLaterSuccess) {
		reason = "Last assistant message ended after an output-error tool without a later successful tool or substantive final text.";
	} else if (hasRetryPromiseWithoutLaterTool) {
		reason = "Last assistant message promised a retry after an output-error tool, but no later tool call was emitted.";
	} else if (lastAssistantLooksIncomplete) {
		reason = "Last assistant message contains reasoning but no substantive final text or tool call.";
	}

	return {
		lastAssistant,
		allAssistantMessages: assistantMessages,
		lastAutoSendDecision,
		autoSendDecisionHistory,
		chatRequestHistory,
		autoContinueRisk: {
			hasErrorToolWithoutLaterSuccess,
			hasRetryPromiseWithoutLaterTool,
			lastAssistantLooksIncomplete,
			reason,
		},
	};
}

export function exportDiagnosticToJson(
	session: Session,
	serverLogs: ErrorLogEntry[],
	lastAutoSendDecision?: AutoSendDecisionSnapshot,
	autoSendDecisionHistory?: AutoSendDecisionSnapshot[],
	chatRequestHistory?: ChatRequestSnapshot[],
): string {
	const sessionData = omitSnapshotMap(session);
	const exportedAt = new Date().toISOString();

	const file: DiagnosticExportFile = {
		version: 1,
		exportedAt,
		environment: {
			userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
			url: typeof window !== "undefined" ? window.location.href : "unknown",
		},
		session: sessionData,
		toolCallSummary: extractToolCallSummary(sessionData.messages),
		clientDiagnostics: buildClientDiagnostics(
			sessionData.messages,
			lastAutoSendDecision,
			autoSendDecisionHistory,
			chatRequestHistory,
		),
		serverLogs,
	};

	return JSON.stringify(file, null, 2);
}

function omitSnapshotMap(session: Session): Omit<Session, "snapshotMap" | "latestSnapshotId"> {
	return {
		id: session.id || generateSessionId(),
		title: session.title || "Untitled",
		messages: Array.isArray(session.messages) ? session.messages : [],
		createdAt: session.createdAt || Date.now(),
		updatedAt: session.updatedAt || session.createdAt || Date.now(),
		tokenUsage: session.tokenUsage,
	};
}

export function downloadDiagnosticFile(
	session: Session,
	serverLogs: ErrorLogEntry[],
	lastAutoSendDecision?: AutoSendDecisionSnapshot,
	autoSendDecisionHistory?: AutoSendDecisionSnapshot[],
	chatRequestHistory?: ChatRequestSnapshot[],
): void {
	const json = exportDiagnosticToJson(
		session,
		serverLogs,
		lastAutoSendDecision,
		autoSendDecisionHistory,
		chatRequestHistory,
	);
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const filename = `spreadjs-agent-diagnostic-${ts}.json`;
	triggerDownload(json, filename, "application/json");
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

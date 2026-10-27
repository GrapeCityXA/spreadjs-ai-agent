"use client";

import { useRef, useState, useCallback } from "react";
import type { FileUIPart } from "ai";
import { createTranslator, normalizeLocale, type AppLocale } from "@/lib/i18n";

export interface PendingFile {
	name: string;
	size: number;
	fileType: "spreadsheet" | "image";
	/** 仅图片附件有效：data URL，用于预览和发送 */
	dataUrl?: string;
	/** 仅图片附件有效：IANA 媒体类型 */
	mediaType?: string;
}

/**
 * 附件暂存管理 — 文件选择、base64 缓存、移除、消费。
 * 从 ChatPanel 提取，职责单一化。
 * 支持两类附件：电子表格文件（xlsx/csv/sjs）和图片文件（png/jpg/gif/webp）。
 * 支持同时暂存多个文件（多张图片、多个电子表格、或混合）。
 */
const SPREADSHEET_EXTENSIONS = [
	".xlsx", ".xlsm", ".xlst", ".xltx",
	".csv", ".ssjson", ".json", ".sjs",
];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

/** 单个附件上限：5MB */
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

export interface AttachmentReject {
	reason: "type" | "size";
	file: File;
}

function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			resolve(dataUrl.split(",")[1]);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

function isImageFile(file: File): boolean {
	return (
		IMAGE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext)) ||
		file.type.startsWith("image/")
	);
}

function isSpreadsheetFile(file: File): boolean {
	return SPREADSHEET_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function isAcceptedFile(file: File): boolean {
	return isSpreadsheetFile(file) || isImageFile(file);
}

function getImageMediaType(file: File): string {
	if (file.type?.startsWith("image/")) return file.type;
	const name = file.name.toLowerCase();
	if (name.endsWith(".png")) return "image/png";
	if (name.endsWith(".gif")) return "image/gif";
	if (name.endsWith(".webp")) return "image/webp";
	return "image/jpeg";
}

/** 从 MIME 类型推断文件扩展名 */
function mimeToExt(mime: string): string {
	if (mime === "image/png") return "png";
	if (mime === "image/gif") return "gif";
	if (mime === "image/webp") return "webp";
	if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
	return "png";
}

export function useAttachments(options?: {
	visionAvailable?: boolean;
	onReject?: (info: AttachmentReject) => void;
}) {
	const visionAvailable = options?.visionAvailable ?? true;
	const onReject = options?.onReject;
	const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
	const pendingFilesRef = useRef(new Map<string, string>());
	const fileInputRef = useRef<HTMLInputElement>(null);
	const pasteCounterRef = useRef(0);

	/** 内部：暂存一个文件，追加到列表（自动区分电子表格和图片） */
	const stageFile = useCallback(async (file: File) => {
		if (!isAcceptedFile(file)) {
			onReject?.({ reason: "type", file });
			return;
		}
		if (file.size > MAX_ATTACHMENT_SIZE) {
			onReject?.({ reason: "size", file });
			return;
		}
		if (isImageFile(file)) {
			if (!visionAvailable) {
				console.warn("[useAttachments] Vision input is unavailable. Ignoring image:", file.name);
				return;
			}
			const dataUrl = await fileToDataUrl(file);
			// 同步存入 ref，供 add_picture 工具自动注入（镜像 import_file 模式）
			pendingFilesRef.current.set(file.name, dataUrl);
			setPendingFiles(prev => [...prev, {
				name: file.name,
				size: file.size,
				fileType: "image",
				dataUrl,
				mediaType: getImageMediaType(file),
			}]);
		} else {
			const base64 = await fileToBase64(file);
			pendingFilesRef.current.set(file.name, base64);
			setPendingFiles(prev => [...prev, { name: file.name, size: file.size, fileType: "spreadsheet" }]);
		}
	}, [visionAvailable, onReject]);

	/** 文件选择回调（绑定到 <input type="file" onChange>，支持多选） */
	const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const fileArray = Array.from(e.target.files ?? []);
		if (fileArray.length === 0) return;
		e.target.value = "";
		for (const file of fileArray) {
			await stageFile(file);
		}
	}, [stageFile]);

	/** 拖拽放下回调 — 从 DragEvent 提取所有可接受的文件 */
	const handleFileDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault();
		const files = Array.from(e.dataTransfer.files);
		for (const file of files) {
			await stageFile(file);
		}
	}, [stageFile]);

	/** 粘贴回调 — 从剪贴板提取所有图片文件，命名为 PastedImageN.XXX */
	const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		let prevented = false;
		for (const item of items) {
			if (item.kind === "file") {
				const file = item.getAsFile();
				if (file && isImageFile(file)) {
					if (!prevented) { e.preventDefault(); prevented = true; }
					pasteCounterRef.current += 1;
					const ext = mimeToExt(file.type);
					const renamedFile = new File([file], `PastedImage${pasteCounterRef.current}.${ext}`, { type: file.type });
					await stageFile(renamedFile);
				}
			}
		}
	}, [stageFile]);

	/** 按索引移除一个暂存文件 */
	const removePendingFile = useCallback((index: number) => {
		setPendingFiles(prev => {
			const file = prev[index];
			if (file) {
				// 无论是电子表格还是图片，都从 ref 中移除
				pendingFilesRef.current.delete(file.name);
			}
			return prev.filter((_, i) => i !== index);
		});
	}, []);

	/**
	 * 消费暂存电子表格文件（发送消息时调用）。
	 * 返回附件提示文本（如 `[Attachment: foo.xlsx]`），若无电子表格文件则返回 null。
	 * 调用后清除电子表格类 pendingFiles（base64 保留在 ref 中供 import_file 工具读取）。
	 */
	const consumePendingFile = useCallback((locale: AppLocale = "en"): string | null => {
		const spreadsheets = pendingFiles.filter(f => f.fileType === "spreadsheet");
		if (spreadsheets.length === 0) return null;
		const t = createTranslator(normalizeLocale(locale));
		const tags = spreadsheets.map(f => t("chat.marker.attachment", { name: f.name })).join("\n");
		setPendingFiles(prev => prev.filter(f => f.fileType !== "spreadsheet"));
		return tags;
	}, [pendingFiles]);

	/**
	 * 消费暂存图片附件（发送消息时调用）。
	 * 返回 AI SDK FileUIPart 数组，可直接传给 sendMessage({ files: [...] })。
	 * 若无图片附件则返回空数组。
	 */
	const consumePendingImageParts = useCallback((): FileUIPart[] => {
		const images = pendingFiles.filter(f => f.fileType === "image" && f.dataUrl);
		if (images.length === 0) return [];
		const parts: FileUIPart[] = images.map(f => ({
			type: "file" as const,
			mediaType: f.mediaType ?? "image/jpeg",
			filename: f.name,
			url: f.dataUrl!,
		}));
		setPendingFiles(prev => prev.filter(f => f.fileType !== "image"));
		return parts;
	}, [pendingFiles]);

	/** 清除所有暂存附件（新建/切换会话时调用） */
	const clearAttachments = useCallback(() => {
		setPendingFiles([]);
		pendingFilesRef.current.clear();
		pasteCounterRef.current = 0;
	}, []);

	return {
		pendingFiles,
		pendingFilesRef,
		fileInputRef,
		handleFileSelect,
		handleFileDrop,
		handlePaste,
		removePendingFile,
		consumePendingFile,
		consumePendingImageParts,
		clearAttachments,
	};
}

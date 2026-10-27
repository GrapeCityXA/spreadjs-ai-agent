"use client";

import { useEffect } from "react";
import type { ThemeMode } from "./useSettings";

const DESIGNER_LIGHT_CSS_ID = "spreadjs-designer-light-theme";
const DESIGNER_LIGHT_CSS_HREF = "/spreadjs/gc.spread.sheets.designer.light.min.css";
const DESIGNER_DARK_CSS_ID = "spreadjs-designer-dark-theme";
const DESIGNER_DARK_CSS_HREF = "/spreadjs/gc.spread.sheets.designer.dark.min.css";
const RUNTIME_LIGHT_CSS_ID = "spreadjs-runtime-light-theme";
const RUNTIME_LIGHT_CSS_HREF = "/spreadjs/gc.spread.sheets.excel2013white.css";
const RUNTIME_DARK_CSS_ID = "spreadjs-runtime-dark-theme";
const RUNTIME_DARK_CSS_HREF = "/spreadjs/gc.spread.sheets.excel2016black.css";

/** 拥有 refresh() 方法的对象（SpreadJS Workbook） */
type Refreshable = { refresh(): void; repaint?: () => void };

function resolveIsDark(mode: ThemeMode): boolean {
	if (mode === "system") {
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	}
	return mode === "dark";
}

function applyThemeClass(mode: ThemeMode, onRuntimeLoaded?: () => void) {
	const isDark = resolveIsDark(mode);
	document.documentElement.classList.toggle("dark", isDark);
	applyExclusiveCss(
		isDark,
		DESIGNER_LIGHT_CSS_ID, DESIGNER_LIGHT_CSS_HREF,
		DESIGNER_DARK_CSS_ID, DESIGNER_DARK_CSS_HREF,
	);
	applyExclusiveCss(
		isDark,
		RUNTIME_LIGHT_CSS_ID, RUNTIME_LIGHT_CSS_HREF,
		RUNTIME_DARK_CSS_ID, RUNTIME_DARK_CSS_HREF,
		onRuntimeLoaded,
	);
}

/**
 * light/dark 互斥切换。
 *
 * **两套 CSS 始终留在 DOM 里**，只切换 `media`（`all` / `not all`）：
 * 移除旧 `<link>` 再插入新链接，会让浏览器在新样式下载/解析完成前处于
 * “一套样式都没有”的状态，Designer 就会短暂掉样式。用 media 切换时旧样式
 * 已经被解析，新样式也已随首屏一起加载，切换是同步的。
 */
function applyExclusiveCss(
	isDark: boolean,
	lightId: string, lightHref: string,
	darkId: string, darkHref: string,
	onLoaded?: () => void,
) {
	// onLoaded 必须挂在**当前启用**的那套主题上；只挂 dark 会导致 dark→light 时不刷新工作簿
	applyThemeCss(lightId, lightHref, !isDark, isDark ? undefined : onLoaded);
	applyThemeCss(darkId, darkHref, isDark, isDark ? onLoaded : undefined);
}

function applyThemeCss(
	id: string,
	href: string,
	active: boolean,
	onLoaded?: () => void,
) {
	let link = document.getElementById(id) as HTMLLinkElement | null;

	if (!link) {
		link = document.createElement("link");
		link.id = id;
		link.rel = "stylesheet";
		link.href = href;
		link.media = active ? "all" : "not all";
		document.head.appendChild(link);
	} else {
		link.media = active ? "all" : "not all";
	}

	if (!active || !onLoaded) return;
	if (link.sheet) {
		afterStyleRecalc(onLoaded);
	} else {
		link.addEventListener("load", () => afterStyleRecalc(onLoaded), { once: true });
	}
}

/**
 * 等浏览器把新主题的 media 切换应用到样式树之后再通知 SpreadJS 重绘。
 *
 * 只切换 `media` 时，`workbook.refresh()` 若在同一帧内执行，读到的仍是旧主题的
 * 计算样式；画布要等下一次重绘（例如点一下图表）才更新。两个 rAF 让样式重算和
 * 一次绘制先发生，随后再取色重绘。
 */
function afterStyleRecalc(callback: () => void): void {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			try {
				// 读取一次计算样式，强制提交 media 变更后的样式重算
				void window.getComputedStyle(document.body).backgroundColor;
				callback();
			} catch {
				// 组件已卸载或 SpreadJS 已销毁时忽略
			}
		});
	});
}

/**
 * 根据 theme 设置值，将 .dark 类应用到 <html> 上，
 * 同时切换 SpreadJS Designer 和 Runtime 的 CSS 主题，
 * 并监听系统主题变化（当 mode 为 "system" 时）。
 *
 * @param spreadHost - 可选，SpreadJS Workbook 实例。切换 Runtime CSS 后需调用
 *   workbook.refresh() 让 SpreadJS 重新读取样式并重绘画布。
 */
export function useTheme(mode: ThemeMode, spreadHost?: Refreshable | null) {
	useEffect(() => {
		const refresh = () => {
			spreadHost?.refresh();
			spreadHost?.repaint?.();
		};
		applyThemeClass(mode, refresh);

		if (mode !== "system") return;

		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => applyThemeClass("system", refresh);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [mode, spreadHost]);
}

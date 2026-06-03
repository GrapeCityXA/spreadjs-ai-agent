"use client";

import { useSyncExternalStore } from "react";
import type { Task, TaskPlan } from "@/lib/agent/task-types";
import { normalizeLocale, type AppLocale } from "@/lib/i18n";

// ============================================================================
// Agent 任务列表状态管理 — 多计划 + 会话级持久化
// ============================================================================

type Listener = () => void;

let planCounter = 0;
const sessionPrefix = Date.now().toString(36);

class TaskStore {
	private plans: TaskPlan[] = [];
	private listeners = new Set<Listener>();

	/** 返回最新计划的任务列表（向后兼容） */
	getSnapshot = (): Task[] => {
		const latest = this.latestPlan();
		return latest ? latest.tasks : emptyTasks;
	};

	subscribe = (listener: Listener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	/** 创建新的任务计划（保留历史计划） */
	addTasks(items: Array<{ id: string; label: string }>) {
		const plan: TaskPlan = {
			planId: `plan_${sessionPrefix}_${++planCounter}`,
			tasks: items.map((t, i) => ({
				...t,
				status: (i === 0 ? "running" : "pending") as Task["status"],
			})),
			createdAt: Date.now(),
		};
		this.plans = [...this.plans, plan];
		this.emit();
	}

	/** 在最新计划中标记任务完成 */
	completeTask(taskId: string) {
		const latest = this.latestPlan();
		if (!latest) return;

		latest.tasks = latest.tasks.map((t) =>
			t.id === taskId ? { ...t, status: "done" as const } : t,
		);
		const nextPending = latest.tasks.find((t) => t.status === "pending");
		if (nextPending) {
			latest.tasks = latest.tasks.map((t) =>
				t.id === nextPending.id ? { ...t, status: "running" as const } : t,
			);
		}
		this.plans = [...this.plans];
		this.emit();
	}

	reset() {
		this.plans = [];
		this.emit();
	}

	/** 导出全部计划快照，用于会话持久化 */
	exportPlans(): TaskPlan[] {
		return this.plans.map((p) => ({
			...p,
			tasks: p.tasks.map((t) => ({ ...t })),
		}));
	}

	/** 从快照恢复全部计划（切换会话时调用） */
	importPlans(snapshot: TaskPlan[]) {
		this.plans = snapshot.map((p) => ({
			...p,
			tasks: p.tasks.map((t) => ({ ...t })),
		}));
		this.emit();
	}

	/**
	 * 序列化为文本，注入 system prompt 让 AI 感知当前进度。
	 * 优先展示最新计划；已完成的历史计划仅显示摘要。
	 */
	serialize(locale: AppLocale = "en"): string | null {
		if (this.plans.length === 0) return null;
		const statusIcon = { pending: "⬚", running: "▸", done: "✓" };
		const resolved = normalizeLocale(locale);
		const isZh = resolved === "zh-CN";
		const parts: string[] = [];

		// 历史计划（已全部完成的）以摘要形式展示
		for (let i = 0; i < this.plans.length - 1; i++) {
			const plan = this.plans[i];
			const doneCount = plan.tasks.filter((t) => t.status === "done").length;
			const total = plan.tasks.length;
			const label = plan.tasks.map((t) => t.label).join(isZh ? "、" : ", ");
			parts.push(
				isZh
					? `历史计划 ${i + 1}（${doneCount}/${total} 完成）: ${label}`
					: `Previous plan ${i + 1} (${doneCount}/${total} complete): ${label}`,
			);
		}

		// 最新计划完整展示
		const latest = this.latestPlan()!;
		if (parts.length > 0) parts.push(""); // 空行分隔
		parts.push(isZh ? "当前计划:" : "Current plan:");
		for (const t of latest.tasks) {
			parts.push(`- [${statusIcon[t.status]}] ${t.id}: ${t.label}`);
		}

		return parts.join("\n");
	}

	/** 获取全部计划（用于诊断或高级 UI） */
	getAllPlans(): TaskPlan[] {
		return this.plans;
	}

	/** 返回最新计划的 planId（用于历史快照过滤） */
	getLatestPlanId(): string | null {
		return this.latestPlan()?.planId ?? null;
	}

	private latestPlan(): TaskPlan | undefined {
		return this.plans[this.plans.length - 1];
	}

	private emit() {
		this.listeners.forEach((l) => l());
	}
}

export const taskStore = new TaskStore();

const emptyTasks: Task[] = [];

export function useTasks(): Task[] {
	return useSyncExternalStore(
		taskStore.subscribe,
		taskStore.getSnapshot,
		() => emptyTasks,
	);
}

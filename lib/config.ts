/**
 * LLM 提供商配置，通过环境变量覆盖。
 * baseURL 不设默认值——各官方 SDK（Anthropic / DeepSeek / Google）自带默认地址，
 * 仅走 OpenAI 兼容路径的模型（GLM / Qwen）需要用户显式配置 LLM_BASE_URL。
 */
export const LLM_CONFIG = {
	apiKeyEnv: "LLM_API_KEY",
	baseURL: process.env.LLM_BASE_URL,
	model: process.env.LLM_MODEL ?? "glm-4.7",
} as const;

/** Vision LLM 配置（可选）。对话中出现图片附件时自动切换，后续保持使用 */
export const VISION_LLM_CONFIG = {
	apiKeyEnv: "VISION_API_KEY",
	baseURL: process.env.VISION_BASE_URL,
	model: process.env.VISION_MODEL,
} as const;

export const DEFAULT_MAX_OUTPUT_TOKENS = 65536;

/**
 * 各模型的最大输出 token 数。
 * 按模型名前缀匹配，优先级从上到下。
 * 不在列表中的模型回退到 DEFAULT_MAX_OUTPUT_TOKENS。
 */
const MAX_OUTPUT_TOKENS_MAP: Array<[RegExp, number]> = [
	// GLM（智谱）
	[/\bglm-4\.6v\b/i, 32768],
	// DeepSeek
	[/\bdeepseek-reasoner\b/i, 16384],
	[/\bdeepseek/i, 65536],
	// Google Gemini
	[/\bgemini-2\.5-pro\b/i, 65536],
	[/\bgemini-2\.5-flash\b/i, 65536],
	[/\bgemini-3/i, 65536],
	[/\bgemini-2/i, 8192],
];
export const CHAT_API_ENDPOINT = "/api/chat";

/**
 * 常见模型的上下文窗口大小（tokens）。
 * 按模型名前缀匹配，优先级从上到下。
 * 不在列表中的模型回退到 MODEL_CONTEXT_WINDOW env 或 128K。
 */
const CONTEXT_WINDOW_MAP: Array<[RegExp, number]> = [
	// Anthropic
	[/\bclaude-.*-4-6\b/i, 200000],
	[/\bclaude-.*-4-5\b/i, 200000],
	[/\bclaude-3-5\b/i, 200000],
	[/\bclaude-3\b/i, 200000],
	[/\bclaude\b/i, 200000],
	// OpenAI
	[/\bgpt-4o\b/i, 128000],
	[/\bgpt-4-turbo\b/i, 128000],
	[/\bgpt-4\b/i, 8192],
	[/\bo[134]-/i, 200000],
	// GLM（智谱）
	[/\bglm-4\.7\b/i, 128000],
	[/\bglm-4\.5\b/i, 128000],
	[/\bglm-5\b/i, 128000],
	[/\bglm-4\b/i, 128000],
	// DeepSeek
	// v4 系列与 flash 都是 1M。**必须排在通用的 deepseek 条目之前**——匹配是自上而下、
	// 第一条命中生效，顺序反了就会被下面那个 64000 抢先。
	[/\bdeepseek-v4/i, 1000000],
	[/\bdeepseek-flash/i, 1000000],
	[/\bdeepseek-v3/i, 128000],
	[/\bdeepseek-r1/i, 128000],
	[/\bdeepseek-chat/i, 128000],
	[/\bdeepseek/i, 64000],
	// Google Gemini
	[/\bgemini-2\.5-pro\b/i, 1048576],
	[/\bgemini-2\.5-flash\b/i, 1048576],
	[/\bgemini-3/i, 1048576],
	[/\bgemini-2/i, 1048576],
	[/\bgemini/i, 128000],
	// Qwen
	[/\bqwen3\b/i, 128000],
	[/\bqwq\b/i, 128000],
	[/\bqwen2/i, 128000],
	[/\bqwen/i, 32000],
];

const DEFAULT_CONTEXT_WINDOW = 128000;

/** 根据模型名查找上下文窗口大小 */
export function getContextWindow(model: string): number {
	const envOverride = Number(process.env.NEXT_PUBLIC_MODEL_CONTEXT_WINDOW);
	if (envOverride > 0) return envOverride;

	for (const [pattern, size] of CONTEXT_WINDOW_MAP) {
		if (pattern.test(model)) return size;
	}
	return DEFAULT_CONTEXT_WINDOW;
}

/** 根据模型名查找最大输出 token 数 */
export function getMaxOutputTokens(model: string): number {
	for (const [pattern, size] of MAX_OUTPUT_TOKENS_MAP) {
		if (pattern.test(model)) return size;
	}
	return DEFAULT_MAX_OUTPUT_TOKENS;
}

/** 当前主模型的上下文窗口大小 */
export const MODEL_CONTEXT_WINDOW = getContextWindow(LLM_CONFIG.model);

/** 单次 read_ranges 返回的最大单元格数 */
export const MAX_CELLS_PER_READ = 500;

/** search_data 返回的最大结果数 */
export const MAX_SEARCH_RESULTS = 100;

/** readRanges 软裁剪：超过此行数时只返回前 TRIM_ROWS_KEEP 行 + 摘要 */
export const TRIM_ROWS_THRESHOLD = 50;
export const TRIM_ROWS_KEEP = 20;

/** searchData 软裁剪：超过此数量时只返回前 N 条 + totalMatches */
export const TRIM_SEARCH_RESULTS = 20;

/** 工具结果中单个字符串值的最大长度 */
export const MAX_STRING_LENGTH = 200;

/** 右侧聊天面板宽度（px） */
export const CHAT_PANEL_WIDTH = 420;


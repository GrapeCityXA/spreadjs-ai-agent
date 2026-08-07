# SpreadJS AI Agent

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

SpreadJS AI Agent 是一个面向 SpreadJS 的 AI 电子表格 Agent。它结合结构化 tool calling、模块化工具暴露、MCP 集成和受保护的 `execute_code` 沙箱，让模型能够在浏览器中可靠地读取、修改和生成工作簿内容。

项目基于 [SpreadJS 官网](https://www.grapecity.com.cn/developer/spreadjs) 和 [`@grapecity-software/spread-sheets`](https://www.npmjs.com/package/@grapecity-software/spread-sheets) 构建，当前仓库使用 `SpreadJS 19.0.1` 及其配套插件。

 _[本仓库内容对应的视频教学课程](https://learn.grapecity.com.cn/course_detail?courseid=course-20260731-001)_ 

![预览](screenshot.png)

## 核心特性

- **完整的电子表格操作面**: 当前内置 `91` 个工具，覆盖数据读写、Sheet 管理、格式、条件格式、图表、透视表、表格、批注、验证、单元格状态、单元格类型、形状与图片、超链接、切片器、导入导出与外部检索
- **面向大工具集的注意力控制**: `12` 个模块网关 + `43` 个模块子工具，默认只向模型暴露 `47` 个工具，进入模块后再暴露专属工具，降低误调用和工具幻觉
- **受保护的 `execute_code` 工作流**: 执行前做预执行验证，执行中保存工作簿快照，异常时自动回滚，并自动恢复 SpreadJS 的渲染、事件和计算状态
- **工程化的会话与恢复能力**: 支持本地持久化、自动恢复上次活跃会话、消息级工作簿快照、会话分支和工作簿还原
- **可扩展的 MCP 集成**: 内置 `spreadjs-mcp` 配置，同时支持用户自定义 MCP Server；MCP 虽然可选，但对 `execute_code` 场景强烈推荐

## 基于 SpreadJS

- 官网: [https://www.grapecity.com.cn/developer/spreadjs](https://www.grapecity.com.cn/developer/spreadjs)
- npm: [https://www.npmjs.com/package/@grapecity-software/spread-sheets](https://www.npmjs.com/package/@grapecity-software/spread-sheets)
- 当前依赖版本: `@grapecity-software/spread-sheets@19.0.1`
- 运行前需要配置 `NEXT_PUBLIC_SPREADJS_LICENSE` 和 `NEXT_PUBLIC_SPREADJS_DESIGNER_LICENSE`
  - localhost为白名单, 本地调试可以留空

## 能力概览

- 自然语言读写表格数据，覆盖读取、批量写入、查找替换、自动填充、排序、筛选、公式依赖追踪和目标求解
- 工作表管理覆盖新建、删除、重命名、移动、复制、冻结、隐藏、保护、标签颜色、行高列宽调整等常见操作
- 高级对象和结构能力覆盖格式、条件格式、图表、透视表、表格、批注、数据验证、单元格状态、单元格类型、形状与图片、超链接、切片器
- 支持文件导入导出、网页搜索与页面抓取、图片输入与视觉理解、MCP 外部工具扩展
- 支持 `execute_code` 浏览器沙箱，可直接调用 SpreadJS API 处理复杂批量操作
- 支持会话自动保存、页面刷新后自动恢复、消息级工作簿快照、会话 fork 分支、终止对话并还原 SpreadJS
- 支持任务计划、`ask_user` 暂停提问、上下文占用提示、自动步数上限保护等 Agent 控制能力

## 工具体系与注意力控制

当前仓库内置 **91 个工具**，另可动态接入 MCP 工具。工具系统采用渐进式 API 披露：模型默认先看到基础工具和模块入口，进入模块后再暴露该模块的专属工具，以降低大规模工具集下的误调用概率。

| 层级 | 数量 | 说明 |
|------|------|------|
| 基础工具 | 35 | 高频通用操作，始终可见 |
| 网关工具 | 12 | 模块入口，默认模式可见 |
| 模块子工具 | 43 | 进入模块后可见 |
| 退出工具 | 1 | `exit_module` |

AI 在不同模式下实际看到的工具数：

- 默认模式: `35 + 12 = 47`
- 模块模式: `35 + 当前模块 3-5 + 1 = 39-41`
- MCP 工具: 动态发现，不计入上表

当前支持的模块包括：

- 格式
- 条件格式
- 图表
- 透视表
- 表格
- 批注
- 数据验证
- 单元格状态
- 单元格类型
- 形状与图片
- 超链接
- 切片器

模块网关不仅用于 UI 分组，也用于控制模型在每一步真正可见的工具范围；同时模块状态可以根据消息历史恢复，适配 HTTP 无状态的多轮 tool calling。

## 关键工程化能力

- `execute_code` 在真实工作簿执行前会先在隐藏的临时 SpreadJS 实例中完成预执行验证
- `execute_code` 执行前会保存工作簿快照；代码报错时自动回滚，避免真实工作簿停留在不一致状态
- 框架自动管理 SpreadJS 的 `suspendPaint` / `resumePaint`、事件和计算恢复，降低 AI 代码把界面卡死的风险
- 每条用户消息都可以关联工作簿快照，因此支持消息级恢复、会话分支以及按消息还原 SpreadJS 状态
- 会话和工作簿支持本地持久化，刷新页面或重新打开应用后可自动恢复上次活跃会话
- MCP 管理支持用户自定义 MCP Server、动态工具发现和扩展式工作流接入

## 运行环境

- 已验证环境: `Node.js 22.20.0`、`pnpm 10.26.2`
- 建议最低版本: `Node.js >= 20.9.0`、`pnpm >= 9`
- 说明: 当前仓库没有对更低版本做系统回归验证；如果希望环境最稳妥，建议直接使用 `Node.js 22 + pnpm 10`

## 配置

1. 安装依赖

```bash
pnpm install
```

2. 复制环境变量模板

```bash
cp .env.example .env.local
```

3. 编辑 `.env.local`

必填项：

- `LLM_API_KEY`: 主模型 API Key
- `LLM_BASE_URL`: OpenAI 兼容模型网关地址
- `LLM_MODEL`: 主模型名称
- `NEXT_PUBLIC_SPREADJS_LICENSE`: SpreadJS Runtime LicenseKey
- `NEXT_PUBLIC_SPREADJS_DESIGNER_LICENSE`: SpreadJS Designer LicenseKey

常用可选项：

- `VISION_API_KEY` / `VISION_BASE_URL` / `VISION_MODEL`: 图片理解模型
- `TITLE_API_KEY` / `TITLE_BASE_URL` / `TITLE_MODEL`: 会话标题模型
- `TAVILY_API_KEY`: 启用 Tavily 网络搜索，未配置时默认回退到 DuckDuckGo

4. 配置内置 MCP token

项目内置了 `spreadjs-mcp` 的服务器地址，但默认 token 是占位符，因此不会自动连接。

`MCP token` 是可选的，但 **强烈推荐** 配置，尤其是在需要大量使用 `execute_code` 时。原因是 Agent 在有 SpreadJS MCP 可用时，会优先查询 API 签名和用法后再生成代码，这通常能明显提升 `execute_code` 的成功率，并减少 API 名称、参数和调用方式上的幻觉。

- 打开应用内 Settings -> MCP 服务
- 到 [https://mcp.grapecity.com.cn/](https://mcp.grapecity.com.cn/) 注册账号并获取 token
- 将 `headers.token` 替换成你自己的 token
- 将 `enabled` 改为 `true`

如果你只验证基础 tool calling，不配置 MCP 也可以正常运行；如果要验证复杂 SpreadJS API 代码生成，建议开启。

## 启动

推荐使用生产方式启动：

```bash
pnpm build
pnpm start
```

然后访问 `http://localhost:3000`。

一般日常开发可使用：

```bash
pnpm dev
```

如果要验证 MCP 连接、生产构建或更贴近真实部署的行为，优先使用 `pnpm build && pnpm start`。

## License

Apache License 2.0

# Infio Copilot Free

**语言：** [English](README.md) | [Русский](README_ru.md) | 简体中文

一款受 Cursor 启发的 Obsidian AI 助手：能够读取并编辑你的仓库的智能体聊天、
基于 RAG 的语义搜索、行内自动补全和 AI 洞察 —— 数据完全本地存储，无任何
遥测。

**Infio Copilot Free** 是 [Infio Copilot](https://github.com/infiolab/infio-copilot)
（0.8.x，自 2025 年起停止维护并已从 Obsidian 插件目录下架）的独立社区延续
版本，而 Infio Copilot 本身源自 [Smart Composer](https://github.com/glm454/smart-composer)。
原始设计与代码的功劳归于其作者；本项目修复了遗留的致命问题（失效的资源
主机、遥测、界面崩溃），并让插件持续演进。

## 功能特性

- **与仓库对话的智能体聊天** —— 助手可以读取笔记、进行搜索（语义 / BM25 /
  正则）、抓取网页、通过可审阅的 diff 创建和编辑文件，并支持 MCP 工具。
- **RAG 语义搜索** —— 笔记的向量索引完全存储在本地（PGlite，即编译为
  WebAssembly 的 PostgreSQL，运行于 OPFS 存储）。
- **AI 洞察** —— 详细/简明摘要、关键洞察、论文分析等多种笔记转换。
- **自动补全** —— 使用你选择的模型进行行内代码/文本补全。
- **支持任意提供商** —— OpenAI、Anthropic、Google、OpenRouter、DeepSeek、
  Groq、xAI、Moonshot、SiliconFlow、阿里云百炼（Qwen）、OpenAI 兼容端点、
  Ollama 及其他本地服务器，另内置本地嵌入模型（嵌入无需 API Key）。
- **工作区、自定义模式、快捷命令、MCP 服务器。**
- **本地化界面** —— 英语、俄语和简体中文跟随 Obsidian 的界面语言；其他
  语言将回退为英语。

## 安装

### 从发行版安装（手动）

1. 从 [Releases](../../releases/latest) 下载
   `obsidian-infio-copilot-free-<version>.zip`，解压到
   `<vault>/.obsidian/plugins/infio-copilot-free/`。
   文件夹中必须包含 `main.js`、`manifest.json`、`styles.css` 以及三个
   PGlite 运行时文件：`postgres.wasm`、`postgres.data`、`vector.tar.gz`。
2. 重启 Obsidian，并在 设置 → 第三方插件 中启用 **Infio Copilot Free**。

如果缺少这三个 PGlite 文件，插件仍可启动：它们会从 npm CDN 镜像
（jsDelivr → npmmirror → unpkg）一次性下载。

### BRAT

将本仓库添加到 [BRAT](https://github.com/TfTHacker/obsidian42-brat)，
即可自动获取发行版构建。

### 社区插件目录

尚未上架 —— 已向 `obsidianmd/obsidian-releases` 计划提交申请；在此之前
请使用上述两种方式。

## 快速上手

1. 从侧边栏（魔棒图标）或命令面板（“Open Infio Copilot Free”）打开聊天。
2. 在 设置 → Infio Copilot Free 中选择一个提供商并粘贴 API Key —— 或将
   Ollama 槽位指向 `http://localhost:11434`：模型下拉列表会直接从你的
   Ollama 服务器拉取，**Test connection（测试连接）** 按钮还能诊断连通性
   与 CORS/origin 问题（见下文「Ollama（本地模型）」章节）。
3. 配置四个模型槽位（聊天 / apply / 洞察 / 嵌入）—— 每个槽位单独设置。
   嵌入可以使用内置的本地模型。
4. 可选：在「Semantic Index」面板构建语义索引，并在设置页底部启用自动补全。

## Ollama（本地模型）

Infio Copilot Free 开箱即用地支持 [Ollama](https://ollama.com)：

1. 安装 Ollama 并拉取模型，例如 `ollama pull qwen2.5:3b`。
2. 确保服务器在运行（`ollama serve`；桌面应用会自动启动）。默认地址：
   `http://localhost:11434`。
3. 在 设置 → Infio Copilot Free → **Ollama** 中填写基础 URL。聊天/洞察/
   自动补全的模型下拉列表会自动从服务器的 `/api/tags` 拉取；嵌入下拉
   列表则显示服务器中支持嵌入的模型（Ollama 会上报模型 capabilities；
   旧版服务器则显示完整列表）。其他模型名仍可手动输入。
4. 点击基础 URL 下方的 **Test connection（测试连接）**，按结论操作
   （见下表）。

聊天与嵌入请求使用 Ollama 的 OpenAI 兼容 API（`/v1`，要求 Ollama ≥
0.1.14）。模型列表通过 Obsidian 的原生 HTTP 层获取，不受浏览器 CORS 限制。

### 测试连接结果解读

| 结果 | 含义 | 怎么办 |
|---|---|---|
| **OK**（显示服务器版本） | 服务器可达且接受 Obsidian 的请求 | 无需操作 |
| **Cannot reach Ollama** | 原生请求失败 | Ollama 是否运行（`ollama serve`）？基础 URL/端口是否正确？防火墙/代理是否拦截？ |
| **Reachable, but rejects browser requests** | 服务器能响应原生请求，但拒绝渲染进程的 `fetch` —— 这是 `OLLAMA_ORIGINS` 策略 | 见下方配置方法 |
| **Set the base URL first** | 未配置地址 | 填写 Ollama 基础 URL |

### 为什么需要 OLLAMA_ORIGINS（以及如何设置）

聊天/嵌入请求经由渲染进程的 `fetch` 发出，Ollama 会将其视为来自
`app://obsidian.md` 的跨源调用。默认情况下 Ollama 只允许 localhost 来源，
其他一律返回 `403` —— 而浏览器会把它隐藏成不透明的 “Failed to fetch”
（与服务器未启动时的报错相同；测试连接按钮可以区分两者）。

允许 Obsidian 的来源（或用 `*` 允许全部），然后**重启 Ollama**：

- **Windows**（PowerShell，然后重启 Ollama 应用）：
  `setx OLLAMA_ORIGINS "app://obsidian.md"` —— 或通过
  *系统 → 环境变量* 设置。
- **macOS**（终端，然后退出并重开 Ollama 应用）：
  `launchctl setenv OLLAMA_ORIGINS "app://obsidian.md"`
- **Linux**（systemd 服务）：`sudo systemctl edit ollama` 并添加
  ```ini
  [Service]
  Environment="OLLAMA_ORIGINS=app://obsidian.md"
  ```
  然后 `sudo systemctl daemon-reload && sudo systemctl restart ollama`。

一个实用的判断技巧：如果模型下拉列表**能列出模型**，但聊天仍然报网络
错误，那几乎可以肯定是 origins 策略（列表走原生 HTTP，聊天走 `fetch`）。

## 隐私

- 无遥测、无统计分析、无自更新代码（上游插件被下架的原因均已移除）。
- 除你配置的 LLM 提供商调用外，任何数据都不会离开你的设备。
- 聊天记录、向量索引与设置均存储在本地（vault 配置目录内）。

## 从 Infio Copilot 升级的注意事项

- 插件 id 已改为 `infio-copilot-free`，可与旧插件并存安装。设置不会自动
  迁移 —— 如需保留，请在两个插件目录之间复制 `data.json`，然后卸载旧
  插件。
- 聊天/向量数据库保留原存储名（`infio-db`）以保证数据延续。**切勿**同时
  运行两个插件：它们会共享该数据库。
- 针对 `.infio-*` 类名的自定义 CSS 片段需改用新的 `icf-*` 前缀。

## 从源码构建

环境要求：Node 20、pnpm 12。

```bash
pnpm install
pnpm build               # type-check + esbuild production bundle -> main.js
pnpm copy-pglite-assets  # PGlite runtime files -> pglite-assets/
pnpm test
```

将 `main.js`、`manifest.json`、`styles.css` 和 `pglite-assets/*` 的三个文件
复制到仓库的插件目录，然后重载 Obsidian（Ctrl/Cmd+R）。

发布流程、CI 说明与路线图见 [MAINTAINING.md](MAINTAINING.md)。

## 致谢与许可

MIT —— 见 [LICENSE](LICENSE)。
基于 Infio Copilot © Felix.D 与 Smart Composer © Heesu Suh；
延续版本 © 2026 MidliBob 及贡献者。

# mini-code

[![CI](https://github.com/ice-wocker/mini-code/actions/workflows/ci.yml/badge.svg)](https://github.com/ice-wocker/mini-code/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](package.json)

一个迷你版 Claude Code 终端助手：Node.js + Ink，接 OpenAI 兼容 API（OpenAI / 本地 Ollama / 任意代理端点均可）。

> Mini Claude Code in your terminal. OpenAI-compatible API, streaming chat, tool calls, confirm-before-write.

## 特性

- **流式对话** + Markdown 终端渲染（标题、列表、代码块、任务清单、引用块）
- **工具调用**：`read_file` / `write_file` / `edit_file` / `list_dir` / `glob` / `grep` / `run_command` / `todo_write`
- **操作确认**：写文件、改文件、执行命令前显示 diff 预览，按 `y` 确认
- **会话持久化**：自动存 `~/.mini-code/sessions/`，`/sessions` + `/resume <id>` 恢复
- **上下文自动压缩**：超约 75% 窗口时模型总结旧对话，也可 `/compact`
- **@文件引用**：`@src/ui.js` 自动注入文件内容
- **项目记忆**：自动注入 `./AGENTS.md`、`./AGENTS.local.md`、`~/.mini-code/MEMORY.md`
- **待办面板**：`todo_write` 实时显示 ○/◐/●
- **CJK 安全**：宽字符换行与光标，Termux / tmux 不跑行
- **沙箱**：拒绝 cwd 之外路径及 `.env`、`.ssh` 等敏感文件
- **Headless 模式**：`mini-code -p "提示"` 可管道、 scripting

## 要求

- Node.js >= 18

## 安装

```bash
git clone https://github.com/ice-wocker/mini-code.git
cd mini-code
npm ci
npm link   # 可选，之后可直接用 mini-code 命令
```

## 快速开始

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.openai.com/v1   # 可选
export MINI_CODE_MODEL=gpt-4o-mini                 # 可选

node src/index.js
# 或
mini-code --resume <id>
mini-code --auto    # 免确认模式（等价 -y / MINI_CODE_AUTO=1）
mini-code -p "帮我解释 src/agent.js"   # 非交互模式
echo "xxx" | mini-code -p "总结这段输入" -q
```

配置文件 `~/.mini-code/config.json`：

```json
{ "baseUrl": "...", "apiKey": "sk-...", "model": "...", "contextLimit": 128000, "confirmWrites": true }
```

优先级：环境变量 > 配置文件 > 默认值。

## 斜杠命令

`/help` `/clear` `/compact` `/model <名>` `/config` `/cost` `/auto [on|off]`
`/sessions` `/resume <id>` `/memory` `/undo` `/copy` `/git <status|log|diff…>` `/exit`

自定义命令：在 `~/.mini-code/prompts/<名>.md` 放模板，输入 `/<名> [参数]` 即展开（`{{input}}` 或 `$1..$n` 替换）。

多行输入：`Ctrl+J` 换行，`↑/↓` 翻历史；`Ctrl+C` 运行中中止、空闲时退出。

## 结构

```
src/index.js        入口（JSX loader、终端换行补丁）
src/jsx-loader.mjs  esbuild 实时编译 JSX
src/ui.js           Ink 界面、斜杠命令
src/components.js   输入框 / 补全 / 待办面板 / diff 预览 / spinner
src/agent.js        对话循环 + 工具调用 + 自动压缩 + 会话保存
src/tools.js        工具实现
src/markdown.js     Markdown → 终端渲染
src/diff.js         编辑应用 + diff 摘要
src/session.js      会话持久化
src/config.js       配置与记忆文件
src/ansi.js         宽字符/ANSI 处理
src/sandbox.js      路径安全检查
src/headless.js     -p 非交互模式
src/cost.js         模型计费
test/check.mjs      冒烟检查（npm run check）
test/e2e.mjs        tmux 真机 E2E（需 tmux，npm run e2e）
test/fakeapi.mjs    本地假 OpenAI SSE 服务（供测试）
```

## 测试

```bash
npm run check   # 快速冒烟：sanitize / cost / tools / session
npm run e2e     # 需要 tmux，真机跑启动、补全、/cost、确认框
```

## 安全

- 所有写文件 / 改文件 / 跑命令默认要 `y` 确认
- `resolveSafe` 限定 cwd 内，`isDenied` 拦截 `.env` / `.ssh` / `credentials` 等
- 输入经 `sanitize` 剥离 ANSI / OSC（防终端注入伪造剪贴板等）
- `/git` 仅允许 `status/log/diff/show/branch/stash/remote`，无 shell 拼接

## Contributing

欢迎 PR / Issue。请先跑 `npm run check`，大改动附 E2E 截图或录屏。

## License

MIT — 见 [LICENSE](LICENSE)。

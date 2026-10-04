# mini-code 🤏

[![CI](https://github.com/ice-wocker/mini-code/actions/workflows/ci.yml/badge.svg)](https://github.com/ice-wocker/mini-code/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/ice-wocker/mini-code?style=social)](https://github.com/ice-wocker/mini-code/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](package.json)

**A Claude Code you can read in one sitting: ~1,500 lines of Node.js + Ink, talking to any OpenAI-compatible API.**

**一顿饭就能读完的 Claude Code：约 1500 行 Node.js + Ink，接任意 OpenAI 兼容 API（OpenAI / 本地 Ollama / 代理全行）。**

如果觉得有用，点个 ⭐ 就是对我最大的支持！

## 30 秒上手

```bash
git clone https://github.com/ice-wocker/mini-code.git && cd mini-code && npm ci
export OPENAI_API_KEY=sk-...          # 用本地 Ollama 也行：export OPENAI_BASE_URL=http://localhost:11434/v1
node src/index.js
```

长这样：

```
❯ 帮我看看这个项目
● 读取 src/index.js
● 查找 **/*.js
mini-code 是一个终端编程助手：Ink 界面 + OpenAI 兼容 API，
支持 read/write/edit 文件、跑命令，写操作执行前会让你按 y 确认…
[gpt-4o-mini] ▰▰▱▱▱▱▱▱▱▱ 18% $0.004
```

非交互也能用，适合写进脚本：

```bash
mini-code -p "帮我解释 src/agent.js"
echo "xxx" | mini-code -p "总结这段输入" -q
```

## 为什么是 mini-code？

|  | Claude Code / OpenCode / Crush | mini-code |
|---|---|---|
| 代码量 | 几万～几十万行 | **约 1500 行，一个下午读完** |
| 本地模型 | 配置复杂 | `OPENAI_BASE_URL` 指过去就行 |
| 手机/弱终端 | 基本不可用 | **Termux + tmux 专门适配，CJK 不跑行** |
| 写文件 | 直接执行 | **diff 预览 + 按 y 确认，默认不乱动** |
| 学原理 | 文档比代码多 | 代码即文档，想抄就抄 |

## 特性

- **流式对话** + Markdown 终端渲染（标题、列表、代码块、任务清单、引用块）
- **工具调用**：`read_file` / `write_file` / `edit_file` / `list_dir` / `glob` / `grep` / `run_command` / `todo_write`
- **操作确认**：写文件、改文件、执行命令前显示 diff 预览，按 `y` 确认（`--auto` 关闭）
- **会话持久化**：自动存 `~/.mini-code/sessions/`，`/sessions` + `/resume <id>` 恢复
- **上下文自动压缩**：超约 75% 窗口时模型总结旧对话，也可 `/compact`
- **@文件引用**：`@src/ui.js` 自动注入文件内容
- **项目记忆**：自动注入 `./AGENTS.md`、`./AGENTS.local.md`、`~/.mini-code/MEMORY.md`
- **待办面板**：`todo_write` 实时显示 ○/◐/●
- **沙箱**：拒绝 cwd 之外路径及 `.env`、`.ssh` 等敏感文件

## 要求

- Node.js >= 18

## 安装

```bash
git clone https://github.com/ice-wocker/mini-code.git
cd mini-code
npm ci
npm link   # 可选，之后可直接用 mini-code 命令
```

## 配置

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.openai.com/v1   # 可选
export MINI_CODE_MODEL=gpt-4o-mini                 # 可选
```

或配置文件 `~/.mini-code/config.json`：

```json
{ "baseUrl": "...", "apiKey": "sk-...", "model": "...", "contextLimit": 128000, "confirmWrites": true }
```

优先级：环境变量 > 配置文件 > 默认值。

常用启动方式：`node src/index.js` / `mini-code --resume <id>` / `mini-code --auto`（免确认）。

## 斜杠命令

`/help` `/clear` `/compact` `/model <名>` `/config` `/cost` `/auto [on|off]`
`/sessions` `/resume <id>` `/memory` `/undo` `/copy` `/git <status|log|diff…>` `/exit`

自定义命令：在 `~/.mini-code/prompts/<名>.md` 放模板，输入 `/<名> [参数]` 即展开（`{{input}}` 或 `$1..$n` 替换）。

多行输入：`Ctrl+J` 换行，`↑/↓` 翻历史；`Ctrl+C` 运行中中止、空闲时退出。

## 结构（每一行都敢让你读）

```
src/index.js        入口（JSX loader、终端换行补丁）
src/ui.js           Ink 界面、斜杠命令
src/agent.js        对话循环 + 工具调用 + 自动压缩 + 会话保存
src/tools.js        工具实现（read/write/edit/glob/grep/run）
src/components.js   输入框 / 补全 / 待办面板 / diff 预览
src/markdown.js     Markdown → 终端渲染
src/diff.js         编辑应用 + diff 摘要
src/session.js      会话持久化
src/config.js       配置与记忆文件
src/sandbox.js      路径安全检查
src/headless.js     -p 非交互模式
test/check.mjs      冒烟检查（npm run check）
test/e2e.mjs        tmux 真机 E2E（需 tmux，npm run e2e）
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
- `/git` 仅允许白名单子命令，无 shell 拼接

## Contributing

欢迎 PR / Issue，先看 [CONTRIBUTING.md](CONTRIBUTING.md)。中英文都欢迎。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ice-wocker/mini-code&type=Date)](https://star-history.com/#ice-wocker/mini-code&Date)

## License

MIT — 见 [LICENSE](LICENSE)。

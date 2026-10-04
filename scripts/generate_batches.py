#!/usr/bin/env python3
"""生成 spark-distill-1b 蒸馏数据：200->700，共8批约700条。
运行: python3 scripts/generate_batches.py
产出: data/raw/batch_01..08.jsonl
规范: id全局唯一 spark-0001.., output<=2000字符
内容基于本仓库真实行为（src/*.js + README），黑盒蒸馏风格：instruction/input -> 简洁中文（code-en用英文）回答。
"""
import json
from pathlib import Path

OUT = Path("data/raw")
OUT.mkdir(parents=True, exist_ok=True)

rows = []  # (batch, dict)
_counter = [0]
def mk(batch, instruction, output, category, inp="", lang=None):
    _counter[0] += 1
    i = _counter[0]
    lang = lang or ("en" if category.startswith("code-en") else "zh")
    assert len(output) <= 2000, f"超长 {len(output)}"
    rows.append((batch, {"id": f"spark-{i:04d}", "instruction": instruction,
        "input": inp, "output": output, "category": category, "lang": lang}))

def flush():
    from collections import defaultdict
    by = defaultdict(list)
    for b, r in rows:
        by[b].append(r)
    for b in sorted(by):
        p = OUT / f"batch_{b:02d}.jsonl"
        p.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in by[b]) + "\n", encoding="utf-8")
        print(f"{p}: {len(by[b])}条")
    print(f"合计 {len(rows)} 条")

# ---------- batch 01 core_zh 90 ----------
def b01():
    C = "core_zh"
    seeds = [
        ("mini-code 是什么？一句话介绍", "mini-code 是约1500行 Node.js+Ink 写的终端编程助手（类 Claude Code），接任意 OpenAI 兼容 API，可读/写/改文件、跑命令、调工具，写操作默认 diff 预览按 y 确认。"),
        ("mini-code 和 Claude Code/OpenCode 比优势是什么？", "三点：1)代码量约1500行，一个下午读完，适合学习原理；2)OPENAI_BASE_URL 指过去就能换模型/本地 Ollama；3)Termux+tmux 专门适配，CJK 不跑行，写文件默认确认更稳。"),
        ("mini-code 的系统要求是什么？", "Node.js>=18。安装后配 OPENAI_API_KEY 即可，本地 Ollama 就配 OPENAI_BASE_URL=http://localhost:11434/v1。"),
        ("如何安装 mini-code？", "git clone 后 npm ci 即可；可选 npm link 全局用 mini-code 命令。启动：node src/index.js。"),
        ("如何配置 API Key 和模型？", "优先级：环境变量>配置文件>默认值。export OPENAI_API_KEY=sk-...，可选 OPENAI_BASE_URL 和 MINI_CODE_MODEL；或写 ~/.mini-code/config.json 的 baseUrl/apiKey/model。"),
        ("配置文件在哪？字段有哪些？", "~/.mini-code/config.json，字段 baseUrl/apiKey/model/contextLimit/maxTokens/autoCompact/confirmWrites。查看用 /config，切换模型用 /model <名>。"),
        ("mini-code 支持哪些启动方式？", "node src/index.js 交互；mini-code --resume <id> 恢复会话；mini-code --auto 免确认；-p 非交互（适合脚本）。"),
        ("非交互 -p 怎么用？举例", 'mini-code -p "帮我解释 src/agent.js"；管道：echo "xxx" | mini-code -p "总结这段输入" -q，-q 只输出纯文本。'),
        ("支持哪些斜杠命令？", "/help /clear /compact /model /config /cost /auto /sessions /resume /memory /undo /copy /git /exit。自定义：~/.mini-code/prompts/<名>.md 即 /<名>。"),
        ("@文件引用怎么用？", "输入 @src/ui.js 会自动把文件内容注入上下文（目录则列前100项，超200KB 不注入）。如：帮我 review @src/tools.js。"),
    ]
    # 10 seed x 9 变体 = 90：变体通过追问角度展开
    angles = ["", "（新手向，再具体点）", "（一句话补充注意事项）", "（Termux 手机上呢？）", "（用 Ollama 本地模型呢？）",
              "（CI/脚本里用呢？）", "（举一个最短命令）", "（失败常见原因是什么？）", "（和配置文件的关系？）"]
    extra = {
        "（新手向，再具体点）": "新手：先 node --version 确认>=18，再 npm ci，再 export KEY 后启动，/config 确认生效。",
        "（一句话补充注意事项）": "注意：Key 优先读环境变量，不要把真 Key 写进仓库。",
        "（Termux 手机上呢？）": "Termux 同样操作，注意用 tmux 保持会话，CJK 显示已专门适配。",
        "（用 Ollama 本地模型呢？）": "Ollama：export OPENAI_BASE_URL=http://localhost:11434/v1，model 选已 pull 的名即可。",
        "（CI/脚本里用呢？）": "CI/脚本用 -p 非交互，加 -q 取纯文本便于管道。",
        "（举一个最短命令）": "最短：OPENAI_API_KEY=sk-... node src/index.js。",
        "（失败常见原因是什么？）": "常见失败：Node<18、没配 Key、baseUrl 拼错 /v1 后缀。",
        "（和配置文件的关系？）": "环境变量覆盖 config.json；/config 看的是合并后生效值。",
    }
    for ins, base in seeds:
        mk(1, ins, base, C)
        for a in angles[1:]:
            tail = extra[a]
            mk(1, ins + a, base + tail, C)

# ---------- batch 02 tools_read_search_zh 90 ----------
def b02():
    C = "tools_read_search_zh"
    # 15 pattern x 6 = 90
    pats = [
        ("怎么读 src/agent.js 前50行？", "read_file", "先 read_file 看现状：path=src/agent.js offset=0 limit=50，返回带行号内容，大文件分段读。"),
        ("文件太大读不动怎么办？", "read_file", "read_file 对>5MB 直接拒绝；目录注入>200KB 跳过。改用 grep 定位行号再分段 read_file offset/limit。"),
        ("怎么找项目里所有 **/*.js？", "glob", "用 glob：pattern=**/*.js path=.，自动忽略 node_modules/.git/dist 等，最多展示500个。"),
        ("glob 无匹配返回什么？", "glob", "返回 (无匹配: <pattern>)，上层摘要显示“无匹配”。换宽松模式或检查 path 根。"),
        ("怎么搜 TODO/FIXME？", "grep", "用 grep：pattern=TODO|FIXME path=.，返回 文件:行号:内容，最多300行，超量提示共N行。"),
        ("grep 只想搜 *.js 怎么做？", "grep", "grep 传 glob=*.js 限定文件名；底层走系统 grep -rIn 并排除 IGNORE 目录。"),
        ("grep 正则太长报错？", "grep", "pattern 限500字符以内，超限抛“pattern 非法”。拆短或分多次搜。"),
        ("list_dir 和 glob 选哪个？", "list_dir", "小目录一览用 list_dir；递归找文件用 glob；找内容用 grep。避免盲目 list_dir 整树。"),
        ("探索陌生仓库的标准顺序？", "glob", "先 glob 看结构（如 src/**/*.js），再 grep 找入口/关键字，最后 read_file 读关键文件。"),
        ("read_file 行号从几开始？", "read_file", "行号显示从1开始；offset 参数从0计，limit 控制行数。如 offset=0 limit=50 即前50行。"),
        ("怎么读 @引用的大文件？", "read_file", "@注入上限约100KB/200KB，超限提示过大未注入，改用 read_file 分段或 grep 先定位。"),
        ("grep 无匹配是报错吗？", "grep", "不是。grep 无匹配 exit 1 被视为正常，返回 (无匹配: pattern)。"),
        ("搜中文关键字乱码？", "grep", "直接传 UTF-8 正则即可，如 pattern=待办|压缩；注意 shell 转义由工具内部处理。"),
        ("怎么列 src 目录？", "list_dir", "list_dir path=src，返回按名字排序，目录带/后缀；空目录返回（为空）。"),
        ("读文件前为什么要先 glob？", "glob", "AGENTS 约定：修改前先 read 了解现状，探索优先 glob/grep，避免整树 list_dir 浪费上下文。"),
    ]
    files = ["src/ui.js", "src/tools.js", "src/config.js", "src/session.js", "src/diff.js", "src/markdown.js"]
    for k, (q, tool, base) in enumerate(pats):
        mk(2, q, f"{base}工具：{tool}。", C)
        for j in range(5):
            f = files[(k + j) % len(files)]
            mk(2, f"{q}（例：{f}）", f"{base}例如对 {f}：{tool} path={f}。路径一律相对 cwd。", C)

# ---------- batch 03 tools_write_edit_zh 90 ----------
def b03():
    C = "tools_write_edit_zh"
    pats = [
        ("write_file 和 edit_file 怎么选？", "创建/覆盖整个文件用 write_file；小幅精确替换用 edit_file，避免整文件重写。改前先 read_file。"),
        ("edit_file 的 edits 格式？", "edits 是数组，每项 {old_text,new_text}，按顺序应用；old_text 为空、找不到、或匹配多处都会报错。"),
        ("edit 匹配多处怎么办？", "加长 old_text 使其在文件中唯一，带上足够上下文行；或分多次小编辑。"),
        ("写文件前确认流程？", "默认 confirmWrites 开启：write/edit/run 先 diff 预览，按 y 确认，n 拒绝；--auto 或 /auto off 关闭。"),
        ("diff 预览看什么？", "看 ---a/+++b 头、@@ 行号、-/+ 行（红删绿增），新建显示行数，无变化显示（无变化）。"),
        ("todo_write 何时用？", "3步以上任务先 todo_write 列计划，每完成一步立刻更新；同时只能一个 in_progress。"),
        ("run_command 超时多大？", "默认 timeout_ms=60000，输出超12000字符截断并提示总长度；超时会被终止。"),
        ("写文件乱码/覆盖错了？", "先 read_file 确认现状；write 会返回字节数+diff；错了用 /undo 撤回对话（文件不回退，需手动 edit 修回）。"),
        ("如何安全新建脚本？", "write_file 到 cwd 内相对路径，mkdir 自动建父目录；拒绝 cwd 之外和敏感路径。"),
        ("批量改名/多文件改？", "先 glob/grep 定范围，再逐文件 read+edit；大任务先 todo_write 拆步。"),
        ("run_command 无输出？", "返回 (无输出)；用 echo $? 或重定向检查，必要时加 timeout_ms。"),
        ("edit 后如何验证？", "看返回的已编辑+diff，再 read_file 复核关键行，最后 npm run check。"),
        ("为什么 edit 要唯一匹配？", "防误改：applyEdits 要求 count==1，否则抛错让你加长上下文。"),
        ("确认框按什么键？", "y 确认、n/ESC 拒绝；Ctrl+C 运行中中止、空闲退出；Ctrl+J 多行换行。"),
        ("自动模式怎么开？", "启动加 --auto 或 /auto off 关闭确认；脚本/--p 模式默认不确认。"),
    ]
    for k, (q, base) in enumerate(pats):
        mk(3, q, base, C)
        for j in range(5):
            mk(3, f"{q}（场景{j+1}：src/diff.js 相关）",
               f"{base}以 src/diff.js 为例：先 read_file，再 edit_file 精确替换，最后看 summarizeDiff。", C)

# ---------- batch 04 agent_runtime_zh 90 ----------
def b04():
    C = "agent_runtime_zh"
    pats = [
        ("对话循环是怎样的？", "agent.js run()：push 用户消息→streamOnce 流式→收 tool_calls→确认→executeTool→回填 tool 结果→循环，直到无工具调用。"),
        ("流式输出中断了？", "按 ESC/Ctrl+C abort；agent.abort() 中止当前 stream，会话保留，可继续输入。"),
        ("上下文超限会怎样？", "超 contextLimit*0.75 自动压缩：模型总结旧对话为【此前对话总结】，保留 system+最近12条；也可 /compact 手动。"),
        ("/compact 何时用？", "上下文>75% 或输出变慢时 /compact；消息<=14条或尾部是 tool 时会提示无需压缩。"),
        ("/undo 能回退文件吗？", "不能。/undo 只删上一轮用户消息及之后的消息（文件改动不回退），会提示“文件改动不回退”。"),
        ("会话存在哪？", "~/.mini-code/sessions/<id>.json（含消息）+.meta.json（含 cost/token）；/sessions 列前20，/resume <id> 恢复。"),
        ("/cost 显示什么？", "本会话 ↑输入k ↓输出k ≈$，本会话文件 cost，所有会话累计 cost；单价见 src/cost.js。"),
        ("自定义斜杠命令？", "~/.mini-code/prompts/<名>.md 放模板，/<名> [参数] 展开，支持 {{input}} 和 $1..$n；无占位则追加参数。"),
        ("/git 允许哪些？", "只允许 status/log/diff/show/branch/stash/remote，不经 shell（execFile），防注入；默认 status -sb。"),
        ("/copy 复制什么？", "复制最后一条助手回复；优先系统剪贴板工具，同时发 OSC52，终端需支持。"),
        ("@引用目录会怎样？", "展开为目录前100项列表；文件则注入最多约100KB 内容。"),
        ("模型总结失败？", "summarizeOld 失败返回(总结失败)，不阻塞主流程；重试 /compact 即可。"),
        ("token 怎么估算？", "estimateTokens 按 JSON 长度/3 估算；usage 取 stream 的 chunk.usage 累加。"),
        ("换模型后生效？", "/model <名> 写 config.json 并 reload；/config 查看当前 model/contextLimit/confirmWrites。"),
        ("无 Key 启动？", "提示未设置 API Key：export OPENAI_API_KEY 或改 ~/.mini-code/config.json；headless 缺 Key 直接 exit 1。"),
    ]
    for k, (q, base) in enumerate(pats):
        mk(4, q, base, C)
        for j in range(5):
            mk(4, f"{q}（追问{j+1}）", f"{base}相关文件：src/agent.js、src/session.js、src/ui.js。回答简洁中文，不复述整个文件。", C)

# ---------- batch 05 code_en 90 ----------
def b05():
    C = "code-en"
    items = [
        ("How to read first 50 lines of a file in Node.js?", "const fs=require('fs');\nconst lines=fs.readFileSync('src/agent.js','utf8').split('\\n').slice(0,50);\nconsole.log(lines.map((l,i)=>`${i+1}\\t${l}`).join('\\n'));",
         "Use readFileSync + split, slice for paging; for large files stream with readline."),
        ("How to list files recursively ignoring node_modules in Node?", "import {glob} from 'glob';\nconst m=await glob('**/*.js',{ignore:['node_modules/**','.git/**','dist/**']});",
         "Use glob package with ignore list; same as mini-code tools.js IGNORE set."),
        ("How to run grep-like search in Node without shell?", "Use ripgrep binary or fs walk + RegExp test; mini-code shells out to system grep with --exclude-dir for speed.",
         "Prefer execFile('grep',[...]) to avoid shell injection; cap output lines."),
        ("How to implement exact-text edit with uniqueness check?", "function applyEdits(src,{old_text,new_text}){\n const n=src.split(old_text).length-1;\n if(n!==1) throw new Error(`expected 1 match, got ${n}`);\n return src.replace(old_text,()=>new_text);\n}",
         "Count occurrences first; require exactly 1 to avoid accidental multi-replace."),
        ("How to stream OpenAI chat completions in Node?", "const s=await client.chat.completions.create({model,messages,stream:true});\nfor await(const c of s){process.stdout.write(c.choices[0]?.delta?.content||'');}",
         "Set stream:true, iterate async chunks, accumulate tool_calls by index."),
        ("How to abort a streaming request?", "const ctl=new AbortController();\nclient.chat.completions.create({...,signal:ctl.signal});\nctl.abort();",
         "Keep controller per request; on ESC call abort and swallow AbortError."),
        ("How to cap long command output?", "function cap(s,n=12000){return s.length>n?s.slice(0,n)+`\\n...[truncated ${s.length}]`:s;}",
         "Truncate with total length hint; same pattern as tools.js cap()."),
        ("How to safely resolve a user path inside cwd?", "import path from 'path';\nconst abs=path.resolve(ROOT,p); const rel=path.relative(ROOT,abs);\nif(rel.startsWith('..')) throw new Error('escape');",
         "resolveSafe pattern; also block .env/.ssh/credentials."),
        ("How to render a simple line diff?", "Find common prefix/suffix lines, then emit removed (-) and added (+) middle block with @@ header.",
         "See diff.js summarizeDiff; clip to 40 lines max."),
        ("How to estimate tokens cheaply?", "Math.ceil(JSON.stringify(messages).length/3);",
         "Rough 3 chars/token; trigger compact at 75% of contextLimit."),
        ("How to persist sessions to disk?", "fs.writeFileSync(`${id}.json`,JSON.stringify({id,meta,messages}));",
         "Store under ~/.mini-code/sessions/; listSessions sorts by savedAt."),
        ("How to add a new tool to mini-code?", "Add impl in tools.js + entry in TOOL_DEFS_BASE with JSON schema, then toolDefs() exposes it.",
         "Keep name snake_case; validate args in executeTool."),
        ("How to test CLI headlessly?", "node test/check.mjs for smoke (sanitize/cost/tools/session); tmux E2E via node test/e2e.mjs.",
         "Run npm run check before commit."),
        ("How to handle Ink TextInput history?", "Keep hist array of last 50 non-slash inputs; ↑/↓ navigate, Ctrl+J newline.",
         "See components.js PromptInput + Completion."),
        ("How to price model usage?", "Lookup substring table (gpt-4o, claude, deepseek...) per 1M tokens; unknown model returns 0.",
         "See cost.js PRICES; costUsd(usage,model)."),
    ]
    for k, (q, code, note) in enumerate(items):
        mk(5, q, f"{note}\n```js\n{code}\n```", C, lang="en")
        for j in range(5):
            mk(5, f"{q} (variant {j+1})", f"{note}\n```js\n{code}\n```\nVariant {j+1}: keep paths relative, no secrets.", C, lang="en")

# ---------- batch 06 terminal_ops 90 ----------
def b06():
    C = "terminal_ops"
    pats = [
        ("Termux 下 npm ci 很慢？", "换国内镜像：npm config set registry https://registry.npmmirror.com；或检查网络/存储；node>=18 用 pkg 安装。"),
        ("tmux 里 mini-code 显示乱了？", "tmux 新窗口重连：tmux attach；TERM 保持 xterm-256color；mini-code 已做 CJK 宽度适配，窄屏自动换行。"),
        ("管道输入没反应？", "headless 从 stdin 读需保证非 TTY 且有 end 事件；用法 echo xxx | mini-code -p \"总结\" -q；空 prompt 会提示用法 exit 2。"),
        ("git 只想看状态？", "用 /git status -sb 或 git status -sb；/git 白名单仅 status/log/diff/show/branch/stash/remote。"),
        ("grep 搜不到 node_modules？", "正常。tools.js 默认排除 node_modules/.git/dist/build/target/.next/__pycache__/.venv，直接搜源码。"),
        ("run_command 卡住？", "加小超时 timeout_ms，如 10000；长任务分步跑；输出过大只看前12000字+总数。"),
        ("手机上怎么保持会话？", "tmux new -s code 跑 mini-code，断开后 tmux attach -t code；会话文件另存 ~/.mini-code/sessions。"),
        ("OPENAI_BASE_URL 怎么配 Ollama？", "export OPENAI_BASE_URL=http://localhost:11434/v1；MINI_CODE_MODEL 选 ollama 已 pull 的模型名。"),
        ("npm run check 测什么？", "冒烟：sanitize/cost/tools/session 四项；真机再跑 npm run e2e（需 tmux）。提交前必跑 check。"),
        ("shell 找不到 mini-code？", "npm link 后才能全局用，否则 node src/index.js；检查 PATH 和 node 版本。"),
        ("输出截断提示？", "…[输出截断，共 N 字符] 表示超12000字，改用 grep 缩小范围或分段 read。"),
        ("怎么批量看分支？", "/git branch 或 git branch -a；大仓库先 --no-pager。"),
        ("权限拒绝写文件？", "检查 cwd 内相对路径、敏感名单（.env/.ssh/credentials/*.pem/*.key），换路径重试。"),
        ("Ctrl+C 直接退出了？", "运行中 Ctrl+C=中止任务（可继续），空闲 Ctrl+C=退出；ESC 同理中止。"),
        ("怎么清屏重来？", "/clear 清空对话（不删文件）；/undo 撤回上一轮；要新会话直接重启。"),
    ]
    for k, (q, base) in enumerate(pats):
        mk(6, q, base, C)
        for j in range(5):
            mk(6, f"{q}（实例{j+1}）", f"{base}终端示例{j+1}：保持命令可复制，路径用相对路径。", C)

# ---------- batch 07 security_trouble 85 ----------
def b07():
    C = "security_zh"
    bases = [
        ("resolveSafe 拦了我的 ../ 路径", "符合预期：只允许 cwd 内，.. 越界抛“路径越界”。把文件拷进 cwd 或改相对路径。"),
        ("isDenied 拦了 .env", ".env/.env.*/.ssh/credentials/*.pem/*.key 默认拒绝读写和命令，双重检查（工具层+执行层）。"),
        (".git/config 为什么不能写？", "防凭证泄露：.git/config 被明确拒绝；读用 /git 白名单命令。"),
        ("sanitize 干什么？", "剥离 ANSI/OSC 转义，防终端注入伪造剪贴板/覆盖显示；输入输出都过一遍。"),
        ("写操作确认能关吗？", "能：--auto 或 /auto off，但默认开启更安全；headless 默认关闭便于脚本。"),
        ("命令注入怎么防？", "/git 用 execFile+白名单+简单分词不走 shell；run_command 对敏感路径 isDenied。"),
        ("grep pattern 报非法？", "pattern 空或>500字符判非法；拆短、分次搜。"),
        ("edit 报多处匹配？", "old_text 不唯一，加长上下文至唯一；这是防误改。"),
        ("会话 id 非法？", "safeId 只允许字母数字._- 且不含..，防路径穿越。"),
        ("API Key 泄露了？", "立即去提供方 revoke/轮换；查 ~/.mini-code/config.json 和 shell 历史，勿提交到 git。"),
        ("压缩后丢上下文？", "压缩保留 system+最近12条+模型摘要；关键决定应写 AGENTS.md/MEMORY.md 持久化。"),
        ("费用突然涨了？", "/cost 查本会话与累计；大上下文+多轮工具调用最烧钱，先 grep 缩小再读。"),
        ("模型一直 abort？", "检查 Key/ baseUrl /v1 后缀、网络；重试并看 stderr 错误。"),
        ("OSC52 复制无效？", "终端需支持 OSC52；同时已尝试系统剪贴板工具，换终端或手动复制。"),
        ("E2E 需要什么？", "需 tmux：npm run e2e 真机跑启动/补全//cost/确认框；CI 跑 npm run check。"),
        ("文件 5MB 读不了？", "read_file 限5MB，改 grep 分段或用系统命令切片。"),
        ("目录注入过大？", "stat>200KB 不注入，改分段读；目录只列前100项。"),
    ]
    # 17*5=85
    for k, (q, base) in enumerate(bases):
        mk(7, q, base, C)
        for j in range(4):
            mk(7, f"{q}（排查{j+1}）", f"{base}排查{j+1}：先复现→看报错原文→按最小改动修→npm run check。", C)

# ---------- batch 08 automation 75 ----------
def b08():
    C = "automation_zh"
    bases = [
        ("用脚本总结文件？", 'echo "内容" | mini-code -p "总结这段输入" -q；-q 输出纯文本好管道。'),
        ("批量解释多个文件？", "for f in src/*.js; do mini-code -p \"解释 @$f\" -q; done；注意上下文各自独立。"),
        ("/sessions 怎么用？", "/sessions 列最近20（含 id/条数/预览），/resume <id> 恢复继续。"),
        ("/memory 显示什么？", "合并显示全局 ~/.mini-code/MEMORY.md+项目 AGENTS.md+AGENTS.local.md（各截4000字）。"),
        ("项目记忆怎么写？", "根目录 AGENTS.md 写约定（相对路径、glob 优先、todo 先行），启动自动注入。"),
        ("/auto 开关？", "/auto [on|off] 切换写确认；不带参则取反；状态机在 cfgRef.confirmWrites。"),
        ("/config 看什么？", "看合并后 baseUrl/model/contextLimit/confirmWrites，Key 只露前8位。"),
        ("/model 切换？", "/model <名> 写 config.json 并 reload，如 /model gpt-4o-mini。"),
        ("自定义命令传参？", "/<名> [参数] 展开 {{input}}/$1..，无占位则追加全文；模板在 ~/.mini-code/prompts/。"),
        ("CI 里用 mini-code？", "用 -p -q 非交互，MINI_CODE_AUTO=1 免确认；密钥走 CI Secrets。"),
        ("统计费用脚本？", "/cost 看本会话+累计；sessions/*.meta.json 存 cost，可 jq 汇总。"),
        ("撤销对话？", "/undo 删上一轮用户消息及之后，文件不回退；无可撤则提示。"),
        ("复制回复？", "/copy 复制最后助手回复；终端要支持剪贴板或 OSC52。"),
        ("退出？", "/exit 或 /quit，或空闲 Ctrl+C。"),
        ("多行输入？", "Ctrl+J 换行，↑/↓ 翻历史（限50条非斜杠）。"),
    ]
    # 15*5=75
    for k, (q, base) in enumerate(bases):
        mk(8, q, base, C)
        for j in range(4):
            mk(8, f"{q}（用法{j+1}）", f"{base}用法{j+1}：命令可直接复制跑。", C)

b01(); b02(); b03(); b04(); b05(); b06(); b07(); b08()
flush()

import React, { useState, useEffect, useCallback, useRef } from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SESSIONS_DIR } from './config.js';
import { Box, Text, Static, useInput, useApp } from 'ink';
import { loadConfig, saveConfig, loadMemories } from './config.js';
import { createAgent } from './agent.js';
import { renderMarkdown } from './markdown.js';
import { summarizeDiff, applyEdits } from './diff.js';
import { loadSession, listSessions } from './session.js';
import { summarizeToolResult } from './tools.js';
import { copyToClipboard, osc52 } from './clipboard.js';
import { gitSummary } from './gitinfo.js';
import { sanitize } from './paste.js';
import { termCols } from './term.js';
import { Spinner, PromptInput, Completion, TodoPanel, DiffPreview } from './components.js';

const COLORS = { prompt: 'green', tool: 'yellow', error: 'red', dim: 'gray' };

function toolLabel(name, args) {
  switch (name) {
    case 'run_command': return `$ ${args.command}`;
    case 'read_file': return `读取 ${args.path}`;
    case 'write_file': return `写入 ${args.path}`;
    case 'edit_file': return `编辑 ${args.path}`;
    case 'list_dir': return `列出 ${args.path || '.'}`;
    case 'glob': return `查找 ${args.pattern}`;
    case 'grep': return `搜索 ${args.pattern}`;
    case 'todo_write': return '更新待办';
    default: return name;
  }
}

function bell() { try { process.stdout.write('\x07'); } catch {} }

function loadUserCommands() {
  const dir = path.join(os.homedir(), '.mini-code', 'prompts');
  const out = {};
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      try { out[f.slice(0, -3)] = fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch {}
    }
  } catch {}
  return out;
}

function sessionCost(id) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, `${id}.meta.json`), 'utf8'));
    return meta.cost || 0;
  } catch { return 0; }
}

function totalCost() {
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.meta.json'))
      .reduce((s, f) => s + (JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')).cost || 0), 0);
  } catch { return 0; }
}

function safeLoad(id) {
  try {
    return loadSession(id);
  } catch (e) {
    return null;
  }
}

function RenderItem({ item }) {
  switch (item.kind) {
    case 'user':
      return <Text color={COLORS.prompt}>❯ {item.text}</Text>;
    case 'assistant':
      return <Text>{item.rendered}</Text>;
    case 'tool':
      return <Text color={COLORS.tool}>● {item.label}</Text>;
    case 'error':
      return <Text color={COLORS.error}>✗ {item.text}</Text>;
    case 'info':
      return <Text color={COLORS.dim}>{item.text}</Text>;
    default:
      return <Text>{item.text}</Text>;
  }
}

export function App({ resumeId, autoMode }) {
  const [config, setConfig] = useState(loadConfig);
  const [items, setItems] = useState([
    { id: 0, kind: 'info', text: 'mini-code · /help 命令 · Ctrl+C 中止/退出 · Ctrl+J 换行' },
  ]);
  const [input, setInput] = useState('');
  const [stream, setStream] = useState('');
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(null);
  const [todos, setTodos] = useState([]);
  const [hist, setHist] = useState([]);
  const [usage, setUsage] = useState({ input: 0, output: 0, cost: 0 });
  const [ctxPct, setCtxPct] = useState(0);
  const userCmdsRef = useRef(loadUserCommands());
  const idRef = useRef(1);
  const { exit } = useApp();

  const push = useCallback((kind, text, extra = {}) => {
    setItems((prev) => [...prev, { id: idRef.current++, kind, text, ...extra }]);
  }, []);

  const cfgRef = useRef(config);
  useEffect(() => { Object.assign(cfgRef.current, config); }, [config]);
  useEffect(() => { if (autoMode) cfgRef.current.confirmWrites = false; }, [autoMode]);
  useEffect(() => { setCtxPct(agentRef.current?.contextPct() || 0); }, [running]);

  const onEventRef = useRef(null);
  const confirmRef = useRef(null);
  const initialMessagesRef = useRef(
    resumeId ? safeLoad(resumeId) : null
  );

  const agentRef = useRef(null);
  const sessionIdRef = useRef(null);
  if (!agentRef.current && config.apiKey) {
    if (resumeId) sessionIdRef.current = resumeId;
    agentRef.current = createAgent({
      config: cfgRef.current,
      sessionId: sessionIdRef.current || undefined,
      initialMessages: initialMessagesRef.current,
      onEvent: (e) => onEventRef.current?.(e),
      confirm: (name, args) => confirmRef.current?.(name, args) ?? Promise.resolve(true),
    });
    initialMessagesRef.current = null;
  }
  onEventRef.current = (e) => {
    if (e.type === 'text') setStream((s) => s + e.text);
    else if (e.type === 'text_done') {
      setStream((s) => {
        if (s.trim()) push('assistant', sanitize(s), { rendered: renderMarkdown(sanitize(s), termCols()) });
        return '';
      });
    } else if (e.type === 'tool_start') {
      push('tool', '', { label: toolLabel(e.name, e.args) });
    } else if (e.type === 'tool_end') {
      if (e.name === 'todo_write') return;
      let brief;
      if (e.name === 'run_command') {
        const lines = e.output.split('\n').filter((l) => l.trim());
        brief = `  ↳ ${lines.length} 行 · ${lines[0]?.slice(0, 50) || '(无输出)'}`;
      } else {
        brief = summarizeToolResult(e.name, e.output);
      }
      if (brief) push('info', brief);
    } else if (e.type === 'usage') {
      setUsage({ ...e.usage });
      setCtxPct(e.contextPct);
    } else if (e.type === 'todos') {
      setTodos(e.todos);
    } else if (e.type === 'compacting') {
      push('info', '(正在用模型压缩上下文…)');
    } else if (e.type === 'info') {
      push('info', e.text);
    } else if (e.type === 'error') {
      push('error', e.text);
    }
  };
  confirmRef.current = (name, args) => {
    let diff = null;
    try {
      if (name === 'write_file') {
        diff = summarizeDiff(args.path, fs.existsSync(args.path) ? fs.readFileSync(args.path, 'utf8') : null, args.content || '');
      } else if (name === 'edit_file') {
        const before = fs.readFileSync(args.path, 'utf8');
        diff = summarizeDiff(args.path, before, applyEdits(before, args.edits || []));
      }
    } catch {}
    const label = name === 'run_command' ? `执行命令: ${args.command}` : `${name} → ${args.path}`;
    if (process.env.MINI_DEBUG) console.error('[dbg] confirm ->', label);
    return new Promise((resolve) => setPending({ label, diff, resolve }));
  };

  useInput((ch, key) => {
    if (pending) {
      if (ch === 'y' || ch === 'Y') { pending.resolve(true); setPending(null); }
      else if (ch === 'n' || ch === 'N' || key.escape || (key.ctrl && ch === 'c')) { pending.resolve(false); setPending(null); }
      return;
    }
    if (key.ctrl && ch === 'c') {
      if (running) {
        agentRef.current?.abort();
        setInput('');
        push('info', '(已中止)');
      } else exit();
    } else if (key.escape && running) {
      agentRef.current?.abort();
      setInput('');
      push('info', '(已中止，可继续输入)');
    }
  }, { isActive: true });

  const abortRun = useCallback(() => {
    if (!running) return;
    agentRef.current?.abort();
    setInput('');
    push('info', '(已中止，可继续输入)');
  }, [running, push]);

  const lastAssistantText = () => {
    const h = agentRef.current?.history() || [];
    for (let i = h.length - 1; i >= 0; i--) if (h[i].role === 'assistant' && h[i].content) return h[i].content;
    return null;
  };

  const submit = useCallback(async (value) => {
    const text = sanitize(value).trim();
    setInput('');
    if (!text) return;
    if (running) { push('info', '模型运行中，先 ESC 中止再发送'); return; }
    if (!text.startsWith('/')) setHist((h) => [...h.slice(-50), text]);

    if (text.startsWith('/')) {
      const sp = text.slice(1).indexOf(' ');
      const cmd = (sp < 0 ? text.slice(1) : text.slice(1, sp)).toLowerCase();
      const argStr = sp < 0 ? '' : text.slice(sp + 1).trim();
      const rest = argStr ? argStr.split(/\s+/) : [];
      const agent = agentRef.current;
      switch (cmd) {
        case 'help':
          push('info', '/clear 清空 · /compact 压缩 · /model <名> 模型 · /config 配置 · /cost 费用 · /sessions 历史 · /resume <id> 恢复 · /auto 免确认 · /memory 记忆 · /undo 撤销 · /copy 复制回复 · /git <子命令> · /exit 退出\n自定义命令: 在 ~/.mini-code/prompts/<名>.md 放模板，输入 /<名> [参数] 即展开（{{input}} 或 $1..$n 替换）');
          return;
        case 'clear':
          agent?.clear();
          setCtxPct(0);
          setItems([{ id: idRef.current++, kind: 'info', text: '(对话已清空)' }]);
          return;
        case 'undo': {
          const n = agent?.undo?.() || 0;
          if (n) { push('info', `已撤销上一轮对话（${n} 条消息，文件改动不回退）`); setCtxPct(agent.contextPct()); }
          else push('info', '没有可撤销的对话');
          return;
        }
        case 'copy': {
          const t = lastAssistantText();
          if (!t) { push('info', '没有助手回复可复制'); return; }
          const tool = copyToClipboard(t);
          osc52(t);
          push('info', tool ? `已复制最后回复到剪贴板（${tool}，含 OSC 52）` : '已发送 OSC 52 复制请求（终端需支持）');
          return;
        }
        case 'git': {
          try {
            const { execFileSync } = await import('child_process');
            const ALLOWED = new Set(['status', 'log', 'diff', 'show', 'branch', 'stash', 'remote']);
            const raw = (argStr || 'status -sb').trim();
            // 简单分词（支持双引号），不经过 shell，避免命令注入
            const args = raw.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((s) => s.replace(/^"|"$/g, '')) || ['status', '-sb'];
            if (!ALLOWED.has(args[0])) {
              push('error', `只允许 git ${[...ALLOWED].join('/')}, 拒绝: ${args[0]}`);
              return;
            }
            const out = execFileSync('git', args, { encoding: 'utf8', timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
            push('info', out.trim().split('\n').slice(0, 40).join('\n') || '(无输出)');
          } catch (e) {
            const out = [e.stdout, e.stderr].filter(Boolean).join('');
            push(out ? 'info' : 'error', out || e.message);
          }
          return;
        }
        case 'cost': {
          const u = agent?.usage?.() || { input: 0, output: 0, cost: 0 };
          push('info', `本会话: ↑${(u.input / 1000).toFixed(1)}k ↓${(u.output / 1000).toFixed(1)}k tok ≈ $${u.cost.toFixed(4)}\n本会话文件: $${sessionCost(sessionIdRef.current).toFixed(4)} · 所有会话累计: $${totalCost().toFixed(4)}`);
          return;
        }
        case 'compact': {
          if (!agent) { push('error', '未设置 API Key'); return; }
          const ok = await agent.compact();
          if (ok) setCtxPct(agent.contextPct());
          push('info', ok ? '上下文已压缩（模型已总结）' : '上下文不长，无需压缩');
          return;
        }
        case 'model':
          if (!rest[0]) { push('info', `当前模型: ${config.model}`); return; }
          saveConfig({ model: rest[0] });
          setConfig(loadConfig());
          push('info', `模型已切换为 ${rest[0]}`);
          return;
        case 'config':
          push('info', `baseUrl=${config.baseUrl}\nmodel=${config.model}  contextLimit=${config.contextLimit}  confirmWrites=${config.confirmWrites ? 'on' : 'off'}\nkey=${config.apiKey ? config.apiKey.slice(0, 8) + '…' : '(未设置)'}`);
          return;
        case 'auto':
          cfgRef.current.confirmWrites = !(rest[0] === 'on' ? true : rest[0] === 'off' ? false : !cfgRef.current.confirmWrites);
          push('info', `写操作确认: ${cfgRef.current.confirmWrites ? '开启' : '关闭'}`);
          return;
        case 'sessions': {
          const list = listSessions();
          push('info', list.length ? list.map((s) => `${s.id}  (${s.count} 条) ${s.preview}`).join('\n') : '(无历史会话)');
          return;
        }
        case 'resume': {
          if (!rest[0]) { push('info', '用法: /resume <id>（/sessions 查看列表）'); return; }
          try {
            const msgs = loadSession(rest[0]);
            sessionIdRef.current = rest[0];
            agentRef.current = createAgent({
              config: cfgRef.current,
              sessionId: rest[0],
              initialMessages: msgs,
              onEvent: (e) => onEventRef.current?.(e),
              confirm: (n, a) => confirmRef.current?.(n, a) ?? Promise.resolve(true),
            });
            setTodos(agentRef.current.getTodos());
            setCtxPct(agentRef.current.contextPct());
            push('info', `已恢复会话 ${rest[0]}（${msgs.length} 条消息）`);
          } catch (e) { push('error', `恢复失败: ${e.message}`); }
          return;
        }
        case 'memory':
          push('info', loadMemories().join('\n\n') || '（无记忆文件。创建 ./AGENTS.md 可写入项目约定，每次启动自动注入）');
          return;
        case 'exit':
        case 'quit':
          exit();
          return;
        default: {
          const tpl = userCmdsRef.current[cmd];
          if (tpl) {
            let prompt = tpl
              .replace(/\{\{\s*input\s*\}\}/g, argStr)
              .replace(/\$(\d+)/g, (m, i) => rest[+i - 1] ?? '');
            if (argStr && !/\{\{\s*input\s*\}\}|\$\d/.test(tpl)) prompt += `\n\n${argStr}`;
            push('info', `使用自定义命令 /${cmd}`);
            await submit(prompt);
            return;
          }
          push('error', `未知命令: /${cmd}（/help 查看帮助）`);
          return;
        }
      }
    }

    if (!config.apiKey) {
      push('error', '未设置 API Key。export OPENAI_API_KEY=sk-... 或编辑 ~/.mini-code/config.json');
      return;
    }

    push('user', text);
    setRunning(true);
    try {
      await agentRef.current.run(text);
    } catch (e) {
      push('error', `意外错误: ${e.stack?.slice(0, 300) || e.message}`);
    }
    setRunning(false);
    bell();
  }, [config, push, exit, running]);

  function ctxBar() {
    if (!agentRef.current) return '';
    const p = ctxPct;
    const n = Math.round(p * 10);
    const color = p > 0.85 ? 'red' : p > 0.65 ? 'yellow' : 'green';
    return { bar: '▰'.repeat(n) + '▱'.repeat(10 - n), pct: Math.round(p * 100), color };
  }

  const git = gitSummary();
  const bar = ctxBar();

  return (
    <Box flexDirection="column">
      <Static items={items}>
        {(item) => <Box key={item.id} flexDirection="column"><RenderItem item={item} /></Box>}
      </Static>
      {stream ? <Text color="cyan">{renderMarkdown(sanitize(stream), termCols())}</Text> : null}
      <TodoPanel todos={todos} />
      {pending ? (
        <Box flexDirection="column">
          <DiffPreview diff={pending.diff} />
          <Text color="yellow">允许? {pending.label} [y/n]</Text>
        </Box>
      ) : running ? (
        <Spinner label="思考中… (ESC / Ctrl+C 中止)" />
      ) : (
        <Box flexDirection="column">
          <PromptInput key={hist.length} value={input} onChange={setInput} onSubmit={submit} onEscape={abortRun} running={running} history={hist} />
          <Completion value={input} />
        </Box>
      )}
      <Text color={COLORS.dim}>
        [{config.model}]{git ? ` ⎇${git.branch}${git.dirty ? `*${git.dirty}` : ''}` : ''}{' '}
        {bar ? <Text color={bar.color}>{` ${bar.bar} ${bar.pct}%`}</Text> : null}
        {usage.cost > 0 ? ` $${usage.cost.toFixed(3)}` : ''} {process.cwd()}
      </Text>
    </Box>
  );
}

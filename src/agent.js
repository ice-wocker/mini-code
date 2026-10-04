import fs from 'fs';
import OpenAI from 'openai';
import { toolDefs, executeTool } from './tools.js';
import { loadMemories } from './config.js';
import { saveSession, newSessionId, saveMeta } from './session.js';
import { costUsd } from './cost.js';

const SYSTEM_BASE = `你是一个终端编程助手（mini-code），在用户的当前工作目录中工作。
规则：
- 修改文件前先 read_file 了解现状；编辑优先用 edit_file 而非整文件重写。
- 路径一律使用相对当前目录的相对路径。
- 探索代码优先用 glob / grep，避免盲目 list_dir 整树遍历。
- 3 步以上的任务先用 todo_write 列计划，每完成一步立刻更新状态。
- 回答简洁，用中文。代码改动说明改了什么即可，不要复述整个文件。
- 不确定时先调查再行动，不要臆测文件内容。`;

function buildSystem() {
  let sys = SYSTEM_BASE;
  const mem = loadMemories();
  if (mem.length) sys += '\n\n' + mem.join('\n\n');
  return sys;
}

function estimateTokens(messages) {
  return Math.ceil(JSON.stringify(messages).length / 3);
}

// 把用户输入里的 @path 引用展开为文件内容
function expandRefs(text) {
  return text.replace(/(?:^|\s)@([^\s@]+)/g, (m, p) => {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) return `${m}\n[目录 ${p}]: ${fs.readdirSync(p).slice(0, 100).join(', ')}`;
      if (stat.size > 200 * 1024) return `${m}\n[${p} 过大，未注入]`;
      return `${m}\n<file path="${p}">\n${fs.readFileSync(p, 'utf8').slice(0, 100000)}\n</file>`;
    } catch {
      return `${m}\n[@${p} 读取失败]`;
    }
  });
}

export function createAgent({ config, onEvent, confirm, initialMessages, sessionId }) {
  let client = null;
  let messages = initialMessages?.length
    ? [...initialMessages]
    : [{ role: 'system', content: buildSystem() }];
  let controller = null;
  let todos = [];
  let usage = { input: 0, output: 0, cost: 0 };
  const sessionKey = sessionId || newSessionId();

  async function ensureClient() {
    if (!client) client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
    return client;
  }

  async function summarizeOld(head) {
    const c = await ensureClient();
    const res = await c.chat.completions.create({
      model: config.model,
      max_tokens: 1000,
      messages: [
        ...head.filter((m) => m.role !== 'system'),
        { role: 'user', content: '请用中文简要总结以上对话：当前任务、已完成事项、关键文件与决定、下一步。只输出总结。' },
      ],
    });
    return res.choices[0]?.message?.content || '(总结失败)';
  }

  async function autoCompact() {
    onEvent({ type: 'compacting' });
    const boundary = Math.max(1, messages.length - 12);
    const head = messages.slice(0, boundary);
    const tail = messages.slice(boundary);
    const summary = await summarizeOld(head);
    messages = [
      messages[0],
      { role: 'user', content: `【此前对话总结】\n${summary}` },
      ...tail,
    ];
    onEvent({ type: 'info', text: `上下文已自动压缩（摘要 ${summary.length} 字）` });
  }

  async function streamOnce() {
    const c = await ensureClient();
    controller = new AbortController();
    const stream = await c.chat.completions.create({
      model: config.model,
      messages,
      tools: toolDefs(true),
      max_tokens: config.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      signal: controller.signal,
    });

    let text = '';
    const toolCalls = new Map();

    try {
      for await (const chunk of stream) {
        if (chunk.usage) {
          usage.input += chunk.usage.prompt_tokens || 0;
          usage.output += chunk.usage.completion_tokens || 0;
          usage.cost += costUsd(chunk.usage, config.model);
          onEvent({ type: 'usage', usage, contextPct: Math.min(1, (chunk.usage.prompt_tokens || 0) / config.contextLimit) });
        }
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          text += delta.content;
          onEvent({ type: 'text', text: delta.content });
        }
        for (const tc of delta.tool_calls || []) {
          const i = tc.index ?? 0;
          if (!toolCalls.has(i)) toolCalls.set(i, { id: '', name: '', args: '' });
          const acc = toolCalls.get(i);
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError' && e?.cause?.name !== 'AbortError') throw e;
    }

    if (text) onEvent({ type: 'text_done', text });
    const entry = { role: 'assistant', content: text || null };
    const called = [...toolCalls.values()].filter((t) => t.id && t.name);
    if (called.length) {
      entry.tool_calls = called.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } }));
    }
    messages.push(entry);
    return toolCalls;
  }

  function maybeCompact() {
    if (config.autoCompact && estimateTokens(messages) > config.contextLimit * 0.75) return autoCompact();
  }

  async function run(userInput) {
    try {
      messages.push({ role: 'user', content: expandRefs(userInput) });
      if (config.autoCompact && estimateTokens(messages) > config.contextLimit * 0.75) {
        await autoCompact();
      }
      while (true) {
        const toolCalls = await streamOnce();
        if (!toolCalls.size) break;
        for (const call of toolCalls.values()) {
          if (!call.id || !call.name) continue;
          let args = {};
          try { args = JSON.parse(call.args || '{}'); } catch {}
          onEvent({ type: 'tool_start', name: call.name, args });
          if (config.confirmWrites && ['write_file', 'edit_file', 'run_command'].includes(call.name)) {
            const ok = await confirm(call.name, args);
            if (!ok) {
              messages.push({ role: 'tool', tool_call_id: call.id, content: '用户拒绝了此操作' });
              onEvent({ type: 'tool_end', name: call.name, output: '(用户拒绝)' });
              continue;
            }
          }
          let output;
          try {
            output = await executeTool(call.name, args, { setTodos: (t) => { todos = t; onEvent({ type: 'todos', todos }); } });
          } catch (e) {
            output = `错误: ${e.message}`;
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: String(output) });
          onEvent({ type: 'tool_end', name: call.name, output: String(output) });
        }
        await maybeCompact();
      }
    } catch (e) {
      if (e.name !== 'AbortError' && e?.cause?.name !== 'AbortError') {
        onEvent({ type: 'error', text: e.message });
      }
    } finally {
      saveSession(messages, { id: sessionKey, model: config.model });
      saveMeta(sessionKey, { model: config.model, cost: usage.cost, input: usage.input, output: usage.output });
    }
  }

  return {
    run,
    abort: () => { controller?.abort(); },
    clear: () => { messages = [{ role: 'system', content: buildSystem() }]; todos = []; onEvent({ type: 'todos', todos }); },
    // 撤销上一轮：删掉最后一条用户消息及其后的所有消息
    undo: () => {
      for (let i = messages.length - 1; i >= 1; i--) {
        if (messages[i].role === 'user') {
          const removed = messages.length - i;
          messages = messages.slice(0, i);
          saveSession(messages, { id: sessionKey, model: config.model });
          return removed;
        }
      }
      return 0;
    },
    usage: () => usage,
    contextPct: () => Math.min(1, estimateTokens(messages) / config.contextLimit),
    compact: async () => {
      if (messages.length <= 14) return false;
      const boundary = Math.max(1, messages.length - 12);
      if (messages[boundary]?.role === 'tool') return false;
      const summary = await summarizeOld(messages.slice(0, boundary));
      messages = [messages[0], { role: 'user', content: `【此前对话总结】\n${summary}` }, ...messages.slice(boundary)];
      return true;
    },
    tokens: () => estimateTokens(messages),
    getTodos: () => todos,
    history: () => messages,
  };
}

import fs from 'fs/promises';
import path from 'path';
import { exec, execFile } from 'child_process';
import { glob } from 'glob';
import { resolveSafe, isDenied } from './sandbox.js';
import { summarizeDiff, applyEdits } from './diff.js';

function cap(s, n = 12000) {
  return s.length > n ? s.slice(0, n) + `\n...[输出截断，共 ${s.length} 字符]` : s;
}

const IGNORE = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'target', '.next', '__pycache__', '.venv', 'venv']);

const tools = {
  async read_file({ path: p, offset = 0, limit }) {
    const { abs } = resolveSafe(p);
    const stat = await fs.stat(abs);
    if (stat.size > 5 * 1024 * 1024) throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，请用 grep 分段读取`);
    const all = (await fs.readFile(abs, 'utf8')).split('\n');
    const slice = all.slice(offset, limit ? offset + limit : undefined);
    const numbered = slice.map((l, i) => `${offset + i + 1}\t${l}`).join('\n');
    return cap(numbered);
  },

  async write_file({ path: p, content }) {
    const { abs, rel } = resolveSafe(p);
    let before = null;
    try { before = await fs.readFile(abs, 'utf8'); } catch {}
    await fs.mkdir(path.dirname(abs), { recursive: true }).catch(() => {});
    await fs.writeFile(abs, content, 'utf8');
    return `已写入 ${rel}（${content.length} 字节）\n${summarizeDiff(rel, before, content)}`;
  },

  async edit_file({ path: p, edits }) {
    const list = edits || [];
    if (!list.length) throw new Error('edits 不能为空');
    const { abs, rel } = resolveSafe(p);
    const before = await fs.readFile(abs, 'utf8');
    const after = applyEdits(before, list);
    await fs.writeFile(abs, after, 'utf8');
    return `已编辑 ${rel}\n${summarizeDiff(rel, before, after)}`;
  },

  async glob({ pattern, path: p = '.' }) {
    const { abs, rel } = resolveSafe(p);
    const matches = await glob(pattern, {
      cwd: abs,
      ignore: [...IGNORE],
      dot: true,
      nodir: true,
      absolute: false,
    });
    if (!matches.length) return `(无匹配: ${pattern})`;
    const shown = matches.slice(0, 500);
    return shown.map((m) => path.join(rel === '.' ? '' : rel, m)).join('\n') +
      (matches.length > shown.length ? `\n...共 ${matches.length} 个文件` : '');
  },

  async grep({ pattern, path: p = '.', glob: g }) {
    if (!pattern || pattern.length > 500) throw new Error('pattern 非法');
    const { abs, rel } = resolveSafe(p);
    const files = g ? await glob(g, { cwd: abs, ignore: [...IGNORE], nodir: true }) : null;
    const args = ['-rIn', '--color=never'];
    for (const d of IGNORE) args.push(`--exclude-dir=${d}`);
    args.push('-e', pattern);
    if (files) {
      args.push('--include=' + path.basename(g));
    }
    args.push('.');
    const out = await new Promise((resolve) => {
      execFile('grep', args,
        { cwd: abs, timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (e, so) => {
          // grep 无匹配时 exit 1，这是正常情况，直接返回 stdout
          resolve(so || '');
        });
    }).catch(() => null);
    if (out === null) return '(grep 执行失败，请检查正则)';
    const lines = out.trim().split('\n').filter(Boolean).map((l) => l.replace(/^\.\//, ''));
    if (!lines.length) return `(无匹配: ${pattern})`;
    return lines.slice(0, 300).join('\n') + (lines.length > 300 ? `\n...共 ${lines.length} 行` : '');
  },

  async list_dir({ path: p = '.' }) {
    const { abs, rel } = resolveSafe(p);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    return entries
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
      .join('\n') || `(${rel} 为空)`;
  },

  async run_command({ command, timeout_ms = 60000 }) {
    if (isDenied(command)) throw new Error(`命令涉及敏感路径，已拒绝: ${command}`);
    const { stdout, stderr } = await new Promise((resolve, reject) => {
      exec(command, { cwd: process.cwd(), timeout: timeout_ms, maxBuffer: 10 * 1024 * 1024 }, (err, so, se) => {
        if (err && err.killed) reject(new Error('命令超时被终止'));
        else resolve({ stdout: so, stderr: se });
      });
    });
    const out = [stdout, stderr].filter(Boolean).join('\n---stderr---\n') || '(无输出)';
    return cap(out);
  },
};

const TOOL_DEFS_BASE = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容（行号从 1 开始，相对当前工作目录）',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          offset: { type: 'number', description: '起始行（从 0 计），默认 0' },
          limit: { type: 'number', description: '读取行数' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '创建或覆盖写入整个文件',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '完整文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: '对文件做一处或多处精确文本替换',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          edits: {
            type: 'array',
            description: '替换列表，按顺序应用',
            items: {
              type: 'object',
              properties: {
                old_text: { type: 'string', description: '要被替换的原文（必须在当前文件中唯一）' },
                new_text: { type: 'string' },
              },
              required: ['old_text', 'new_text'],
            },
          },
        },
        required: ['path', 'edits'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: '列出目录内容',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '目录路径，默认当前目录' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: '按通配符查找文件，如 **/*.js',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'glob 模式' },
          path: { type: 'string', description: '搜索根目录，默认 .' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: '在文件中搜索正则表达式，返回 文件:行号:内容',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '正则表达式（ERE 语法）' },
          path: { type: 'string', description: '搜索目录，默认 .' },
          glob: { type: 'string', description: '限定文件名，如 *.js' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: '在当前工作目录执行 shell 命令并返回输出',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          timeout_ms: { type: 'number', description: '超时毫秒，默认 60000' },
        },
        required: ['command'],
      },
    },
  },
];

export function toolDefs(withTodo) {
  const defs = [...TOOL_DEFS_BASE];
  if (withTodo) defs.push(TODO_DEF);
  return defs;
}

const TODO_DEF = {
  type: 'function',
  function: {
    name: 'todo_write',
    description: '维护当前任务的待办清单（整体替换）。开始多步任务前先写清单，每完成一步立刻更新状态。',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: '任务描述' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
  },
};

// 工具结果 → 界面单行摘要
export function summarizeToolResult(name, output) {
  const first = (s) => s.split('\n').find((l) => l.trim()) || '';
  switch (name) {
    case 'glob': return first(output).startsWith('(无匹配') ? '无匹配' : `${output.split('\n').filter(Boolean).length} 个文件`;
    case 'grep': {
      const m = output.match(/共 (\d+) 行/);
      const n = output.split('\n').filter(Boolean).length;
      return output.startsWith('(无匹配') ? '无匹配' : `${m ? m[1] : n} 行匹配`;
    }
    case 'read_file': return `${output.split('\n').filter(Boolean).length} 行`;
    case 'list_dir': return `${output.split('\n').filter(Boolean).length} 项`;
    case 'write_file': return first(output);
    case 'edit_file': return first(output);
    default: return null;
  }
}

export async function executeTool(name, args, ctx = {}) {
  if (name === 'todo_write') {
    for (const t of args.todos || []) {
      if (!['pending', 'in_progress', 'done'].includes(t.status)) {
        throw new Error(`非法状态: ${t.status}`);
      }
    }
    if ((args.todos || []).filter((t) => t.status === 'in_progress').length > 1) {
      throw new Error('同时只能有一个 in_progress 任务');
    }
    ctx.setTodos?.(args.todos || []);
    return `待办已更新（${(args.todos || []).length} 项）`;
  }
  const fn = tools[name];
  if (!fn) throw new Error(`未知工具: ${name}`);
  if (['write_file', 'edit_file', 'run_command'].includes(name)) {
    const target = args.path || args.command || '';
    if (isDenied(target)) throw new Error(`涉及敏感路径，已拒绝: ${target}`);
  }
  return fn(args);
}

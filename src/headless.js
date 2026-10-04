import { loadConfig } from './config.js';
import { createAgent } from './agent.js';
import { termCols } from './term.js';
import { renderMarkdown } from './markdown.js';
import { sanitize } from './paste.js';

// mini-code -p "提示" ：非交互模式。stdin 非 TTY 时作为追加上下文读入。
export async function runHeadless(restArgs) {
  const quiet = restArgs.includes('--quiet') || restArgs.includes('-q');
  const filtered = restArgs.filter((a) => a !== '-q' && a !== '--quiet');
  const isTTY = process.stdin.isTTY;
  let prompt = filtered.join(' ').trim();
  let extra = '';
  if (!isTTY) {
    extra = await new Promise((res) => {
      let d = '';
      process.stdin.setEncoding('utf8');
      process.stdin.resume(); // 管道输入必须先 resume 才会流动
      process.stdin.on('data', (c) => { d += c; });
      process.stdin.on('end', () => res(d));
    }).catch(() => '');
    if (!prompt) {
      process.stderr.write('用法: mini-code -p "提示"（或管道输入）\n');
      process.exit(2);
    }
  }
  if (!prompt) {
    process.stderr.write('用法: mini-code -p "提示"\n');
    process.exit(2);
  }
  const config = loadConfig();
  if (!config.apiKey) {
    process.stderr.write('错误: 未设置 API Key（OPENAI_API_KEY 或 ~/.mini-code/config.json）\n');
    process.exit(1);
  }
  let text = '';
  const conf = { ...config, confirmWrites: false };
  const agent = createAgent({
    config: conf,
    onEvent: (e) => {
      if (e.type === 'text_done') process.stderr.write(`· ${e.text.split('\n')[0].slice(0, 80)}\n`);
      else if (e.type === 'tool_start') process.stderr.write(`· ${e.name} ${String(JSON.stringify(e.args)).slice(0, 60)}\n`);
      else if (e.type === 'error') process.stderr.write(`错误: ${e.text}\n`);
    },
    confirm: () => Promise.resolve(true),
  });
  const full = extra ? `${prompt}\n\n<input>\n${sanitize(extra).slice(0, 100000)}\n</input>` : prompt;
  await agent.run(full);
  for (const m of agent.history()) {
    if (m.role === 'assistant' && m.content) text = m.content;
  }
  process.stdout.write(quiet ? text + '\n' : renderMarkdown(sanitize(text), termCols()) + '\n');
  process.exit(0);
}

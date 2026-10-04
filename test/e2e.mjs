import { spawn } from 'child_process';
import fs from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
try { fs.unlinkSync(ROOT + '.round'); } catch {}
const fa = spawn(process.execPath, [new URL('./fakeapi.mjs', import.meta.url).pathname], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));

const S = 'mcx';
process.env.MINI_DEBUG = process.env.MINI_DEBUG || '';
const tmux = (...a) => new Promise((res, rej) => {
  const p = spawn('tmux', a, { stdio: ['ignore', 'pipe', 'pipe'] });
  let o = ''; p.stdout.on('data', (c) => { o += c; }); p.stderr.on('data', (c) => { o += c; });
  p.on('close', (code) => (code ? rej(new Error(o || code)) : res(o)));
});
const cap = async () => tmux('capture-pane', '-t', S, '-p', '-e');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name, cond) => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);

try { await tmux('kill-session', '-t', S); } catch {}
await tmux('new-session', '-d', '-x', '120', '-y', '30', '-s', S, 'bash');
await wait(500);
// 直接跑 mini-code，环境从 rc 文件来
await tmux('send-keys', '-t', S, `exec env MINI_CODE_MODEL=gpt-4o-mini OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:8799/v1 node ${ROOT}src/index.js`, 'Enter');
await wait(2500);

let f = await cap();
console.log('--- BOOT FRAME ---\n' + f.split('\n').slice(0,8).join('\n') + '\n---');
await ok('PTY: 启动状态栏', f.includes('▱▱▱▱▱▱▱▱▱▱') || f.includes('▰') && f.includes('mini-code') || f.includes('mini-code'));

await tmux('send-keys', '-l', '-t', S, '/co');
await wait(700);
f = await cap();
console.log('--- CO FRAME ---\n' + f.split('\n').slice(-8).join('\n') + '\n---');
await ok('PTY: /co 补全提示', f.includes('/compact') && f.includes('/cost'));

await tmux('send-keys', '-t', S, 'C-u');
await wait(300);
await tmux('send-keys', '-l', '-t', S, '/cost');
await tmux('send-keys', '-t', S, 'Enter');
await wait(1200);
f = await cap();
await ok('PTY: /cost 输出', f.includes('本会话'));

await tmux('send-keys', '-l', '-t', S, '/badcmd');
await tmux('send-keys', '-t', S, 'Enter');
await wait(800);
f = await cap();
await ok('PTY: 未知命令', f.includes('未知命令'));

// 跑工具调用 → 确认框
await tmux('send-keys', '-l', '-t', S, '跑个命令');
await tmux('send-keys', '-t', S, 'Enter');
let seen = false;
for (let i = 0; i < 40; i++) { await wait(150); if ((await cap()).includes('[y/n]')) { seen = true; break; } }
await ok('PTY: 确认提示 [y/n]', seen);
await tmux('send-keys', '-l', '-t', S, 'n');
await wait(800);
f = await cap();
await ok('PTY: 拒绝执行', f.includes('用户拒绝'));

await tmux('kill-session', '-t', S);
console.log('DONE');
fa.kill();
process.exit(0);

#!/usr/bin/env node
import { register } from 'node:module';

register(new URL('./jsx-loader.mjs', import.meta.url));

const argv = process.argv.slice(2);
if (argv.includes('-p') || argv.includes('--print')) {
  const { runHeadless } = await import('./headless.js');
  await runHeadless(argv.filter((a) => a !== '-p' && a !== '--print'));
}

const React = (await import('react')).default;
const { render } = await import('ink');
const { App } = await import('./ui.js');

const resumeIdx = argv.indexOf('--resume');
const autoMode = argv.includes('--auto') || argv.includes('-y');

// 粘贴净化（防终端注入）在 PromptInput 的 useInput 入口做（见 components.js sanitize）。
// stdin 层面的 read 包装不可靠：真实 ReadStream 下 unshift+read 会崩。

// Ink 假定 TTY 会自行补结尾换行，部分终端（Termux/tmux）不认，手动补
// 只对不含 CSI 光标移动的 Static 类输出补换行
const origWrite = process.stdout.write.bind(process.stdout);
let prevEndedNL = true;
const CSI_MOVES = /\x1b\[\??[0-9;]*[A-Za-z]/;
process.stdout.write = (chunk, ...rest) => {
  const s = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
  let out = s;
  if (!prevEndedNL && s && !s.startsWith('\n') && !CSI_MOVES.test(s)) out = '\n' + s;
  prevEndedNL = out.endsWith('\n');
  return origWrite(out, ...rest);
};

process.on('uncaughtException', (e) => {
  origWrite(`\n[uncaught] ${e.stack?.slice(0, 500) || e}\n`);
});

const { waitUntilExit } = render(React.createElement(App, {
  resumeId: resumeIdx >= 0 ? (argv[resumeIdx + 1] || null) : null,
  autoMode,
}), { exitOnCtrlC: false, clearConsole: false });
await waitUntilExit();
process.stdout.write = origWrite;
process.stdout.write('\n');

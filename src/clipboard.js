import { execSync } from 'child_process';

const CMDS = [
  ['pbcopy', null],
  ['wl-copy', null],
  ['termux-clipboard-set', null],
  ['xclip', '-selection clipboard'],
  ['xsel', '--clipboard --input'],
];

export function copyToClipboard(text) {
  for (const [cmd, arg] of CMDS) {
    try {
      execSync(`${cmd}${arg ? ' ' + arg : ''}`, { input: text, stdio: ['pipe', 'ignore', 'ignore'], timeout: 3000 });
      return cmd;
    } catch {}
  }
  return null;
}

// OSC 52：让终端模拟器把内容放进系统剪贴板（tmux/ssh 也常支持）
export function osc52(text) {
  const seq = `]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
  process.stdout.write(`\x1b${seq}`);
}

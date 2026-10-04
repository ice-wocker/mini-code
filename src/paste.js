// 粘贴/输入净化：剥掉所有 ANSI/OSC/DCS 转义序列，防止终端注入（如伪造 OSC 52 写剪贴板）
const SEQS = [
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, // OSC
  /\x1b[P^_][^\x1b]*\x1b\\/g,           // DCS/PM/APC
  /\x1b\[[0-9;?]*[ -/]*[@-~]/g,          // CSI
  /\x1b[@-Z\\-_]/g,                      // 2 字符 ESC 序列
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,   // 控制字符（保留 \t \n）
];

export function sanitize(s) {
  let out = String(s);
  for (const re of SEQS) out = out.replace(re, '');
  return out;
}

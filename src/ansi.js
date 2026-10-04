const CODE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s) {
  return s.replace(CODE, '');
}

export function indentAnsi(s, pad) {
  return s.split('\n').map((l) => pad + l).join('\n');
}

const WIDE = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x20000, 0x3fffd],
];

function charWidth(code) {
  if (code === 0x0adf || (code >= 0x0300 && code <= 0x036f)) return 0;
  for (const [lo, hi] of WIDE) {
    if (code >= lo && code <= hi) return 2;
  }
  return 1;
}

export function displayWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch.codePointAt(0));
  return w;
}

export function wrapAnsi(text, width) {
  if (width < 10) return text;
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    let w = 0;
    for (const tok of para.split(/(\x1b\[[0-9;]*m)/)) {
      if (!tok) continue;
      if (tok.startsWith('\x1b[')) { line += tok; continue; }
      for (const ch of tok) {
        const cw = charWidth(ch.codePointAt(0));
        if (w + cw > width) { out.push(line); line = ''; w = 0; }
        line += ch; w += cw;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

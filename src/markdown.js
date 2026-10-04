import { Marked } from 'marked';
import { wrapAnsi } from './ansi.js';

const C = {
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[90m${s}\x1b[39m`,
  italic: (s) => `\x1b[3m${s}\x1b[23m`,
  underline: (s) => `\x1b[4m${s}\x1b[24m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  gray: (s) => `\x1b[90m${s}\x1b[39m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
};

export function renderMarkdown(src, width = 80) {
  const marked = new Marked({ gfm: true, breaks: false });
  let items = [];

  marked.use({
    renderer: {
      code: (code, lang) => {
        const lines = String(code).replace(/\n$/, '').split('\n');
        const top = lang ? ` ${lang} ` : '';
        const bar = `╭─${top}${'─'.repeat(Math.max(4, 38 - top.length))}─╮`;
        return `\n${C.gray(bar)}\n${lines.map((l) => `  ${l}`).join('\n')}\n${C.gray(`╰${'─'.repeat(bar.length - 2)}╯`)}\n`;
      },
      codespan: (t) => C.cyan(t),
      strong: (t) => C.bold(t),
      em: (t) => C.italic(t),
      del: (t) => `~${t}~`,
      link: (href, _title, text) => `${C.underline(String(text))}${C.dim(`(${href})`)}`,
      image: (_h, _t, text) => C.dim(`[图片: ${text}]`),
      blockquote: (quote) =>
        '\n' + String(quote).replace(/\n$/, '').split('\n').map((l) => `${C.gray('│')} ${l}`).join('\n') + '\n',
      heading: (text, level) => {
        const plain = String(text).replace(/\x1b\[[0-9;]*m/g, '');
        const inner = level <= 2 ? C.bold(String(text)) : String(text);
        return `\n${inner}\n${level <= 2 ? C.gray('─'.repeat(Math.min(plain.length + 2, 60))) : ''}\n`;
      },
      hr: () => `\n${C.gray('─'.repeat(60))}\n`,
      list: (_body, ordered, start) => {
        const out = '\n' + items.map((it, i) => {
          const bullet = (it.task ? null : ordered) ? `${(start || 1) + i}.` : '•';
          return `${C.cyan(bullet)} ${it.text}`;
        }).join('\n') + '\n';
        items = [];
        return out;
      },
      listitem: (text, task, checked) => {
        const t = String(text).replace(/\n+$/, '').replace(/<input[^>]*>/g, '');
        items.push({ task, text: task ? `${checked ? C.green('[✓]') : '[ ]'} ${t}` : t });
        return t;
      },
      paragraph: (text) => String(text) + '\n',
      br: () => '\n',
      table: () => '',
      tablerow: (c) => c,
      tablecell: (c) => c,
      html: (html) => String(html).replace(/<[^>]*>/g, ''),
      text: (t) => t,
    },
  });

  try {
    const out = marked.parse(src);
    items = [];
    const cleaned = out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');
    return wrapAnsi(cleaned, width);
  } catch {
    return src;
  }
}

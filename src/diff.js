export function applyEdits(src, edits) {
  let text = src;
  edits.forEach((e, i) => {
    const { old_text, new_text } = e;
    if (!old_text) throw new Error(`第 ${i + 1} 处编辑的 old_text 为空`);
    const count = text.split(old_text).length - 1;
    if (count === 0) throw new Error(`第 ${i + 1} 处编辑未找到匹配文本`);
    if (count > 1) throw new Error(`第 ${i + 1} 处编辑匹配到 ${count} 处，请提供更长的 old_text 使其唯一`);
    text = text.replace(old_text, () => new_text);
  });
  return text;
}

// 简易行级 diff：公共前后缀 + 中间替换，输出 +/- 摘要
export function summarizeDiff(file, before, after) {
  const header = `--- a/${file}`;
  if (before === null || before === undefined) {
    const lines = after.split('\n').length;
    return `${header}\n+++ b/${file}\n（新建文件，${lines} 行）`;
  }
  if (before === after) return `${header}\n（无变化）`;

  const a = before.split('\n');
  const b = after.split('\n');
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const removed = a.slice(head, a.length - tail);
  const added = b.slice(head, b.length - tail);
  const MAX = 40;
  const clip = (arr, fn) => {
    if (arr.length <= MAX) return arr.map(fn);
    const shown = arr.slice(0, MAX).map(fn);
    shown.push(`  ...还有 ${arr.length - MAX} 行`);
    return shown;
  };
  const body = [
    ...clip(removed, (l) => `\x1b[31m- ${l.slice(0, 200)}\x1b[39m`),
    ...clip(added, (l) => `\x1b[32m+ ${l.slice(0, 200)}\x1b[39m`),
  ].join('\n');
  return `${header}\n+++ b/${file}\n@ ${head + 1} @@  -${removed.length} +${added.length}\n${body}`;
}

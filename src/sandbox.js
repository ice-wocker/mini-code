import path from 'path';

const ROOT = process.cwd();

export function resolveSafe(p) {
  const abs = path.resolve(ROOT, p || '.');
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径越界: ${p}（只允许操作 ${ROOT} 内的文件）`);
  }
  return { abs, rel: rel || '.' };
}

export function isDenied(p) {
  let rel;
  try {
    ({ rel } = resolveSafe(p));
  } catch {
    return true;
  }
  const lower = rel.toLowerCase();
  const segs = lower.split('/');
  if (segs.includes('.ssh')) return true;
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  if (segs.includes('.env')) return true;
  if (lower === '.git/config' || lower.startsWith('.git/config/')) return true;
  if (segs.some((s) => s === 'credentials' || s === 'secrets' || s.endsWith('.pem') || s.endsWith('.key'))) return true;
  return false;
}

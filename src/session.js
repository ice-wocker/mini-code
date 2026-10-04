import fs from 'fs';
import path from 'path';
import { SESSIONS_DIR } from './config.js';

function ensureDir() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function newSessionId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + Math.random().toString(36).slice(2, 6);
}

function safeId(id) {
  const s = String(id || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,128}$/.test(s) || s.includes('..')) {
    throw new Error(`非法会话 id: ${s}`);
  }
  return s;
}

export function saveSession(messages, meta = {}) {
  ensureDir();
  const id = meta.id ? safeId(meta.id) : newSessionId();
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  const firstUser = (messages || []).find((m) => m.role === 'user');
  const preview = typeof firstUser?.content === 'string'
    ? firstUser.content.slice(0, 60)
    : '(工具会话)';
  fs.writeFileSync(file, JSON.stringify({ id, meta: { ...meta, preview, savedAt: new Date().toISOString() }, messages }, null, 2));
  return { id, file };
}

export function saveMeta(id, meta) {
  ensureDir();
  const sid = safeId(id);
  try { fs.writeFileSync(path.join(SESSIONS_DIR, `${sid}.meta.json`), JSON.stringify(meta)); } catch {}
}

export function listSessions(limit = 20) {
  ensureDir();
  return fs.readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.meta.json'))
    .map((f) => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
        return { id: d.id, preview: d.meta?.preview || '', savedAt: d.meta?.savedAt, count: d.messages?.length || 0 };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
    .slice(0, limit);
}

export function loadSession(id) {
  const sid = safeId(id);
  const file = path.join(SESSIONS_DIR, `${sid}.json`);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  return d.messages;
}

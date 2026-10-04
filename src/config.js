import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.mini-code');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

// 记忆文件：全局 + 项目
export const GLOBAL_MEMORY = path.join(CONFIG_DIR, 'MEMORY.md');
export const PROJECT_MEMORY = path.join(process.cwd(), 'AGENTS.md');
export const LOCAL_MEMORY = path.join(process.cwd(), 'AGENTS.local.md');

export function loadConfig() {
  let fileConf = {};
  try {
    fileConf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  return {
    baseUrl: process.env.OPENAI_BASE_URL || fileConf.baseUrl || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || fileConf.apiKey || '',
    model: process.env.MINI_CODE_MODEL || process.env.OPENAI_MODEL || fileConf.model || 'gpt-4o-mini',
    maxTokens: fileConf.maxTokens || 4096,
    contextLimit: fileConf.contextLimit || 128000,
    autoCompact: fileConf.autoCompact !== false,
    confirmWrites: process.env.MINI_CODE_AUTO !== '1' && fileConf.confirmWrites !== false,
  };
}

export function saveConfig(patch) {
  // 只持久化文件里的配置 + 本次 patch，不把环境变量解析后的 apiKey 回写入磁盘
  let fileConf = {};
  try {
    fileConf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  const conf = { ...fileConf, ...patch };
  // 防误删：不在 patch 里显式给 apiKey 时，不写入 apiKey
  if (!Object.hasOwn(patch, 'apiKey') && !fileConf.apiKey) delete conf.apiKey;
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(conf, null, 2));
  return loadConfig();
}

export function loadMemories() {
  const parts = [];
  for (const [label, file] of [['全局记忆', GLOBAL_MEMORY], ['项目记忆', PROJECT_MEMORY], ['本地记忆', LOCAL_MEMORY]]) {
    try {
      const text = fs.readFileSync(file, 'utf8').trim();
      if (text) parts.push(`【${label} · ${file}】\n${text.slice(0, 4000)}`);
    } catch {}
  }
  return parts;
}

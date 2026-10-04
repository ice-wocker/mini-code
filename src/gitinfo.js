import { execSync } from 'child_process';

let checked = false;
let isRepo = false;

export function gitBranch() {
  if (!checked) {
    checked = true;
    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd: process.cwd(), stdio: 'ignore', timeout: 2000 });
      isRepo = true;
    } catch { isRepo = false; }
  }
  if (!isRepo) return null;
  try {
    return execSync('git branch --show-current', { cwd: process.cwd(), encoding: 'utf8', timeout: 2000 }).trim() || '(detached)';
  } catch { return null; }
}

export function gitSummary() {
  const branch = gitBranch();
  if (!branch) return null;
  let dirty = 0;
  try {
    dirty = execSync('git status --porcelain', { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 })
      .split('\n').filter(Boolean).length;
  } catch {}
  return { branch, dirty };
}

// 每百万 token 美元价（USD / 1M tokens）；按子串匹配，越靠前优先级越高
const PRICES = [
  ['gpt-4o', { in: 2.5, out: 10 }],
  ['gpt-4.1', { in: 2, out: 8 }],
  ['o3', { in: 2, out: 8 }],
  ['o4-mini', { in: 1.1, out: 4.4 }],
  ['gpt-4.5', { in: 75, out: 150 }],
  ['claude-opus', { in: 15, out: 75 }],
  ['claude-sonnet', { in: 3, out: 15 }],
  ['claude-haiku', { in: 0.8, out: 4 }],
  ['deepseek', { in: 0.27, out: 1.1 }],
  ['qwen', { in: 0.5, out: 2 }],
  ['gemini', { in: 0.15, out: 0.6 }],
  ['llama', { in: 0.05, out: 0.1 }],
];

export function priceOf(model) {
  const m = (model || '').toLowerCase();
  for (const [key, p] of PRICES) if (m.includes(key)) return p;
  return null;
}

export function costUsd(usage, model) {
  if (!usage?.prompt_tokens || !priceOf(model)) return 0;
  const p = priceOf(model);
  return (usage.prompt_tokens / 1e6) * p.in + ((usage.completion_tokens || 0) / 1e6) * p.out;
}

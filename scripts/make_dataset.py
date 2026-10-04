#!/usr/bin/env python3
"""蒸馏数据集校验/去重/切分：data/raw/*.jsonl -> data/train.jsonl + data/eval_split.jsonl
规范:
- 每行 {"id","instruction","input","output","category"} (+可选 lang)
- id 全局唯一；output <=2000 字符且非空；instruction 非空；category 非空
- 按 (instruction+input) 归一化去重，保留首次出现
- shuffle(seed=42) 后按 eval_ratio 切分，默认 0.05
用法:
  python3 scripts/make_dataset.py [--raw data/raw --train data/train.jsonl --eval data/eval_split.jsonl]
"""
import argparse, json, random, hashlib
from pathlib import Path

def norm(s: str) -> str:
    return " ".join((s or "").strip().lower().split())

def load_raw(raw_dir: Path):
    rows, errors = [], []
    files = sorted(raw_dir.glob("*.jsonl"))
    if not files:
        errors.append(f"raw目录无jsonl: {raw_dir}")
    for fp in files:
        for ln, line in enumerate(fp.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                o = json.loads(line)
            except Exception as e:
                errors.append(f"{fp.name}:{ln} JSON解析失败 {e}")
                continue
            o["_src"] = f"{fp.name}:{ln}"
            rows.append(o)
    return rows, errors

def validate(rows):
    errors, seen_id, out = [], set(), []
    for r in rows:
        src = r.pop("_src", "?")
        rid, ins, inp, otp, cat = r.get("id"), r.get("instruction"), r.get("input", ""), r.get("output"), r.get("category")
        if not rid or not isinstance(rid, str):
            errors.append(f"{src} 缺id"); continue
        if rid in seen_id:
            errors.append(f"{src} id重复: {rid}"); continue
        seen_id.add(rid)
        if not ins or not str(ins).strip():
            errors.append(f"{src} {rid} instruction为空"); continue
        if otp is None or not str(otp).strip():
            errors.append(f"{src} {rid} output为空"); continue
        if len(str(otp)) > 2000:
            errors.append(f"{src} {rid} output超长 {len(str(otp))}>2000"); continue
        if not cat or not str(cat).strip():
            errors.append(f"{src} {rid} category为空"); continue
        r["input"] = str(inp or "")
        r["instruction"] = str(ins).strip()
        r["output"] = str(otp).strip()
        r["category"] = str(cat).strip()
        if "lang" not in r:
            r["lang"] = "en" if r["category"].startswith("code-en") else "zh"
        out.append(r)
    return out, errors

def dedup(rows):
    seen, uniq, dups = {}, [], 0
    for r in rows:
        h = hashlib.sha256(f"{norm(r['instruction'])}\n{norm(r['input'])}".encode()).hexdigest()[:16]
        if h in seen:
            dups += 1
            continue
        seen[h] = r["id"]
        uniq.append(r)
    return uniq, dups

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--train", default="data/train.jsonl")
    ap.add_argument("--eval", default="data/eval_split.jsonl")
    ap.add_argument("--eval-ratio", type=float, default=0.05)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    raw_dir = Path(a.raw)
    rows, errs = load_raw(raw_dir)
    print(f"raw: {len(rows)} 条来自 {raw_dir}")
    rows, errs2 = validate(rows)
    errs += errs2
    rows, dups = dedup(rows)
    print(f"去重后: {len(rows)} 条 (去重 {dups})")
    # 统计
    from collections import Counter
    c = Counter(r["category"] for r in rows)
    for k, v in sorted(c.items()):
        print(f"  {k}: {v}")
    # 切分
    rnd = random.Random(a.seed)
    idx = list(range(len(rows)))
    rnd.shuffle(idx)
    n_eval = max(1, int(len(rows) * a.eval_ratio))
    eval_idx = set(idx[:n_eval])
    train = [r for i, r in enumerate(rows) if i not in eval_idx]
    ev = [r for i, r in enumerate(rows) if i in eval_idx]
    Path(a.train).parent.mkdir(parents=True, exist_ok=True)
    Path(a.eval).parent.mkdir(parents=True, exist_ok=True)
    Path(a.train).write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in train) + "\n", encoding="utf-8")
    Path(a.eval).write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in ev) + "\n", encoding="utf-8")
    print(f"train: {len(train)} -> {a.train}")
    print(f"eval: {len(ev)} -> {a.eval}")
    if errs:
        print(f"ERRORS({len(errs)}):")
        for e in errs[:50]:
            print("  !", e)
        raise SystemExit(1)
    print("OK")

if __name__ == "__main__":
    main()

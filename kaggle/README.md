# Kaggle T4 训练（spark-distill-1b, 700条）

本地 Termux **不训练**，只做数据+管线。训练走 Kaggle T4 / Colab。

## 1. 传数据
Kaggle Notebook 新建 → Add Input → Upload `data/train.jsonl` + `data/eval_split.jsonl`
（或整个仓库 zip，经 ghproxy 加速 clone，见 §4）。

也可在 Notebook 里直接 clone 后跑 `python3 scripts/make_dataset.py` 重切分验证。

## 2. 首选 Unsloth QLoRA r16
```bash
pip -q install "unsloth[kaggle-new] @ git+https://github.com/unslothai/unsloth.git" trl datasets accelerate
python3 kaggle/train_unsloth.py
# 输出 /kaggle/working/spark-distill-1b-lora
```
超参：r16/alpha16/dropout0, target=q/k/v/o/gate/up/down, 4bit, seq2048,
batch2xaccum4, lr2e-4, epoch3, T4 约 665条可跑完。

## 3. 兜底（unsloth 装不上时）
```bash
pip -q install transformers peft bitsandbytes trl datasets accelerate
python3 kaggle/train_fallback.py
```

## 4. 推送（Termux 走 ghproxy + token 直连）
`/tmp` 不可写，临时文件用 `/data/data/com.termux/files/usr/tmp/opencode/`：
```bash
export TMPDIR=/data/data/com.termux/files/usr/tmp/opencode
export HTTPS_PROXY="" HTTP_PROXY=""
git remote set-url origin "https://<TOKEN>@ghproxy.net/https://github.com/ice-wocker/mini-code.git"
git push origin main
```
**Token/Key 绝不进仓库**（已在 .gitignore 外另做检查）。

## 5. 安全（重要）
- 本次代办训练用 Kaggle 凭证（用户私聊提供，用后立即 revoke）：
  Kaggle → Settings → API → Revoke / 重新生成。
- 不要把 Kaggle.json / token / API Key 提交到 git；已传的用 `git filter-repo` 或换 key。
- 基座 `openbmb/MiniCPM5-1B-Base` Apache-2.0，可商用；蒸馏数据为本仓库行为总结，无第三方版权文本。

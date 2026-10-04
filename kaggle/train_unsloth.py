"""Unsloth QLoRA SFT for spark-distill-1b (Kaggle T4首选).
基座: openbmb/MiniCPM5-1B-Base (标准Llama架构, Apache-2.0)
数据: data/train.jsonl + data/eval_split.jsonl (Alpaca: instruction/input/output)
方法: 黑盒数据蒸馏 + QLoRA r16
Kaggle用法见 kaggle/README.md. 本地Termux不跑训练.
"""
import os
MODEL_ID = os.environ.get("MODEL_ID", "openbmb/MiniCPM5-1B-Base")
OUT = os.environ.get("OUTPUT_DIR", "/kaggle/working/spark-distill-1b")
MAX_SEQ = int(os.environ.get("MAX_SEQ_LEN", "2048"))

from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=MODEL_ID,
    max_seq_length=MAX_SEQ,
    dtype=None, load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model, r=16, lora_alpha=16, lora_dropout=0, bias="none",
    target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
    use_gradient_checkpointing="unsloth",
)

def fmt(ex):
    ins, inp, out = ex["instruction"], ex.get("input","") or "", ex["output"]
    ctx = f"### Instruction:\n{ins}\n\n### Input:\n{inp}\n\n" if inp.strip() else f"### Instruction:\n{ins}\n\n"
    return {"text": ctx + f"### Response:\n{out}" + tokenizer.eos_token}

train = load_dataset("json", data_files="data/train.jsonl", split="train").map(fmt)
evals = load_dataset("json", data_files="data/eval_split.jsonl", split="train").map(fmt)

trainer = SFTTrainer(
    model=model, tokenizer=tokenizer, train_dataset=train, eval_dataset=evals,
    dataset_text_field="text", max_seq_length=MAX_SEQ,
    args=TrainingArguments(
        per_device_train_batch_size=2, gradient_accumulation_steps=4,
        warmup_steps=20, num_train_epochs=3, learning_rate=2e-4,
        fp16=True, logging_steps=10, eval_strategy="epoch", save_strategy="epoch",
        output_dir=OUT, optim="adamw_8bit", seed=42, report_to="none",
        save_total_limit=2,
    ),
)
trainer.train()
model.save_pretrained(OUT + "-lora")
tokenizer.save_pretrained(OUT + "-lora")
print(f"saved LoRA -> {OUT}-lora")

"""Fallback SFT without Unsloth (Kaggle/Colab T4兜底).
同超参 QLoRA r16, 基座 openbmb/MiniCPM5-1B-Base.
当 unsloth 安装失败时用此脚本: pip install transformers peft bitsandbytes trl datasets accelerate
"""
import os
MODEL_ID = os.environ.get("MODEL_ID", "openbmb/MiniCPM5-1B-Base")
OUT = os.environ.get("OUTPUT_DIR", "/kaggle/working/spark-distill-1b-fallback")
MAX_SEQ = int(os.environ.get("MAX_SEQ_LEN", "2048"))

import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

tok = AutoTokenizer.from_pretrained(MODEL_ID, use_fast=True)
tok.pad_token = tok.eos_token
tok.padding_side = "right"

bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                         bnb_4bit_compute_dtype=torch.float16)
base = AutoModelForCausalLM.from_pretrained(MODEL_ID, quantization_config=bnb,
                                            device_map="auto", trust_remote_code=True)
base = prepare_model_for_kbit_training(base)
peft_cfg = LoraConfig(r=16, lora_alpha=16, lora_dropout=0.0, bias="none",
                      task_type="CAUSAL_LM",
                      target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"])
model = get_peft_model(base, peft_cfg)

def fmt(ex):
    ins, inp, out = ex["instruction"], ex.get("input","") or "", ex["output"]
    ctx = f"### Instruction:\n{ins}\n\n### Input:\n{inp}\n\n" if inp.strip() else f"### Instruction:\n{ins}\n\n"
    return {"text": ctx + f"### Response:\n{out}" + tok.eos_token}

train = load_dataset("json", data_files="data/train.jsonl", split="train").map(fmt)
evals = load_dataset("json", data_files="data/eval_split.jsonl", split="train").map(fmt)

trainer = SFTTrainer(
    model=model, tokenizer=tok, train_dataset=train, eval_dataset=evals,
    dataset_text_field="text", max_seq_length=MAX_SEQ,
    args=TrainingArguments(
        per_device_train_batch_size=2, gradient_accumulation_steps=4,
        warmup_steps=20, num_train_epochs=3, learning_rate=2e-4,
        fp16=True, logging_steps=10, eval_strategy="epoch", save_strategy="epoch",
        output_dir=OUT, optim="paged_adamw_8bit", seed=42, report_to="none",
        save_total_limit=2, gradient_checkpointing=True,
    ),
)
trainer.train()
model.save_pretrained(OUT + "-lora")
tok.save_pretrained(OUT + "-lora")
print(f"saved LoRA -> {OUT}-lora")

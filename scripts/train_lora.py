"""
Nyasha LoRA Training Script
Trains a LoRA model on ZIMSEC math instruction data using Unsloth + DeepSeek/LLaMA
Run on Colab Pro+ (free tier can use T4, Pro+ uses A100)

Usage:
    python train_lora.py                          # Full training (A100 recommended)
    python train_lora.py --test                    # Quick test (10 samples, T4 friendly)
    python train_lora.py --model unsloth/DeepSeek-R1-Distill-Qwen-7B  # Alternative model
"""

import argparse
import json
import os
import sys
import random
from typing import List, Dict

def load_dataset(path: str, max_samples: int = None) -> List[Dict]:
    """Load JSONL dataset"""
    data = []
    with open(path, 'r') as f:
        for line in f:
            data.append(json.loads(line.strip()))
    if max_samples:
        data = data[:max_samples]
    return data

def format_instruction(example: Dict) -> str:
    """Format as Alpaca-style instruction"""
    system = "You are Nyasha, a ZIMSEC Mathematics tutor. Always explain step-by-step in the language the student used."
    prompt = f"{system}\n\n### Instruction:\n{example['instruction']}\n"
    if example.get('input'):
        prompt += f"### Input:\n{example['input']}\n"
    prompt += f"### Response:\n{example['response']}"
    return prompt

def save_alpaca_format(data: List[Dict], output_path: str):
    """Save in Alpaca JSON format for Unsloth"""
    alpaca_data = []
    for ex in data:
        text = format_instruction(ex)
        alpaca_data.append({"text": text})
    with open(output_path, 'w') as f:
        json.dump(alpaca_data, f, indent=2)

def generate_colab_notebook(output_path: str, dataset_path: str, use_test: bool = False):
    """Generate a ready-to-run Colab notebook for LoRA training"""
    
    notebook = {
        "cells": [
            {
                "cell_type": "markdown",
                "source": ["# Nyasha LoRA Training\n", "Train a ZIMSEC Math tutor model using Unsloth + LoRA"]
            },
            {
                "cell_type": "code",
                "source": [
                    "# Install dependencies\n",
                    "!pip install -q unsloth[colab] accelerate bitsandbytes xformers trl wandb\n",
                    "!pip install -q datasets transformers peft"
                ]
            },
            {
                "cell_type": "code",
                "source": [
                    "import torch\n",
                    "from unsloth import FastLanguageModel, is_bfloat16_supported\n",
                    "from datasets import Dataset\n",
                    "from trl import SFTTrainer\n",
                    "from transformers import TrainingArguments\n",
                    "import json, os\n",
                    "\n",
                    "# Configuration\n",
                    "MODEL_NAME = 'unsloth/DeepSeek-R1-Distill-Qwen-7B'  # or: 'unsloth/Llama-3.2-3B'\n",
                    "LORA_RANK = 16\n",
                    "USE_TEST_MODE = " + ("True" if use_test else "False") + "\n",
                    "MAX_SEQ_LEN = 1024\n"
                ]
            },
            {
                "cell_type": "code",
                "source": [
                    "# Upload dataset or load from GitHub\n",
                    "!wget -q https://raw.githubusercontent.com/MathiasChekanyanza/nyasha/main/datasets/nyasha_full_v1.jsonl\n",
                    "\n",
                    "data = []\n",
                    "with open('nyasha_full_v1.jsonl') as f:\n",
                    "    for line in f:\n",
                    "        data.append(json.loads(line.strip()))\n",
                    "\n",
                    "if USE_TEST_MODE:\n",
                    "    data = data[:50]\n",
                    "    print(f'Test mode: {len(data)} samples')\n",
                    "else:\n",
                    "    print(f'Full dataset: {len(data)} samples')"
                ]
            },
            {
                "cell_type": "code",
                "source": [
                    "# Format as Alpaca-style text\n",
                    "def format_example(ex):\n",
                    "    system = 'You are Nyasha, a ZIMSEC Mathematics tutor. Explain step-by-step.'\n",
                    "    prompt = f'{system}\\n\\n### Instruction:\\n{ex[\"instruction\"]}\\n'\n",
                    "    if ex.get('input'):\n",
                    "        prompt += f'### Input:\\n{ex[\"input\"]}\\n'\n",
                    "    prompt += f'### Response:\\n{ex[\"response\"]}'\n",
                    "    return prompt\n",
                    "\n",
                    "formatted = [{'text': format_example(ex)} for ex in data]\n",
                    "dataset = Dataset.from_list(formatted)\n",
                    "print(f'Dataset ready: {len(dataset)} examples')"
                ]
            },
            {
                "cell_type": "code",
                "source": [
                    "# Load base model\n",
                    "model, tokenizer = FastLanguageModel.from_pretrained(\n",
                    "    model_name=MODEL_NAME,\n",
                    "    max_seq_length=MAX_SEQ_LEN,\n",
                    "    dtype=None,\n",
                    "    load_in_4bit=True,\n",
                    "    device_map='auto',\n",
                    ")\n",
                    "\n",
                    "# Add LoRA adapters\n",
                    "model = FastLanguageModel.get_peft_model(\n",
                    "    model,\n",
                    "    r=LORA_RANK,\n",
                    "    target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],\n",
                    "    lora_alpha=LORA_RANK * 2,\n",
                    "    lora_dropout=0,\n",
                    "    bias='none',\n",
                    "    use_gradient_checkpointing='unsloth',\n",
                    "    random_state=42,\n",
                    "    max_seq_length=MAX_SEQ_LEN,\n",
                    ")\n",
                    "\n",
                    "print('Model loaded with LoRA adapters')"
                ]
            },
            {
                "cell_type": "code",
                "source": [
                    "# Training arguments\n",
                    "args = TrainingArguments(\n",
                    "    per_device_train_batch_size=2 if USE_TEST_MODE else 4,\n",
                    "    gradient_accumulation_steps=4,\n",
                    "    num_train_epochs=3,\n",
                    "    learning_rate=2e-4,\n",
                    "    warmup_steps=10,\n",
                    "    logging_steps=10,\n",
                    "    save_steps=100,\n",
                    "    output_dir='nyasha-lora-output',\n",
                    "    optim='adamw_8bit',\n",
                    "    fp16=not is_bfloat16_supported(),\n",
                    "    bf16=is_bfloat16_supported(),\n",
                    "    report_to='none',\n",
                    ")\n",
                    "\n",
                    "trainer = SFTTrainer(\n",
                    "    model=model,\n",
                    "    tokenizer=tokenizer,\n",
                    "    train_dataset=dataset,\n",
                    "    dataset_text_field='text',\n",
                    "    max_seq_length=MAX_SEQ_LEN,\n",
                    "    args=args,\n",
                    ")\n",
                    "\n",
                    "# Train!\n",
                    "trainer.train()"
                ]
            },
            {
                "cell_type": "code",
                "source": [
                    "# Save LoRA adapters\n",
                    "model.save_pretrained('nyasha-lora')\n",
                    "tokenizer.save_pretrained('nyasha-lora')\n",
                    "print('✅ Model saved to nyasha-lora/')\n",
                    "\n",
                    "# Optional: Push to HuggingFace\n",
                    "if not USE_TEST_MODE:\n",
                    "    model.push_to_hub('mathiaschekanyanza/nyasha-lora-v1', private=True)\n",
                    "    tokenizer.push_to_hub('mathiaschekanyanza/nyasha-lora-v1', private=True)\n",
                    "    print('✅ Pushed to HuggingFace Hub')"
                ]
            },
            {
                "cell_type": "code",
                "source": [
                    "# Quick inference test\n",
                    "FastLanguageModel.for_inference(model)\n",
                    "test_prompt = \"You are Nyasha, a ZIMSEC Mathematics tutor.\\n\\n### Instruction:\\nSolve 3x + 7 = 22\\n\\n### Response:\\n\"\n",
                    "inputs = tokenizer(test_prompt, return_tensors='pt').to('cuda')\n",
                    "outputs = model.generate(**inputs, max_new_tokens=200)\n",
                    "result = tokenizer.decode(outputs[0])\n",
                    "print('\\n=== Test Output ===')\n",
                    "print(result.split('### Response:')[-1].strip())"
                ]
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 4
    }
    
    with open(output_path, 'w') as f:
        json.dump(notebook, f, indent=1)

def main():
    parser = argparse.ArgumentParser(description='Nyasha LoRA Training')
    parser.add_argument('--test', action='store_true', help='Test mode with 10 samples')
    parser.add_argument('--dataset', default='/app/.openclaw/workspace/projects/nyasha/datasets/nyasha_bilingual_v1.jsonl',
                       help='Dataset path')
    parser.add_argument('--colab', default='/app/.openclaw/workspace/projects/nyasha/scripts/nyasha_lora_colab.ipynb',
                       help='Colab notebook output path')
    args = parser.parse_args()
    
    # Load dataset
    max_samples = 10 if args.test else None
    data = load_dataset(args.dataset, max_samples)
    print(f"Loaded {len(data)} samples from {args.dataset}")
    
    # Save Alpaca format for training
    alpaca_path = args.dataset.replace('.jsonl', '_alpaca.json')
    save_alpaca_format(data, alpaca_path)
    print(f"Saved Alpaca format to {alpaca_path}")
    
    # Generate Colab notebook
    generate_colab_notebook(args.colab, args.dataset, use_test=args.test)
    print(f"Generated Colab notebook: {args.colab}")
    print("\n✅ Ready! Open the notebook in Colab:")
    print(f"   1. Upload {alpaca_path} to Colab (or push to GitHub)")
    print(f"   2. Open {args.colab} in Google Colab")
    print(f"   3. Run all cells (T4 GPU ~1hr, A100 ~15min)")

if __name__ == '__main__':
    main()

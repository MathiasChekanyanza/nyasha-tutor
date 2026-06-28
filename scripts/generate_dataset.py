#!/usr/bin/env python3
"""
Nyasha Dataset Generator — v1.0
Expands ZIMSEC math instruction seed from ~140 to 5,000+ high-quality pairs.

Strategy:
  Tier 1 — Rich template expansion with real math problems
  Tier 2 — LLM Self-Instruct generation (Gemini/GPT/DeepSeek)
  Tier 3 — Past paper extraction
  Tier 4 — Ndebele translation layer

Usage:
  python generate_dataset.py [--tier 1|2|3|4] [--topic "Topic Name"]
"""

import json
import random
import math
import sys
import os
from pathlib import Path

# --- Configuration ---
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_FILE = BASE_DIR / "templates" / "template_library.json"
SEED_FILE = Path(os.environ.get("SEED_FILE", "/app/projects/ai4i/nyasha/datasets/instruction/zimsec_math_seed.jsonl"))
OUTPUT_DIR = BASE_DIR / "datasets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# --- Math Utilities ---

def gcd(a, b):
    return math.gcd(a, b) if hasattr(math, 'gcd') else _gcd(a, b)

def _gcd(a, b):
    while b:
        a, b = b, a % b
    return abs(a)

def lcm(a, b):
    return abs(a * b) // gcd(a, b)

def simplify_fraction(num, den):
    g = gcd(num, den)
    return num // g, den // g


def pick_var(var_spec, rng):
    """Pick a random value from a var spec with min/max/choices/step."""
    if "choices" in var_spec:
        return rng.choice(var_spec["choices"])
    if "min" in var_spec:
        if "step" in var_spec:
            # Step-based: generate a value from the range in steps
            step = var_spec["step"]
            vals = list(range(var_spec["min"], var_spec.get("max", var_spec["min"] + 1), step))
            return rng.choice(vals) if vals else var_spec["min"]
        return rng.randint(var_spec["min"], var_spec.get("max", var_spec["min"] + 10))
    return 1  # fallback


def compute_derived_vars(template, var_values):
    """Compute derived variables needed by the template."""
    result = dict(var_values)

    v = result

    # --- Fractions addition ---
    if "{lcd}" in template.get("response_template", "") or "{lcd}" in template.get("instruction_template", ""):
        b, d = v.get("b", 1), v.get("d", 1)
        v["lcd"] = lcm(b, d)
        v["a_conv"] = v.get("a", 1) * (v["lcd"] // b)
        v["c_conv"] = v.get("c", 1) * (v["lcd"] // d)
        v["num_sum"] = v["a_conv"] + v["c_conv"]
        num_s, den_s = simplify_fraction(v["num_sum"], v["lcd"])
        v["simplified"] = f"{num_s}/{den_s}" if den_s != 1 else str(num_s)

    # --- Percentage to fraction ---
    if "{percent}" in template.get("response_template", "") and "{hcf}" in template.get("response_template", ""):
        pct = v.get("percent", 50)
        v["hcf"] = gcd(pct, 100)
        num_s, den_s = simplify_fraction(pct, 100)
        v["simplified"] = f"{num_s}/{den_s}" if den_s != 1 else str(num_s)

    # --- Decimal to percentage ---
    if "{decimal}" in template.get("response_template", ""):
        dec = v.get("decimal", 0.5)
        v["percent"] = int(dec * 100)

    # --- Indices ---
    if "{sum}" in template.get("response_template", ""):
        v["sum"] = v.get("m", 0) + v.get("n", 0)
    if "{diff}" in template.get("response_template", ""):
        v["diff"] = v.get("m", 0) - v.get("n", 0)

    # --- Standard form ---
    if "{mantissa}" in template.get("response_template", ""):
        n = v.get("n", 1000)
        if n >= 1:
            exp = len(str(int(n))) - 1
            mantissa = n / (10 ** exp)
            v["mantissa"] = mantissa
            v["exponent"] = exp
            v["direction"] = "right"
        else:
            n_str = f"{n:.10f}".rstrip("0")
            # Find first non-zero digit position
            dec_part = n_str.split(".")[1]
            first_nonzero = 0
            for i, ch in enumerate(dec_part):
                if ch != "0":
                    first_nonzero = i
                    break
            exp = -(first_nonzero + 1)
            mantissa = n * (10 ** (-exp))
            v["mantissa"] = round(mantissa, 6)
            v["exponent"] = exp
            v["direction"] = "left"

    # --- Linear equations ---
    if "{rhs}" in template.get("response_template", ""):
        a = v.get("a", 1)
        b = v.get("b", 0)
        c = v.get("c", 0)
        v["rhs"] = c - b
        v["ans"] = v["rhs"] // a if v["rhs"] % a == 0 else v["rhs"] / a
        if isinstance(v["ans"], float) and v["ans"] == int(v["ans"]):
            v["ans"] = int(v["ans"])

    # --- Word problem marbles ---
    if "{x_marble}" in template.get("response_template", ""):
        n1 = v.get("n1", 10)
        n2 = v.get("n2", 3)
        total = v.get("total", 40)
        v["rhs"] = total - n1
        v["ans"] = v["rhs"] // n2 if v["rhs"] % n2 == 0 else v["rhs"] / n2
        if isinstance(v["ans"], float) and v["ans"] == int(v["ans"]):
            v["ans"] = int(v["ans"])

    # --- Trig ---
    if "{angle}" in template.get("response_template", "") and "{ratio}" in template.get("response_template", ""):
        import math as m
        opp = v.get("opp", 5)
        hyp = v.get("hyp", 10)
        ratio = opp / hyp
        angle = round(m.degrees(m.asin(ratio)), 1)
        v["ratio"] = ratio
        v["angle"] = angle
    elif "{tan_val}" in template.get("response_template", ""):
        import math as m
        adj = v.get("adj", 10)
        angle = v.get("angle", 30)
        tan_val = m.tan(m.radians(angle))
        ans = adj * tan_val
        v["tan_val"] = tan_val
        v["ans"] = ans

    # --- Mean ---
    if "{mean}" in template.get("response_template", "") or "{median}" in template.get("response_template", ""):
        count = v.get("count", 5)
        min_val = v.get("min_val", 1)
        max_val = v.get("max_val", 50)
        numbers = [rng.randint(min_val, max_val) for _ in range(count)]
        v["numbers"] = numbers
        total = sum(numbers)
        v["total"] = total
        v["sum_str"] = " + ".join(str(n) for n in numbers)
        v["n"] = count
        v["mean"] = total / count

    if "{sorted_str}" in template.get("response_template", ""):
        numbers = sorted(v.get("sorted_numbers", []))
        v["sorted_str"] = ", ".join(str(n) for n in numbers)

    # --- Median ---
    if "{median}" in template.get("response_template", ""):
        count = v.get("count", 5)
        min_val = v.get("min_val", 1)
        max_val = v.get("max_val", 50)
        numbers = sorted([rng.randint(min_val, max_val) for _ in range(count)])
        v["sorted_numbers"] = numbers
        v["n"] = count
        mid = (count + 1) // 2
        v["mid_pos"] = mid
        v["median"] = numbers[mid - 1]

    # --- Mensuration ---
    if "{perim}" in template.get("response_template", ""):
        length = v.get("len", 10)
        width = v.get("wid", 5)
        v["sum"] = length + width
        v["perim"] = 2 * (length + width)
        v["area"] = length * width

    # --- Vectors ---
    if "{x_new}" in template.get("response_template", ""):
        v["x_new"] = v.get("x", 0) + v.get("dx", 0)
        v["y_new"] = v.get("y", 0) + v.get("dy", 0)

    # --- Coordinate Geometry ---
    if "{gradient}" in template.get("response_template", ""):
        x1, y1 = v.get("x1", 0), v.get("y1", 0)
        x2, y2 = v.get("x2", 1), v.get("y2", 1)
        v["dy"] = y2 - y1
        v["dx"] = x2 - x1
        v["gradient"] = v["dy"] / v["dx"] if v["dx"] != 0 else float('inf')

    return result


def render_template(template, var_values):
    """Render instruction and response from template + vars."""
    instruction = template["instruction_template"]
    response = template["response_template"]

    for key, val in var_values.items():
        placeholder = "{" + key + "}"
        # Format floats nicely
        if isinstance(val, float):
            formatted = f"{val:.4f}".rstrip("0").rstrip(".")
            instruction = instruction.replace(placeholder, formatted)
            response = response.replace(placeholder, formatted)
        else:
            instruction = instruction.replace(placeholder, str(val))
            response = response.replace(placeholder, str(val))

    return instruction, response


def load_seed():
    """Load existing seed data."""
    if not SEED_FILE.exists():
        print(f"[WARN] Seed file not found: {SEED_FILE}")
        return []
    pairs = []
    with open(SEED_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                pairs.append(json.loads(line))
    print(f"[INFO] Loaded {len(pairs)} seed pairs")
    return pairs


def load_templates():
    """Load template library."""
    if not TEMPLATE_FILE.exists():
        print(f"[ERROR] Template file not found: {TEMPLATE_FILE}")
        return []
    with open(TEMPLATE_FILE) as f:
        templates = json.load(f)
    print(f"[INFO] Loaded {len(templates)} template groups")
    return templates


def generate_tier1(templates, target_total=5000, topic_filter=None, rng=random.Random(42)):
    """Tier 1: Rich template expansion with random variable substitution."""
    generated = []

    # Determine how many per topic
    topic_templates = {}
    for t in templates:
        topic = t["topic"]
        if topic_filter and topic != topic_filter:
            continue
        if topic not in topic_templates:
            topic_templates[topic] = []
        topic_templates[topic].append(t)

    if not topic_templates:
        print("[ERROR] No templates matching topic filter")
        return []

    per_topic = target_total // len(topic_templates)
    print(f"[TIER1] Generating ~{per_topic} per topic across {len(topic_templates)} topics")

    for topic, topic_tmpls in topic_templates.items():
        count = 0
        attempts = 0
        max_attempts = per_topic * 20  # safety limit

        while count < per_topic and attempts < max_attempts:
            attempts += 1

            # Pick a random template from this topic
            t = rng.choice(topic_tmpls)
            subtopic = t["subtopic"]

            # Generate variable values
            var_values = {}
            for key, spec in t.get("vars", {}).items():
                var_values[key] = pick_var(spec, rng)

            # Compute derived variables
            var_values = compute_derived_vars(t, var_values)

            # Render
            try:
                instruction, response = render_template(t, var_values)
            except Exception as e:
                continue

            # Build pair
            pair = {
                "instruction": instruction,
                "input": f"{topic}: {subtopic}",
                "response": response,
                "topic": topic,
                "subtopic": subtopic,
                "language": t.get("language", "english"),
                "type": t.get("type", "worked_example"),
                "source": "template_tier1"
            }
            generated.append(pair)
            count += 1

        print(f"  {topic}: generated {count} pairs")

    return generated


def generate_tier2(templates, target_total=2500, topic_filter=None, rng=random.Random(99)):
    """
    Tier 2: LLM Self-Instruct generation.
    For now, generates structured template variations with random difficulty levels.
    Future: API-based generation using Gemini/GPT.
    """
    generated = []

    difficulty_levels = ["basic", "intermediate", "advanced"]
    instruction_stems = [
        "Explain", "Calculate", "Find", "Solve", "Evaluate",
        "Determine", "Simplify", "Show that", "Prove that",
        "Express"
    ]

    topic_templates = {}
    for t in templates:
        topic = t["topic"]
        if topic_filter and topic != topic_filter:
            continue
        if topic not in topic_templates:
            topic_templates[topic] = []
        topic_templates[topic].append(t)

    if not topic_templates:
        return []

    per_topic = target_total // len(topic_templates)

    for topic, topic_tmpls in topic_templates.items():
        count = 0
        attempts = 0
        max_attempts = per_topic * 30

        while count < per_topic and attempts < max_attempts:
            attempts += 1
            t = rng.choice(topic_tmpls)
            subtopic = t["subtopic"]

            # Pick difficulty
            difficulty = rng.choice(difficulty_levels)
            stem = rng.choice(instruction_stems)

            # Generate with more variation
            var_values = {}
            for key, spec in t.get("vars", {}).items():
                var_values[key] = pick_var(spec, rng)

            var_values = compute_derived_vars(t, var_values)

            try:
                instruction, response = render_template(t, var_values)
            except Exception:
                continue

            # Slightly modify instruction for variation
            if rng.random() < 0.3:
                instruction = f"{stem}: {instruction.lower().lstrip(stem.lower()).strip()}"

            pair = {
                "instruction": instruction,
                "input": f"{topic}: {subtopic}",
                "response": response,
                "topic": topic,
                "subtopic": subtopic,
                "language": t.get("language", "english"),
                "type": t.get("type", "worked_example"),
                "difficulty": difficulty,
                "source": "llm_synthetic_tier2"
            }
            generated.append(pair)
            count += 1

        print(f"  {topic}: generated {count} synthetic pairs")

    return generated


def export_dataset(pairs, filename="nyasha_dataset_v1.jsonl"):
    """Export pairs to JSONL."""
    output_path = OUTPUT_DIR / filename
    with open(output_path, "w") as f:
        for pair in pairs:
            f.write(json.dumps(pair, ensure_ascii=False) + "\n")
    print(f"[EXPORT] Saved {len(pairs)} pairs to {output_path}")
    return output_path


def generate_stats_report(pairs):
    """Print statistics about the generated dataset."""
    from collections import Counter

    print("\n" + "=" * 60)
    print("DATASET STATISTICS")
    print("=" * 60)

    topics = Counter(p["topic"] for p in pairs)
    print(f"\nTopics ({len(topics)}):")
    for topic, count in topics.most_common():
        print(f"  {topic}: {count}")

    types = Counter(p["type"] for p in pairs)
    print(f"\nTypes ({len(types)}):")
    for t, count in types.most_common():
        print(f"  {t}: {count}")

    langs = Counter(p["language"] for p in pairs)
    print(f"\nLanguages ({len(langs)}):")
    for lang, count in langs.most_common():
        print(f"  {lang}: {count}")

    sources = Counter(p.get("source", "unknown") for p in pairs)
    print(f"\nSources ({len(sources)}):")
    for src, count in sources.most_common():
        print(f"  {src}: {count}")

    print(f"\nTotal pairs: {len(pairs)}")


def main():
    # Parse args
    import argparse
    parser = argparse.ArgumentParser(description="Nyasha Dataset Generator")
    parser.add_argument("--tier", type=int, default=1, choices=[1, 2, 3, 4],
                        help="Generation tier to run (default: 1)")
    parser.add_argument("--topic", type=str, default=None,
                        help="Filter to a specific topic")
    parser.add_argument("--target", type=int, default=5000,
                        help="Target total pairs (default: 5000)")
    parser.add_argument("--seed-file", type=str, default=str(SEED_FILE),
                        help=f"Path to seed JSONL (default: {SEED_FILE})")
    parser.add_argument("--output", type=str, default="nyasha_dataset_v1.jsonl",
                        help="Output filename")
    args = parser.parse_args()

    # Override seed file if provided
    global SEED_FILE
    if args.seed_file != str(SEED_FILE):
        SEED_FILE = Path(args.seed_file)

    print(f"Nyasha Dataset Generator v1.0")
    print(f"  Tier: {args.tier}")
    print(f"  Topic filter: {args.topic or 'ALL'}")
    print(f"  Target: {args.target} pairs")
    print(f"  Seed: {SEED_FILE}")
    print()

    templates = load_templates()
    if not templates:
        print("[FATAL] No templates loaded. Exiting.")
        sys.exit(1)

    # Load seed for reference
    seed = load_seed()

    all_pairs = []

    if args.tier == 1:
        print("\n=== TIER 1: Rich Template Expansion ===\n")
        tier1_pairs = generate_tier1(templates, args.target, args.topic)
        all_pairs.extend(tier1_pairs)
    elif args.tier == 2:
        print("\n=== TIER 2: LLM Synthetic Generation ===\n")
        tier2_pairs = generate_tier2(templates, args.target, args.topic)
        all_pairs.extend(tier2_pairs)
    elif args.tier == 3:
        print("=== TIER 3: Past Paper Extraction ===")
        print("[INFO] Not yet implemented — requires scraping infrastructure")
    elif args.tier == 4:
        print("=== TIER 4: Ndebele Translation ===")
        print("[INFO] Not yet implemented — requires Shona→Ndebele translation pipeline")

    if all_pairs:
        export_dataset(all_pairs, args.output)
        generate_stats_report(all_pairs)
    else:
        print("[WARN] No pairs generated.")


if __name__ == "__main__":
    main()

#!/usr/bin/env node
/**
 * Nyasha Dataset Generator — v1.0 (Node.js)
 * Expands ZIMSEC math instruction seed from ~140 to 5,000+ high-quality pairs.
 *
 * Usage:
 *   node generate_dataset.mjs --tier 1 --topic "Numbers and Operations" --target 700
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dirname, '..');
const TEMPLATE_FILE = join(BASE_DIR, 'templates', 'template_library.json');
const SEED_FILE = '/app/projects/ai4i/nyasha/datasets/instruction/zimsec_math_seed.jsonl';
const OUTPUT_DIR = join(BASE_DIR, 'datasets');

// Ensure output dir
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// --- Math Utilities ---

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
}

function simplifyFraction(num, den) {
  const g = gcd(num, den);
  return [num / g, den / g];
}

// --- Random ---

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickChoice(rng, choices) {
  return choices[Math.floor(rng() * choices.length)];
}

function pickVar(spec, rng) {
  if (spec.choices) return pickChoice(rng, spec.choices);
  if (spec.min !== undefined) {
    if (spec.step) {
      const vals = [];
      for (let v = spec.min; v <= (spec.max || spec.min); v += spec.step) vals.push(v);
      return vals.length ? pickChoice(rng, vals) : spec.min;
    }
    return randInt(rng, spec.min, spec.max || spec.min + 10);
  }
  return 1;
}

// --- Template Rendering ---

function computeDerivedVars(template, vars, rng) {
  const v = { ...vars };
  const resp = template.response_template || '';

  // Fractions addition — trigger if any fraction-related placeholder present
  if (resp.includes('{lcd}') || resp.includes('{num_sum}') || resp.includes('{a_conv}')) {
    const b = v.b || 1;
    const d = v.d || v.b || 1;
    // If a,b and c,d have same denominator, we handle it differently
    // For pizza template: slices use same denominator
    const [a_val, c_val] = [v.a || 1, v.c || 0];
    if (resp.includes('{lcd}')) {
      v.lcd = lcm(b, d);
      v.a_conv = a_val * (v.lcd / b);
      v.c_conv = c_val * (v.lcd / d);
    } else {
      // Same denominator case (pizza)
      v.lcd = b;
      v.a_conv = a_val;
      v.c_conv = c_val;
    }
    const numerator = (v.a_conv || a_val) + (v.c_conv || c_val);
    const denominator = v.lcd || b;
    v.num_sum = numerator;
    const [num, den] = simplifyFraction(numerator, denominator);
    v.simplified = den !== 1 ? `${num}/${den}` : String(num);
  }

  // Percentage to fraction
  if (resp.includes('{hcf}')) {
    const pct = v.percent || 50;
    v.hcf = gcd(pct, 100);
    const [num, den] = simplifyFraction(pct, 100);
    v.simplified = den !== 1 ? `${num}/${den}` : String(num);
  }

  // Decimal to percentage
  if (v.decimal !== undefined) {
    v.percent = (v.decimal * 100).toFixed(1);
  }

  // Indices
  if (resp.includes('{sum}')) v.sum = (v.m || 0) + (v.n || 0);
  if (resp.includes('{diff}')) v.diff = (v.m || 0) - (v.n || 0);

  // Standard form
  if (resp.includes('{mantissa}') || resp.includes('{n_std}')) {
    const n = v.n || 1000;
    if (n >= 1) {
      const exp = String(Math.floor(n)).length - 1;
      v.mantissa = n / Math.pow(10, exp);
      v.exponent = exp;
      v.direction = 'right';
    } else {
      const s = n.toFixed(10).replace(/0+$/, '');
      const decPart = s.split('.')[1] || '';
      let firstNonZero = 0;
      for (let i = 0; i < decPart.length; i++) {
        if (decPart[i] !== '0') { firstNonZero = i; break; }
      }
      const exp = -(firstNonZero + 1);
      v.mantissa = parseFloat((n * Math.pow(10, -exp)).toFixed(6));
      v.exponent = exp;
      v.direction = 'left';
    }
    v.n_std = `${v.mantissa} × 10^${v.exponent}`;
  }

  // Linear equations
  if (resp.includes('{rhs}')) {
    const a = v.a || 1, b = v.b || 0, c = v.c || 0;
    v.rhs = c - b;
    v.ans = v.rhs % a === 0 ? v.rhs / a : v.rhs / a;
  }

  // Marbles word problem
  if (resp.includes('{x_marble}')) {
    const n1 = v.n1 || 10, n2 = v.n2 || 3, total = v.total || 40;
    v.rhs = total - n1;
    v.ans = v.rhs % n2 === 0 ? v.rhs / n2 : v.rhs / n2;
  }

  // Trig - sin
  if (resp.includes('{ratio') || resp.includes('{angle}')) {
    const opp = v.opp || 5, hyp = v.hyp || 10;
    v.ratio = opp / hyp;
    v.angle = Math.round(Math.asin(v.ratio) * 180 / Math.PI * 10) / 10;
  }

  // Trig - tan
  if (resp.includes('{tan_val') || resp.includes('{ans')) {
    const adj = v.adj || 10, angle = v.angle || 30;
    v.tan_val = Math.tan(angle * Math.PI / 180);
    v.ans = adj * v.tan_val;
  }

  // Mean — trigger on any mean-related placeholder
  if (resp.includes('{mean') || resp.includes('{sorted_str}') || resp.includes('{total}')) {
    const count = v.count || 5;
    const minVal = v.min_val || 1, maxVal = v.max_val || 50;
    const numbers = Array.from({ length: count }, () => randInt(rng, minVal, maxVal));
    v.numbers = numbers;
    v.total = numbers.reduce((a, b) => a + b, 0);
    v.sum_str = numbers.join(' + ');
    v.n = count;
    v.mean = v.total / count;
  }

  // Median
  if (resp.includes('{median') || resp.includes('{sorted_str}')) {
    const count = v.count || 5;
    const minVal = v.min_val || 1, maxVal = v.max_val || 50;
    const numbers = Array.from({ length: count }, () => randInt(rng, minVal, maxVal)).sort((a, b) => a - b);
    v.sorted_numbers = numbers;
    v.sorted_str = numbers.join(', ');
    v.n = count;
    const mid = Math.ceil(count / 2);
    v.mid_pos = mid;
    v.median = numbers[mid - 1];
  }

  // Mensuration
  if (resp.includes('{perim') || resp.includes('{area}')) {
    const len = v.len || 10, wid = v.wid || 5;
    v.sum = len + wid;
    v.perim = 2 * (len + wid);
    v.area = len * wid;
  }

  // Vectors
  if (resp.includes('{x_new') || resp.includes('{y_new}')) {
    v.x_new = (v.x || 0) + (v.dx || 0);
    v.y_new = (v.y || 0) + (v.dy || 0);
  }

  // Coordinate geometry
  if (resp.includes('{gradient') || resp.includes('{dy}') || resp.includes('{dx}')) {
    const x1 = v.x1 || 0, y1 = v.y1 || 0, x2 = v.x2 || 1, y2 = v.y2 || 1;
    v.dy = y2 - y1;
    v.dx = x2 - x1;
    v.gradient = v.dx !== 0 ? v.dy / v.dx : Infinity;
  }

  return v;
}

function renderTemplate(template, vars) {
  let instruction = template.instruction_template;
  let response = template.response_template;

  for (const [key, val] of Object.entries(vars)) {
    const bare = `{${key}}`;
    let formatted;
    if (typeof val === 'number') {
      // Provide multiple formatting options
      const def = parseFloat(val.toFixed(6)).toString();
      const oneDecimal = Number.isInteger(val) ? val.toString() : val.toFixed(1);
      const twoDecimal = val.toFixed(2);
      const threeDecimal = val.toFixed(3);
      const fourDecimal = val.toFixed(4);
      // Replace each variant if it appears
      instruction = instruction.replaceAll(`{${key}:.1f}`, oneDecimal);
      instruction = instruction.replaceAll(`{${key}:.2f}`, twoDecimal);
      instruction = instruction.replaceAll(`{${key}:.3f}`, threeDecimal);
      instruction = instruction.replaceAll(`{${key}:.4f}`, fourDecimal);
      instruction = instruction.replaceAll(bare, def);
      response = response.replaceAll(`{${key}:.1f}`, oneDecimal);
      response = response.replaceAll(`{${key}:.2f}`, twoDecimal);
      response = response.replaceAll(`{${key}:.3f}`, threeDecimal);
      response = response.replaceAll(`{${key}:.4f}`, fourDecimal);
      response = response.replaceAll(bare, def);
    } else {
      formatted = String(val);
      instruction = instruction.replaceAll(bare, formatted);
      response = response.replaceAll(bare, formatted);
    }
  }

  // Also replace remaining {ans} from derived computations
  // (these are computed in computeDerivedVars and already in vars)
  // Handle {numbers} array specially
  if (Array.isArray(vars.numbers)) {
    const numsStr = vars.numbers.join(', ');
    instruction = instruction.replaceAll('{numbers}', numsStr);
    response = response.replaceAll('{numbers}', numsStr);
  }
  if (Array.isArray(vars.sorted_numbers)) {
    // Already handled through sorted_str, but just in case
  }

  return [instruction, response];
}

// --- Loaders ---

function loadTemplates() {
  const raw = readFileSync(TEMPLATE_FILE, 'utf8');
  const templates = JSON.parse(raw);
  console.log(`[INFO] Loaded ${templates.length} template groups`);
  return templates;
}

function loadSeed() {
  try {
    const raw = readFileSync(SEED_FILE, 'utf8');
    const pairs = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    console.log(`[INFO] Loaded ${pairs.length} seed pairs`);
    return pairs;
  } catch {
    console.log('[WARN] Seed file not found');
    return [];
  }
}

// --- Generators ---

function flattenTemplates(templates) {
  const flat = [];
  for (const group of templates) {
    for (const t of (group.templates || [])) {
      flat.push({ ...t, topic: group.topic, subtopic: group.subtopic });
    }
  }
  return flat;
}

function generateTier1(templates, targetTotal = 5000, topicFilter = null, seed = 42) {
  const rng = seededRandom(seed);
  const generated = [];

  // Flatten nested structure
  const allTemplates = flattenTemplates(templates);

  // Group flattened templates by topic
  const topicMap = {};
  for (const t of allTemplates) {
    if (topicFilter && t.topic !== topicFilter) continue;
    if (!topicMap[t.topic]) topicMap[t.topic] = [];
    topicMap[t.topic].push(t);
  }

  const topics = Object.keys(topicMap);
  if (!topics.length) {
    console.log('[ERROR] No templates matching topic filter');
    return [];
  }

  const perTopic = Math.floor(targetTotal / topics.length);
  console.log(`[TIER1] Generating ~${perTopic} per topic across ${topics.length} topics`);

  for (const topic of topics) {
    const tmpls = topicMap[topic];
    let count = 0;
    let attempts = 0;
    const maxAttempts = perTopic * 30;

    while (count < perTopic && attempts < maxAttempts) {
      attempts++;
      const t = pickChoice(rng, tmpls);
      const subtopic = t.subtopic;

      // Generate variable values
      const vars = {};
      for (const [key, spec] of Object.entries(t.vars || {})) {
        vars[key] = pickVar(spec, rng);
      }

      // Compute derived variables
      const computed = computeDerivedVars(t, vars, rng);

      // Render
      try {
        const [instruction, response] = renderTemplate(t, computed);
        generated.push({
          instruction: instruction || '',
          input: `${topic}: ${subtopic}`,
          response: response || '',
          topic,
          subtopic,
          language: t.language || 'english',
          type: t.type || 'worked_example',
          source: 'template_tier1'
        });
        count++;
      } catch (e) {
        // skip
      }
    }
    console.log(`  ${topic}: generated ${count} pairs`);
  }

  return generated;
}

function generateTier2(templates, targetTotal = 2500, topicFilter = null, seed = 99) {
  const rng = seededRandom(seed);
  const generated = [];

  const stems = ['Explain', 'Calculate', 'Find', 'Solve', 'Evaluate', 'Determine', 'Simplify', 'Show that', 'Express'];

  const allTemplates = flattenTemplates(templates);

  const topicMap = {};
  for (const t of allTemplates) {
    if (topicFilter && t.topic !== topicFilter) continue;
    if (!topicMap[t.topic]) topicMap[t.topic] = [];
    topicMap[t.topic].push(t);
  }

  const topics = Object.keys(topicMap);
  if (!topics.length) return [];

  const perTopic = Math.floor(targetTotal / topics.length);

  for (const topic of topics) {
    const tmpls = topicMap[topic];
    let count = 0;
    let attempts = 0;
    const maxAttempts = perTopic * 50;

    while (count < perTopic && attempts < maxAttempts) {
      attempts++;
      const t = pickChoice(rng, tmpls);
      const subtopic = t.subtopic;
      const stem = pickChoice(rng, stems);

      const vars = {};
      for (const [key, spec] of Object.entries(t.vars || {})) {
        vars[key] = pickVar(spec, rng);
      }

      const computed = computeDerivedVars(t, vars, rng);

      try {
        let [instruction, response] = renderTemplate(t, computed);

        // Add variation
        if (rng() < 0.3) {
          instruction = `${stem}: ${instruction.toLowerCase()}`;
        }

        generated.push({
          instruction: instruction || '',
          input: `${topic}: ${subtopic}`,
          response: response || '',
          topic,
          subtopic,
          language: t.language || 'english',
          type: t.type || 'worked_example',
          difficulty: ['basic', 'intermediate', 'advanced'][Math.floor(rng() * 3)],
          source: 'llm_synthetic_tier2'
        });
        count++;
      } catch (e) {
        // skip
      }
    }
    console.log(`  ${topic}: generated ${count} synthetic pairs`);
  }

  return generated;
}

// --- Export & Stats ---

function exportDataset(pairs, filename) {
  const outputPath = join(OUTPUT_DIR, filename);
  const lines = pairs.map(p => JSON.stringify(p)).join('\n');
  writeFileSync(outputPath, lines, 'utf8');
  console.log(`\n[EXPORT] Saved ${pairs.length} pairs to ${outputPath}`);
  return outputPath;
}

function statsReport(pairs) {
  console.log('\n' + '='.repeat(60));
  console.log('DATASET STATISTICS');
  console.log('='.repeat(60));

  const topics = {};
  const types = {};
  const langs = {};
  const sources = {};

  for (const p of pairs) {
    topics[p.topic] = (topics[p.topic] || 0) + 1;
    types[p.type] = (types[p.type] || 0) + 1;
    langs[p.language] = (langs[p.language] || 0) + 1;
    sources[p.source || 'unknown'] = (sources[p.source || 'unknown'] || 0) + 1;
  }

  console.log(`\nTopics (${Object.keys(topics).length}):`);
  for (const [t, c] of Object.entries(topics).sort((a, b) => b[1] - a[1]))
    console.log(`  ${t}: ${c}`);

  console.log(`\nTypes (${Object.keys(types).length}):`);
  for (const [t, c] of Object.entries(types).sort((a, b) => b[1] - a[1]))
    console.log(`  ${t}: ${c}`);

  console.log(`\nLanguages (${Object.keys(langs).length}):`);
  for (const [t, c] of Object.entries(langs).sort((a, b) => b[1] - a[1]))
    console.log(`  ${t}: ${c}`);

  console.log(`\nSources (${Object.keys(sources).length}):`);
  for (const [t, c] of Object.entries(sources).sort((a, b) => b[1] - a[1]))
    console.log(`  ${t}: ${c}`);

  console.log(`\nTotal pairs: ${pairs.length}`);
}

// --- CLI ---

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { tier: 1, topic: null, target: 5000, output: 'nyasha_dataset_v1.jsonl' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tier') opts.tier = parseInt(args[++i]);
    else if (args[i] === '--topic') opts.topic = args[++i];
    else if (args[i] === '--target') opts.target = parseInt(args[++i]);
    else if (args[i] === '--output') opts.output = args[++i];
  }
  return opts;
}

function main() {
  const opts = parseArgs();

  console.log('Nyasha Dataset Generator v1.0 (Node.js)');
  console.log(`  Tier: ${opts.tier}`);
  console.log(`  Topic filter: ${opts.topic || 'ALL'}`);
  console.log(`  Target: ${opts.target} pairs`);
  console.log(`  Seed: ${SEED_FILE}\n`);

  const templates = loadTemplates();
  if (!templates.length) {
    console.log('[FATAL] No templates loaded.');
    process.exit(1);
  }

  const seed = loadSeed();
  let allPairs = [];

  if (opts.tier === 1) {
    console.log('\n=== TIER 1: Rich Template Expansion ===\n');
    allPairs = generateTier1(templates, opts.target, opts.topic);
  } else if (opts.tier === 2) {
    console.log('\n=== TIER 2: LLM Synthetic Generation ===\n');
    allPairs = generateTier2(templates, opts.target, opts.topic);
  } else if (opts.tier === 3) {
    console.log('=== TIER 3: Past Paper Extraction ===');
    console.log('[INFO] Not yet implemented');
  } else if (opts.tier === 4) {
    console.log('=== TIER 4: Ndebele Translation ===');
    console.log('[INFO] Not yet implemented');
  }

  if (allPairs.length) {
    exportDataset(allPairs, opts.output);
    statsReport(allPairs);
  } else {
    console.log('[WARN] No pairs generated.');
  }
}

main();

#!/usr/bin/env node
/**
 * Nyasha Bilingual Dataset — Quality Filter & Dedup v2 (final)
 *
 * Reads nyasha_bilingual_v1.jsonl:
 *  - Removes any pair missing required fields
 *  - Removes low-quality responses (too short, placeholder, incomplete math)
 *  - Deduplicates: exact (instruction+response) pairs removed as true dupes
 *  - Reports near-duplicate counts without removing (for awareness)
 *  - Full stats: topic balance, language parity, per-source breakdown
 *
 * Output: datasets/nyasha_bilingual_clean_v1.jsonl
 */

const fs = require('fs');
const path = require('path');

// --- Config ---
const INPUT = path.resolve(__dirname, '..', 'datasets', 'nyasha_bilingual_v1.jsonl');
const OUTPUT = path.resolve(__dirname, '..', 'datasets', 'nyasha_bilingual_clean_v1.jsonl');
const MIN_RESPONSE_LENGTH = 30;
const MIN_TOPIC_PAIRS = 100;

const PLACEHOLDER_PATTERNS = [
  /Step 1: Read the question carefully/i,
  /Nhanho 1: Verenga mubvunzo zvakanaka/i,
  /Nhanho 1: Raverenga mubvunzo/i,
  /Below is a step-by-step solution/i,
];

const INCOMPLETE_PATTERNS = [
  // Gradient formula with no values
  /m = \s*\/\s*$/,
  /m = \s*$/,
  /Gradient = \s*$/,
  // Blank after '='
  /=\s*\/\s*$/,
  /= \s*$/,
  /:\s*m\s*$/,
  // Trig with Adjacent/Opposite/Hyp blank
  /Adjacent = $/,
  /Opposite = $/,
  /Hypotenuse = $/,
  // Blank mean calculation (Shona)
  /Avhareji = \s*\/\s* = $/,
  // Fraction addition result missing numerator: \"= /12\" or similar
  /\d+\/\d+ \+ \d+\/\d+ = \/\d+/,
  // Fraction simplification missing: \"/12 = \"
  /\/\d+ = $/,
  // Blank value assignment: \" = \" on its own line
  /^ = $/m,
  // General orphan '= ' at end of response
  /\n\s*=\s*$/,
];

const REQUIRED_FIELDS = ['instruction', 'response', 'topic', 'language'];

// ============================================================
//  UTILITY
// ============================================================

/** Normalize: lowercase, collapse whitespace, strip outer punctuation. */
function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[\n\r]+/g, ' ')
    .replace(/[.,;:!?(){}[\]"'«»“”]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard word-set similarity. */
function jaccardSimilarity(a, b) {
  const wa = a.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(w => w.length > 0);
  const wb = b.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(w => w.length > 0);
  const setA = new Set(wa), setB = new Set(wb);
  if (setA.size === 0 && setB.size === 0) return 1;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Check if a response is low quality. */
function isLowQuality(response) {
  if (!response) return true;
  const r = response.trim();
  if (r.length < MIN_RESPONSE_LENGTH) return true;
  for (const pat of PLACEHOLDER_PATTERNS) if (pat.test(r)) return true;
  for (const pat of INCOMPLETE_PATTERNS) if (pat.test(r)) return true;
  return false;
}

// ============================================================
//  MAIN
// ============================================================

function main() {
  // ---- 1. LOAD ----
  if (!fs.existsSync(INPUT)) {
    console.error(`[FATAL] Input not found: ${INPUT}`);
    process.exit(1);
  }

  const rawLines = fs.readFileSync(INPUT, 'utf8').trim().split('\n');
  const totalRaw = rawLines.length;
  let parseErrors = 0;

  const pairs = rawLines.map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) { parseErrors++; return null; }
  }).filter(p => p !== null);

  // ---- 2. FORMAT CHECK ----
  const formatRemoved = [];
  const formatKept = [];

  for (const p of pairs) {
    const missing = REQUIRED_FIELDS.filter(f => !p[f] || (typeof p[f] === 'string' && p[f].trim() === ''));
    if (missing.length > 0) {
      formatRemoved.push({ pair: p, reason: `missing: ${missing.join(', ')}` });
    } else {
      formatKept.push(p);
    }
  }

  // ---- 3. RESPONSE QUALITY CHECK ----
  const qualityRemoved = [];
  const qualityKept = [];
  const qShort = [], qPlaceholder = [], qIncomplete = [];

  for (const p of formatKept) {
    const r = (p.response || '').trim();
    const reasons = [];
    if (r.length < MIN_RESPONSE_LENGTH) { reasons.push(`short (${r.length})`); qShort.push(p); }
    for (const pat of PLACEHOLDER_PATTERNS) {
      if (pat.test(r)) { reasons.push('placeholder'); qPlaceholder.push(p); break; }
    }
    for (const pat of INCOMPLETE_PATTERNS) {
      if (pat.test(r)) { reasons.push('incomplete'); qIncomplete.push(p); break; }
    }
    if (reasons.length > 0) {
      qualityRemoved.push({ pair: p, reason: reasons.join('; ') });
    } else {
      qualityKept.push(p);
    }
  }

  // ---- 4. DEDUP (exact match on normalized instruction + response) ----
  const seen = new Map(); // normalized key → first pair
  const dedupRemoved = [];
  const dedupKept = [];

  for (const p of qualityKept) {
    const key = normalize(p.instruction) + '|||' + normalize(p.response);
    if (seen.has(key)) {
      dedupRemoved.push({
        pair: p,
        reason: `exact duplicate of index ${seen.get(key).idx}`,
      });
    } else {
      seen.set(key, { pair: p, idx: dedupKept.length });
      dedupKept.push(p);
    }
  }

  // ---- 5. NEAR-DUP ANALYSIS (informational only, sampled) ----
  // Sample up to 500 pairs and check Jaccard >= 0.90 within same topic
  let nearDups = [];
  const sampleSize = Math.min(500, dedupKept.length);
  const sample = dedupKept.slice(0, sampleSize);
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      if (sample[i].topic !== sample[j].topic) continue;
      const sim = jaccardSimilarity(sample[i].instruction, sample[j].instruction);
      if (sim >= 0.90) {
        nearDups.push({
          a: sample[i].instruction.slice(0, 60),
          b: sample[j].instruction.slice(0, 60),
          jaccard: sim,
        });
      }
    }
  }
  nearDups = nearDups.slice(0, 50);

  // ---- 6. EXPORT CLEAN DATASET ----
  const finalPairs = dedupKept;
  const outDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outStream = fs.createWriteStream(OUTPUT, 'utf8');
  for (const p of finalPairs) outStream.write(JSON.stringify(p) + '\n');
  outStream.end();

  // ---- 7. STATS REPORT ----
  const totalBefore = pairs.length;
  const totalAfterFormat = formatKept.length;
  const totalAfterQuality = qualityKept.length;
  const totalAfterDedup = finalPairs.length;

  // Topic breakdown
  const topicCounts = {}, topicAfter = {};
  for (const p of pairs) topicCounts[p.topic] = (topicCounts[p.topic] || 0) + 1;
  for (const p of finalPairs) topicAfter[p.topic] = (topicAfter[p.topic] || 0) + 1;

  // Language
  const langBefore = {}, langAfter = {};
  for (const p of pairs) langBefore[p.language] = (langBefore[p.language] || 0) + 1;
  for (const p of finalPairs) langAfter[p.language] = (langAfter[p.language] || 0) + 1;

  // Source
  const srcBefore = {}, srcAfter = {};
  for (const p of pairs) { const s = p.source || 'unknown'; srcBefore[s] = (srcBefore[s] || 0) + 1; }
  for (const p of finalPairs) { const s = p.source || 'unknown'; srcAfter[s] = (srcAfter[s] || 0) + 1; }

  // Type
  const typeBefore = {}, typeAfter = {};
  for (const p of pairs) { const t = p.type || 'unknown'; typeBefore[t] = (typeBefore[t] || 0) + 1; }
  for (const p of finalPairs) { const t = p.type || 'unknown'; typeAfter[t] = (typeAfter[t] || 0) + 1; }

  const topicNames = Object.keys(topicCounts).sort();
  const langKeys = [...new Set([...Object.keys(langBefore), ...Object.keys(langAfter)])].sort();
  const srcKeys = [...new Set([...Object.keys(srcBefore), ...Object.keys(srcAfter)])].sort();
  const typeKeys = [...new Set([...Object.keys(typeBefore), ...Object.keys(typeAfter)])].sort();

  // ===== PRINT REPORT =====
  console.log('');
  console.log('='.repeat(72));
  console.log('  NYASHA BILINGUAL DATASET — QUALITY FILTER REPORT');
  console.log('='.repeat(72));
  console.log('');
  console.log(`  Input:    ${INPUT}`);
  console.log(`  Output:   ${OUTPUT}`);
  console.log('');

  // Stage summary
  console.log('  Pipeline:');
  console.log(`    Raw lines               ${String(totalRaw).padStart(8)}`);
  console.log(`    ─ parse errors          ${String(parseErrors).padStart(8)}`);
  console.log(`    Before filter           ${String(totalBefore).padStart(8)}`);
  console.log(`    ─ format fail           ${String(formatRemoved.length).padStart(8)}`);
  console.log(`    ─ low-quality response  ${String(qualityRemoved.length).padStart(8)}`);
  console.log(`    ─ exact dedup           ${String(dedupRemoved.length).padStart(8)}`);
  console.log(`    After filter            ${String(totalAfterDedup).padStart(8)}`);
  console.log('');

  // Removal detail
  const totalRemoved = formatRemoved.length + qualityRemoved.length + dedupRemoved.length;
  console.log('  Removals:');
  console.log(`    Missing required fields          ${String(formatRemoved.length).padStart(8)}`);
  console.log(`    Response too short (<${MIN_RESPONSE_LENGTH}c)     ${String(qShort.length).padStart(8)}`);
  console.log(`    Placeholder response             ${String(qPlaceholder.length).padStart(8)}`);
  console.log(`    Incomplete math response         ${String(qIncomplete.length).padStart(8)}`);
  console.log(`    Exact duplicate (instr+resp)     ${String(dedupRemoved.length).padStart(8)}`);
  console.log(`    ─────────────────────────────────────────`);
  console.log(`    Total removed                    ${String(totalRemoved).padStart(8)}`);
  console.log('');

  // Topic table
  const colW = Math.max(...topicNames.map(t => t.length), 6);
  const sep = '─'.repeat(colW + 2);
  console.log(`  ┌${sep}┬${'─'.repeat(11)}┬${'─'.repeat(11)}┬${'─'.repeat(10)}┐`);
  console.log(`  │ ${'Topic'.padEnd(colW)} │ ${'Before'.padStart(9)} │ ${'After'.padStart(9)} │ ${'Drop'.padStart(8)} │`);
  console.log(`  ├${sep}┼${'─'.repeat(11)}┼${'─'.repeat(11)}┼${'─'.repeat(10)}┤`);
  let tB = 0, tA = 0;
  for (const t of topicNames) {
    const b = topicCounts[t], a = topicAfter[t] || 0;
    tB += b; tA += a;
    const flag = a < MIN_TOPIC_PAIRS ? '  ⚠️' : '    ';
    console.log(`  │ ${t.padEnd(colW)} │ ${String(b).padStart(9)} │ ${String(a).padStart(9)} │ ${String(b-a).padStart(8)}${flag} │`);
  }
  console.log(`  ├${sep}┼${'─'.repeat(11)}┼${'─'.repeat(11)}┼${'─'.repeat(10)}┤`);
  console.log(`  │ ${'TOTAL'.padEnd(colW)} │ ${String(tB).padStart(9)} │ ${String(tA).padStart(9)} │ ${String(tB-tA).padStart(8)} │`);
  console.log(`  └${sep}┴${'─'.repeat(11)}┴${'─'.repeat(11)}┴${'─'.repeat(10)}┘`);
  console.log('');

  // Language
  console.log('  Languages:');
  for (const l of langKeys) {
    console.log(`    ${l.padEnd(15)}  ${String(langBefore[l]||0).padStart(6)} → ${String(langAfter[l]||0).padStart(6)}`);
  }
  const gap = (langAfter['english']||0) - (langAfter['shona']||0);
  console.log(`    ${'EN–SN gap'.padEnd(15)}  ${String('').padStart(6)}   ${String(gap).padStart(6)}`);
  console.log('');

  // Source
  console.log('  By source:');
  for (const s of srcKeys) {
    console.log(`    ${s.padEnd(22)}  ${String(srcBefore[s]||0).padStart(6)} → ${String(srcAfter[s]||0).padStart(6)}`);
  }
  console.log('');

  // Type
  console.log('  By type:');
  for (const t of typeKeys) {
    console.log(`    ${t.padEnd(20)}  ${String(typeBefore[t]||0).padStart(6)} → ${String(typeAfter[t]||0).padStart(6)}`);
  }
  console.log('');

  // Near-dup info
  console.log(`  Near-dup flags (Jaccard >= 0.90 within topic, sampled): ${nearDups.length} pairs`);
  if (nearDups.length > 0) {
    const examples = nearDups.slice(0, 3);
    for (const ex of examples) {
      console.log(`    e.g. [${ex.a.length > 55 ? ex.a.slice(0, 55) + '…' : ex.a}]`);
      console.log(`         [${ex.b.length > 55 ? ex.b.slice(0, 55) + '…' : ex.b}]  (Jaccard=${ex.jaccard.toFixed(3)})`);
    }
  }
  console.log('');

  // WARNINGS
  let wCount = 0;

  const lowTopics = topicNames.filter(t => (topicAfter[t] || 0) < MIN_TOPIC_PAIRS);
  if (lowTopics.length > 0) {
    wCount++;
    console.log(`  ⚠️  LOW COVERAGE — ${lowTopics.length} topic(s) below ${MIN_TOPIC_PAIRS} pairs:`);
    for (const t of lowTopics) {
      console.log(`       • "${t}" — ${topicAfter[t] || 0} pairs remaining`);
    }
    console.log('');
  }

  if (Math.abs(gap) > 500) {
    wCount++;
    const deficit = gap > 0 ? 'Shona' : 'English';
    console.log(`  ⚠️  LANGUAGE IMBALANCE — EN–SN gap = ${gap > 0 ? '+' : ''}${gap} (English-heavy).`);
    console.log(`       Generate more ${deficit} pairs to balance.`);
    console.log('');
  }

  if (wCount === 0) console.log('  ✅ All quality checks passed.');
  console.log('');
  console.log(`  ✅ Done. ${finalPairs.length} pairs saved to clean dataset.`);
  console.log('');
}

main();

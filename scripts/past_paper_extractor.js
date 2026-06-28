#!/usr/bin/env node
/**
 * past_paper_extractor.js — Nyasha Dataset Tier 3
 *
 * Attempts to scrape ZIMSEC O-Level Maths past papers from online sources.
 * Falls back to high-quality synthetic generation from the syllabus.
 *
 * Output: projects/nyasha/datasets/nyasha_pastpapers_v1.jsonl
 *
 * Format: { instruction, input, response, topic, subtopic, language, type }
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const g1 = require('./generators');
const g2 = require('./generators-part2');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'datasets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'nyasha_pastpapers_v1.jsonl');
const TOTAL_TARGET = 250;

// ─── Online scraper (attempt real papers) ─────────────────────────────────────

const SOURCE_URLS = [
  'https://www5.zimsec.co.zw/download-category/o-level/',
  'https://sytbay.co.zw/article/download-category/zimsec-o-level-mathematics-past-papers/',
  'https://dadaya.co.zw/o-level-mathematics/',
  'https://zimsake.co.zw/notes/index.php/zimsec-past-exam-papers',
  'https://zambuko.vercel.app/zimsec/query?type=Question%20Paper&subject=mathematics',
  'https://zimsecpapers.github.io/papers/index.html',
];

function fetchUrl(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString('utf8'); });
      res.on('end', () => { resolve({ status: res.statusCode, data }); });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function tryOnlineScrape() {
  console.log('[Extractor] Attempting online scrape from ZIMSEC past paper sites...');
  let totalFromWeb = 0;
  const allQuestions = [];

  for (const url of SOURCE_URLS) {
    try {
      const result = await fetchUrl(url);
      if (!result || result.status !== 200) continue;
      console.log(`  [OK] ${url} (HTTP ${result.status})`);

      // Basic pattern: try to find lines with exam-like question text
      const lines = result.data.split('\n');
      let foundQuestion = false;

      // Look for common question patterns in the HTML
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/<[^>]+>/g, '').trim();
        if (!line || line.length < 10) continue;

        // Detect exam question patterns
        const mathPatterns = [
          /(\d+)\s*(×|\*|x|[-+])\s*(\d+)/i,
          /(simplify|evaluate|solve|factorise|calculate|find|express|expand)/i,
          /(area|volume|perimeter|circumference|angle|gradient)/i,
          /(x²|x\^2|√|π|sin|cos|tan)/i,
          /(probability|mean|median|mode)/i,
        ];

        const matches = mathPatterns.filter(p => p.test(line));
        if (matches.length >= 2) {
          allQuestions.push({
            instruction: line.substring(0, 200),
            input: '',
            response: '',  // Web scrape can't reliably extract answers
            topic: classifyTopic(line),
            subtopic: '',
            language: 'en',
            type: 'exam_question',
            source: url,
          });
          totalFromWeb++;
          foundQuestion = true;
          if (totalFromWeb >= 100) break; // Cap web results
        }
      }
      if (foundQuestion) {
        console.log(`    Extracted ${totalFromWeb} question fragments so far`);
      } else {
        console.log(`    No question text found on this page`);
      }
    } catch (e) {
      // Skip failed fetches
    }
  }

  return allQuestions;
}

function classifyTopic(text) {
  const t = text.toLowerCase();
  if (/(standard form|significant|decimal place|fraction|hcf|lcm|percentage|ratio|speed.*distance)/.test(t)) return 'Numbers';
  if (/(expand|factorise|equation|simplif|algebra|quadratic|simultaneous|indices)/.test(t)) return 'Algebra';
  if (/(triangle|angle|polygon|parallel|circle theorem|pythagoras|congruence)/.test(t)) return 'Geometry';
  if (/(area|volume|perimeter|circumference|cylinder|cuboid|sector|arc)/.test(t)) return 'Mensuration';
  if (/(sin|cos|tan|trig|bearing|elevation|depression)/.test(t)) return 'Trigonometry';
  if (/(venn|union|intersection|subset|set)/.test(t)) return 'Sets';
  if (/(probability|chance|likely|random|die|dice)/.test(t)) return 'Probability';
  if (/(mean|median|mode|range|bar chart|frequency|average)/.test(t)) return 'Statistics';
  if (/(matrix|determinant|inverse)/.test(t)) return 'Matrices';
  if (/(translat|reflect|rotate|enlarg|transform)/.test(t)) return 'Transformations';
  if (/(vector|magnitude|column)/.test(t)) return 'Vectors';
  if (/(function|domain|range|f\(x\)|notation)/.test(t)) return 'Relations & Functions';
  if (/(graph|gradient|intercept|plot|sketch|curve)/.test(t)) return 'Graphs';
  if (/(proportion|direct|inverse|share)/.test(t)) return 'Ratio & Proportion';
  if (/(price|cost|discount|vat|interest|profit|loss|exchange)/.test(t)) return 'Consumer Arithmetic';
  return 'Mixed';
}

// ─── Synthetic generation ─────────────────────────────────────────────────────

function generateSynthetic(target) {
  console.log(`\n[Extractor] Generating ${target} synthetic ZIMSEC O-Level questions...`);

  // Distribute evenly across 15 topics, slightly weighted toward heavier topics
  const distribution = [
    { name: 'Numbers', count: 20, gen: g1.genNumbers },
    { name: 'Algebra', count: 25, gen: g1.genAlgebra },
    { name: 'Geometry', count: 20, gen: g1.genGeometry },
    { name: 'Mensuration', count: 18, gen: g1.genMensuration },
    { name: 'Trigonometry', count: 18, gen: g1.genTrigonometry },
    { name: 'Sets', count: 14, gen: g1.genSets },
    { name: 'Probability', count: 16, gen: g1.genProbability },
    { name: 'Statistics', count: 16, gen: g2.genStatistics },
    { name: 'Matrices', count: 14, gen: g2.genMatrices },
    { name: 'Transformations', count: 14, gen: g2.genTransformations },
    { name: 'Vectors', count: 14, gen: g2.genVectors },
    { name: 'Relations & Functions', count: 14, gen: g2.genFunctions },
    { name: 'Graphs', count: 14, gen: g2.genGraphs },
    { name: 'Ratio & Proportion', count: 14, gen: g2.genRatio },
    { name: 'Consumer Arithmetic', count: 19, gen: g2.genConsumer },
  ];

  // Scale to match target
  const total = distribution.reduce((s, d) => s + d.count, 0);
  const scale = target / total;

  let generated = [];
  for (const d of distribution) {
    const n = Math.max(5, Math.round(d.count * scale));
    const qs = d.gen(n);
    generated = generated.concat(qs);
    console.log(`  ${d.name}: ${qs.length} questions generated`);
  }

  // Shuffle for variety
  for (let i = generated.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [generated[i], generated[j]] = [generated[j], generated[i]];
  }

  return generated;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Nyasha Dataset — ZIMSEC O-Level Maths Past Paper Extractor');
  console.log('═══════════════════════════════════════════════════════\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Phase 1: Try online sources
  const webQuestions = await tryOnlineScrape();
  console.log(`\n[Extractor] Online extraction: ${webQuestions.length} question fragments`);

  let allQuestions = [...webQuestions];
  let onlineSource = webQuestions.length > 10;

  // Phase 2: Supplement with synthetic generation
  const syntheticNeeded = Math.max(TOTAL_TARGET - allQuestions.length, TOTAL_TARGET);
  const syntheticQuestions = generateSynthetic(syntheticNeeded);
  allQuestions = webQuestions.length > 0
    ? [...webQuestions, ...syntheticQuestions]
    : syntheticQuestions;

  // Phase 3: Deduplicate and trim to target
  const seen = new Set();
  const unique = [];
  for (const q of allQuestions) {
    const key = q.instruction.substring(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(q);
    }
  }

  // Use the target count
  const finalQuestions = unique.slice(0, TOTAL_TARGET);

  // Write output
  let writtenCount = 0;
  const stream = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });
  for (const q of finalQuestions) {
    stream.write(JSON.stringify(q) + '\n');
    writtenCount++;
  }
  stream.end();

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  ✓ ${writtenCount} questions written to:`);
  console.log(`    ${OUTPUT_FILE}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  // Topic breakdown
  const breakdown = {};
  for (const q of finalQuestions) {
    breakdown[q.topic] = (breakdown[q.topic] || 0) + 1;
  }
  console.log('📊 Topic Breakdown:');
  const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  for (const [topic, cnt] of sorted) {
    const pct = ((cnt / writtenCount) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(cnt / 2));
    console.log(`  ${topic.padEnd(25)} ${cnt.toString().padStart(3)} (${pct}%) ${bar}`);
  }

  // Sample questions
  console.log(`\n📝 Sample Questions (3 of ${writtenCount}):`);
  const sampleIdxs = [0, Math.floor(writtenCount / 2), writtenCount - 1];
  for (const idx of sampleIdxs) {
    const q = finalQuestions[idx];
    console.log(`\n  [${idx + 1}] ${q.topic} | ${q.subtopic || 'General'}`);
    console.log(`      Q: ${q.instruction}`);
    console.log(`      A: ${q.response}`);
  }

  console.log(`\n✅ Extraction complete. Online source used: ${onlineSource}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

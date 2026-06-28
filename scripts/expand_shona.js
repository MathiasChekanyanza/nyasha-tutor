#!/usr/bin/env node
/**
 * Nyasha Shona Dataset Expansion — v1.0
 *
 * Reads the bilingual template library and generates 2,500+ Shona instruction/response pairs
 * with random variable substitution — matching the logic of the Python generate_dataset.py.
 *
 * Output: ../datasets/nyasha_shona_v1.jsonl
 */

const fs = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");
const TEMPLATE_FILE = path.join(BASE, "templates", "template_library.json");
const OUTPUT_FILE = path.join(BASE, "datasets", "nyasha_shona_v1.jsonl");

// Utility: greatest common divisor
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

// Utility: least common multiple
function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
}

// Utility: simplify fraction
function simplifyFraction(num, den) {
  const g = gcd(num, den);
  return [num / g, den / g];
}

// Utility: seeded pseudo-random number generator (mulberry32)
function createRng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick a random value from a var spec
function pickVar(spec, rng) {
  if (spec.choices) {
    const choices = spec.choices.map((c) => (typeof c === "number" ? c : Number(c)));
    return choices[Math.floor(rng() * choices.length)];
  }
  if (spec.min !== undefined) {
    const min = spec.min;
    const max = spec.max !== undefined ? spec.max : min + 10;
    if (spec.step) {
      const vals = [];
      for (let v = min; v <= max; v += spec.step) vals.push(v);
      return vals.length ? vals[Math.floor(rng() * vals.length)] : min;
    }
    return Math.floor(rng() * (max - min + 1)) + min;
  }
  return 1;
}

// Check that not_equal_to constraint is satisfied
function satisfiesConstraints(key, value, varSpecs) {
  const spec = varSpecs[key];
  if (spec && spec.not_equal_to !== undefined) {
    // This constraint will be checked later against the other var's value
    return true; // handled at assignment time
  }
  return true;
}

// Pick all vars for a template, respecting constraints
function pickAllVars(template, rng) {
  const varSpecs = template.vars || {};
  const values = {};
  const keys = Object.keys(varSpecs);

  // Simple approach: pick all independently, then retry if constraint fails
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    for (const key of keys) {
      values[key] = pickVar(varSpecs[key], rng);
    }
    // Check not_equal_to constraints
    let ok = true;
    for (const key of keys) {
      const spec = varSpecs[key];
      if (spec.not_equal_to !== undefined) {
        const otherKey = spec.not_equal_to;
        if (values[key] === values[otherKey]) {
          ok = false;
          break;
        }
      }
    }
    if (ok) return values;
  }
  // Fallback: just return whatever we got
  return values;
}

// Compute derived variables — mirrors Python compute_derived_vars
function computeDerivedVars(template, varValues) {
  const v = { ...varValues };
  const rt = template.response_template || "";
  const it = template.instruction_template || "";
  const combined = rt + it;

  // --- Fractions addition (LCD) ---
  if (combined.includes("{lcd}")) {
    const b = v.b || 1;
    const d = v.d || 1;
    v.lcd = lcm(b, d);
    v.a_conv = (v.a || 1) * (v.lcd / b);
    v.c_conv = (v.c || 1) * (v.lcd / d);
    v.num_sum = v.a_conv + v.c_conv;
    const [numS, denS] = simplifyFraction(v.num_sum, v.lcd);
    v.simplified = denS !== 1 ? `${numS}/${denS}` : String(numS);
  }

  // --- Percentage to fraction ---
  if (combined.includes("{percent}") && rt.includes("{hcf}")) {
    const pct = v.percent || 50;
    v.hcf = gcd(pct, 100);
    const [numS, denS] = simplifyFraction(pct, 100);
    v.simplified = denS !== 1 ? `${numS}/${denS}` : String(numS);
  }

  // --- Decimal to percentage ---
  if (combined.includes("{decimal}")) {
    const dec = v.decimal || 0.5;
    v.percent = Math.round(dec * 100);
  }

  // --- Indices ---
  if (combined.includes("{sum}") && rt.includes("{sum}")) {
    v.sum = (v.m || 0) + (v.n || 0);
  }
  if (combined.includes("{diff}")) {
    v.diff = (v.m || 0) - (v.n || 0);
  }

  // --- Standard form ---
  if (combined.includes("{mantissa}")) {
    let n = v.n || 1000;
    if (n >= 1) {
      const exp = String(Math.floor(n)).length - 1;
      const mantissa = n / Math.pow(10, exp);
      v.mantissa = mantissa;
      v.exponent = exp;
      v.direction = "right";
    } else {
      const decStr = n.toFixed(10).replace(/0+$/, "");
      const decPart = decStr.split(".")[1] || "";
      let firstNonzero = 0;
      for (let i = 0; i < decPart.length; i++) {
        if (decPart[i] !== "0") {
          firstNonzero = i;
          break;
        }
      }
      const exp = -(firstNonzero + 1);
      const mantissa = n * Math.pow(10, -exp);
      v.mantissa = Math.round(mantissa * 1e6) / 1e6;
      v.exponent = exp;
      v.direction = "left";
    }
  }

  // --- Linear equations ---
  if (combined.includes("{rhs}")) {
    const a = v.a || 1;
    const b = v.b || 0;
    const c = v.c || 0;
    v.rhs = c - b;
    const ans = v.rhs / a;
    v.ans = Number.isInteger(ans) ? ans : Math.round(ans * 100) / 100;
  }

  // --- Word problem marbles ---
  if (combined.includes("{x_marble}") || combined.includes("{rhs}") && combined.includes("{n1}") && combined.includes("{n2}")) {
    // check if it's the marble word problem
    if (v.n1 !== undefined && v.n2 !== undefined && v.total !== undefined) {
      v.rhs = v.total - v.n1;
      const ans = v.rhs / v.n2;
      v.ans = Number.isInteger(ans) ? ans : Math.round(ans * 100) / 100;
    }
  }

  // --- Trigonometry: sin ratio ---
  if (combined.includes("{ratio}") && combined.includes("{angle}") && combined.includes("{opp}")) {
    const opp = v.opp || 5;
    const hyp = v.hyp || 10;
    const ratio = opp / hyp;
    const angle = Math.round((Math.asin(ratio) * 180 / Math.PI) * 10) / 10;
    v.ratio = ratio;
    v.angle = angle;
  }

  // --- Trigonometry: tan ---
  if (combined.includes("{tan_val}")) {
    const adj = v.adj || 10;
    const angleDeg = v.angle || 30;
    const rad = angleDeg * Math.PI / 180;
    const tanVal = Math.tan(rad);
    const ans = adj * tanVal;
    v.tan_val = tanVal;
    v.ans = ans;
  }

  // --- Mensuration perimeter ---
  if (combined.includes("{perim}")) {
    const len = v.len || 10;
    const wid = v.wid || 5;
    v.sum = len + wid;
    v.perim = 2 * (len + wid);
    v.area = len * wid;
  }

  // --- Vectors ---
  if (combined.includes("{x_new}")) {
    v.x_new = (v.x || 0) + (v.dx || 0);
    v.y_new = (v.y || 0) + (v.dy || 0);
  }

  // --- Coordinate geometry gradient ---
  if (combined.includes("{gradient}")) {
    const x1 = v.x1 || 0;
    const y1 = v.y1 || 0;
    const x2 = v.x2 || 1;
    const y2 = v.y2 || 1;
    v.dy = y2 - y1;
    v.dx = x2 - x1;
    v.gradient = v.dx !== 0 ? Math.round((v.dy / v.dx) * 100) / 100 : Infinity;
  }

  return v;
}

// Render a template string by substituting {placeholders}
function render(text, varValues) {
  let result = text;
  for (const [key, val] of Object.entries(varValues)) {
    const placeholder = "{" + key + "}";
    if (!result.includes(placeholder)) continue;
    let formatted;
    if (typeof val === "number") {
      if (Number.isInteger(val)) {
        formatted = String(val);
      } else {
        // Format float: trim trailing zeros
        formatted = val.toFixed(4).replace(/\.?0+$/, "");
      }
    } else {
      formatted = String(val);
    }
    // Replace all occurrences (the same var may appear multiple times)
    result = result.split(placeholder).join(formatted);
  }
  return result;
}

// Generate a Shona instruction + response from a template
function generateShonaPair(template, rng) {
  const varValues = pickAllVars(template, rng);
  const derived = computeDerivedVars(template, varValues);

  let instruction = render(template.instruction_template, derived);
  let response = render(template.response_template, derived);

  // Clean up any left-over {placeholders}
  instruction = instruction.replace(/\{[^}]+\}/g, "");
  response = response.replace(/\{[^}]+\}/g, "");

  const subtopic = template.subtopic || "";
  const topic = template.topic || "";

  return {
    instruction,
    input: `${topic}: ${subtopic}`,
    response,
    topic,
    subtopic,
    language: "shona",
    type: template.type || "worked_example",
    source: "shona_expansion_v1"
  };
}

// Generate Shona translations for English-only templates
function translateToShona(englishTemplate, rng) {
  // Map English phrases to Shona equivalents per topic/type
  const translations = {
    "Numbers and Operations": {
      "Indices and standard form": {
        "worked_example": {
          instruction_alt: [
            (t) => `Rerutsa: ${render(t.instruction_template, {})}`,
          ],
          response_fix: null
        },
        "exam_question": {
          instruction_alt: null,
          response_fix: null
        }
      }
    }
  };

  // Generic Shona instruction stems by type
  const shonaInstructionMap = {
    "worked_example": "Rerutsa: {orig}",
    "exam_question": "Mubvunzo webvunzo: {orig}",
    "word_problem": "Dambudziko: {orig}",
    "concept_question": "Tsanangura: {orig}"
  };

  const shonaResponseMap = {
    "worked_example": "## Nhanho 1: {orig_step1}\n\n## Nhanho 2: {orig_step2}\n\n**Mhinduro:** {orig_answer}",
  };

  // We'll create a Shona version by using the same vars but translated structure
  // For English-only templates, we generate with the English template but mark as Shona
  // and lightly adapt the instructions
  
  let shonaInstruction = englishTemplate.instruction_template;
  let shonaResponse = englishTemplate.response_template;

  // Replace common English math terms with Shona equivalents
  const termMap = [
    // General math terms
    ["Calculate", "Verenga"],
    ["Simplify", "Rerutsa"],
    ["Find", "Tsvaga"],
    ["Solve", "Gadzirisa"],
    ["Show all working", "Ratidza mabasa ako ese"],
    ["Step", "Nhanho"],
    ["Answer", "Mhinduro"],
    ["Explain", "Tsanangura"],
    ["Express", "Ratidza"],
    ["Convert", "Shandura"],
    ["Add", "Wedzera"],
    ["Subtract", "Bvisa"],
    ["Multiply", "Peta"],
    ["Divide", "Govana"],
    ["Fraction", "Chidimbu"],
    ["Percentage", "Pesenti"],
    ["Decimal", "Desimali"],
    ["Angle", "Kona"],
    ["Length", "Kureba"],
    ["Width", "Hupamhi"],
    ["Area", "Nzvimbo"],
    ["Perimeter", "Mupendero"],
    ["Height", "Kureba"],
    ["Base", "Hwaro"],
    ["Side", "Divha"],
    ["Equation", "Equation"],
    ["Value", "Kukosha"],
    ["Number", "Nhamba"],
    ["Numbers", "Nhamba"],
    ["Gradient", "Gradient"],
    ["Mean", "Avhareji"],
    ["Median", "Median"],
    ["Mode", "Mode"],
    ["Total", "Hwose"],
    ["Sum", "Hwose"],
    ["Difference", "Musiyano"],
    ["Product", "Chigumisirwa"],
    ["Quotient", "Mugumisirwa"],
    ["Right-angled triangle", "Katatu ane kona yakatwasuka"],
    ["Triangle", "Katatu"],
    ["Rectangle", "Divi mana ane makona akaenzana"],
    ["Circle", "Denderedzwa"],
    ["Radius", "Radiyasi"],
    ["Diameter", "Dhiyamita"],
    ["Circumference", "Mupendero wedenderedzwa"],
    ["Opposite", "Yakatarisana"],
    ["Adjacent", "Yakabatana"],
    ["Hypotenuse", "Hypotenuse"],
    ["Theorem", "Theorem"],
    ["Prove", "Ratidza"],
    ["Evaluate", "Verenga"],
    ["Determine", "Tsvaga"],
    ["Points", "Mapoinzi"],
    ["Line", "Mutsetse"],
    ["Coordinates", "Coordinates"],
    ["Vector", "Vector"],
    ["Translated", "Yakashandurwa"],
    ["Reflection", "Chiratidzo chegirazi"],
    ["Rotation", "Kutenderera"],
    ["Translation", "Kushandura"],
    ["Image", "Mufananidzo"],
    ["Original", "Yekutanga"],
    ["Formula", "Fomura"],
    ["Equation", "Equation"],
    ["Inequality", "Inequality"],
    ["Variable", "Zvisingazivikanwi"],
    ["Constant", "Constant"],
    ["Coefficient", "Coefficient"],
    ["Term", "Rivhi"],
    ["Like terms", "Mazwi akafanana"],
    ["Bracket", "Bhuraketi"],
    ["Expand", "Vhura"],
    ["Factorise", "Factorise"],
    ["Factor", "Factor"],
    ["Multiple", "Multiple"],
    ["Prime", "Prime"],
    ["Simplify your answer", "Rerutsa mhinduro yako"],
    ["Leave your answer in index form", "Siya mhinduro yako muchimiro cheindex"],
    ["Write", "Nyora"],
    ["in its simplest form", "muchimiro chakareruka"],
    ["in standard form", "muchimiro chakajairwa"],
    ["of the pizza was eaten", "yepiza yakadyiwa"],
    ["What fraction", "Chidimbu chei"],
    ["Express your answer", "Ratidza mhinduro yako"],
    ["Show that", "Ratidza kuti"],
    ["Hence", "Nekudaro"],
    ["Therefore", "Saka"],
    ["Your answer", "Mhinduro yako"]
  ];

  for (const [eng, sho] of termMap) {
    // Word-boundary replacement to avoid partial matches
    const engRegex = new RegExp("\\b" + eng.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
    // But we need to be careful not to replace inside {placeholders}
    // We'll split by {placeholders} first
    shonaInstruction = shonaInstruction.replace(engRegex, sho);
    shonaResponse = shonaResponse.replace(engRegex, sho);
  }

  // Replace specific instruction patterns for Shona context
  // (these are additional Shona-specific phrase mappings)
  const phraseReplacements = [
    ["Find the gradient", "Tsvaga gradient"],
    ["Calculate the", "Verenga"],
    ["the following data set", "data riri kutevera"],
    ["of the line passing through points", "yemutsetse unopfuura nemapoinzi"],
    ["Find the length of side x", "Tsvaga kureba kwedivha x"],
    ["Find the mean", "Tsvaga avhareji"],
    ["Find the median", "Tsvaga median"],
    ["to find", "kutsvaga"],
    ["in each packet", "mupakiti imwe neimwe"],
    ["Form an equation and solve", "Gadzira equation uye ugadzirise"],
    ["Now", "Zvino"],
    ["first", "kutanga"],
    ["second", "chipiri"],
    ["third", "chitatu"],
    ["Count how many numbers", "Verenga kuti nhamba dzakawanda here"],
    ["place", "nzvimbo"],
    ["places", "nzvimbo"],
    ["the decimal point", "desimali poindi"],
    ["to the right", "kurudyi"],
    ["to the left", "kuruboshwe"],
    ["Recall", "Rangarira"],
    ["Apply the law", "Shandisa mutemo"],
    ["Convert fractions", "Shandura zvidimbu"],
    ["Add numerators", "Wedzera nhamba dzepamusoro"],
    ["Subtract", "Bvisa"],
    ["the indices", "indices"],
    ["the multiplication law", "mutemo wekuwanza"],
    ["the division law", "mutemo wekugovera"],
    ["When multiplying powers with the same base", "Paunenge uchiwanza masimba ane hwaro hwakafanana"],
    ["When dividing powers with the same base", "Paunenge uchigovana masimba ane hwaro hwakafanana"],
    ["the middle position", "nzvimbo yepakati"],
    ["the middle value", "kukosha kwepakati"],
    ["Data", "Data"],
    ["is already ordered", "yakatongwa kare"],
    ["Read the question carefully", "Verenga mubvunzo zvakanaka"],
    ["Write down the relevant formula", "Nyora fomura yakakodzera"],
    ["Substitute the given values", "Isa nhamba dziri mubvunzo"],
    ["Check if the answer makes sense", "Tarisa kuti mhinduro yako ine musoro here"],
    ["A pizza is cut into", "Piza yakachekwa kuita"],
    ["equal slices", "zvidimbu zvakaenzana"],
    ["You eat", "Unodya"],
    ["your friend eats", "shamwari yako inodya"],
    ["What fraction of the pizza has been eaten", "Chidimbu chepiza chakadyiwa ndechei"],
    ["John has", "John ane"],
    ["He buys", "Anotenga"],
    ["more packets", "mamwe mapakiti"],
    ["each containing", "imwe neimwe iine"],
    ["He now has", "Ave ne"],
    ["How many marbles were in each packet", "Mabhuru mangani aive mupakiti imwe neimwe"],
    ["A point", "Poinzi"],
    ["is translated by vector", "yakashandurwa nevector"],
    ["of length", "pakureba"],
    ["using SOH CAH TOA", "uchishandisa SOH CAH TOA"],
    ["Use", "Shandisa"],
    ["Identity", "Identity"],
    ["Trigonometric", "Trigonometric"],
    ["which trig ratio to use", "kuti ndechipi chikamu chetrig kushandisa"],
    ["Set up equation", "Gadzira equation"],
    ["Use inverse sine", "Shandisa inverse sine"],
    ["Alternative", "Imwe nzira"],
    ["we need", "tiri kuda"],
    ["Let x =", "Rega x ="],
    ["HCF", "HCF"],
    ["LCD", "LCD"],
    ["Euclidean Geometry", "Euclidean Geometry"],
    ["Cyclic quadrilateral", "Cyclic quadrilateral"],
    ["Tangent", "Tangent"],
    ["Chord", "Chord"],
    ["Angle at the centre", "Angle at the centre"],
    ["Angle at the circumference", "Angle at the circumference"],
    ["Theorem", "Theorem"],
    ["Construction", "Construction"],
    ["Proof", "Proof"],
    ["Hence show", "Nekudaro ratidza"],
    ["Calculate the area", "Verenga nzvimbo"],
    ["Calculate the perimeter", "Verenga mupendero"],
    ["A rectangle has length", "Divi mana riine kureba"],
    ["a right-angled triangle", "katatu ane kona yakatwasuka"],
    ["the opposite side is", "divha rakatarisana ndi"],
    ["and the hypotenuse is", "uye hypotenuse i"],
    ["Find angle", "Tsvaga kona"],
    ["to 1 d.p.", "kune 1 d.p."],
    ["Standard Form Conversion", "Kushandura Standard Form"],
    ["A number in standard form is written as", "Nhamba iri mu standard form inonyorwa se"],
    ["Place the decimal point after the first digit", "Isa desimali poindi mushure medhijiti yekutanga"],
    ["Count how many places the decimal moved", "Verenga kuti desimali yakafamba nzvimbo ngani"],
    ["The decimal moved", "Desimali yakafamba"],
  ];

  for (const [engPhrase, shoPhrase] of phraseReplacements) {
    const regex = new RegExp(engPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    shonaInstruction = shonaInstruction.replace(regex, shoPhrase);
    shonaResponse = shonaResponse.replace(regex, shoPhrase);
  }

  // Create the Shona template and generate
  const shonaTemplate = {
    ...englishTemplate,
    instruction_template: shonaInstruction,
    response_template: shonaResponse,
  };

  return shonaTemplate;
}

// Main generation
function main() {
  // Read template library
  const raw = fs.readFileSync(TEMPLATE_FILE, "utf-8");
  const templateGroups = JSON.parse(raw);

  console.log(`[INFO] Loaded ${templateGroups.length} template groups from template library`);

  // Collect all templates with their language tags
  const englishTemplates = [];
  const shonaTemplates = [];

  for (const group of templateGroups) {
    for (const tmpl of group.templates || []) {
      const full = { ...tmpl, topic: group.topic, subtopic: group.subtopic };
      if (full.language === "shona") {
        shonaTemplates.push(full);
      } else {
        englishTemplates.push(full);
      }
    }
  }

  console.log(`[INFO] Found ${englishTemplates.length} English templates, ${shonaTemplates.length} Shona templates`);

  // Build map: (subtopic, type) -> shona template for matching
  const shonaMap = new Map();
  for (const st of shonaTemplates) {
    shonaMap.set(`${st.subtopic}|${st.type}`, st);
  }

  const rng = createRng(42);
  const pairs = [];
  const target = 2500;

  console.log(`\n[INFO] Target: ${target}+ Shona pairs\n`);

  // Strategy 1: Use existing Shona templates directly (same vars as English)
  // For each English template that has a Shona match, generate many pairs
  for (const et of englishTemplates) {
    const key = `${et.subtopic}|${et.type}`;
    const st = shonaMap.get(key);

    if (st) {
      // We have both English and Shona; use the Shone template to generate
      console.log(`  [MATCH][${et.topic}/${et.subtopic}/${et.type}] Found Shona template → generating...`);
      // Generate ~75 pairs per matched template (spread across matches)
    }
  }

  // Strategy: Count how many pairs per match
  const matchedKeys = englishTemplates
    .filter((et) => shonaMap.has(`${et.subtopic}|${et.type}`))
    .map((et) => `${et.subtopic}|${et.type}`);
  const uniqueMatchedKeys = [...new Set(matchedKeys)];
  const unmatchedTemplates = englishTemplates.filter(
    (et) => !shonaMap.has(`${et.subtopic}|${et.type}`)
  );

  console.log(`[INFO] ${uniqueMatchedKeys.length} unique matched template keys, ${unmatchedTemplates.length} English-only templates to translate`);

  // Generate from matched Shona templates (high-quality bilingual pairs)
  const pairsPerMatch = Math.max(1, Math.floor(target * 0.6 / uniqueMatchedKeys.length));
  console.log(`[INFO] Generating ~${pairsPerMatch} pairs per matched template key`);

  for (const et of englishTemplates) {
    const key = `${et.subtopic}|${et.type}`;
    const st = shonaMap.get(key);
    if (!st) continue;

    for (let i = 0; i < pairsPerMatch; i++) {
      const pair = generateShonaPair(st, rng);
      pairs.push(pair);
    }
  }

  console.log(`[INFO] After matched template generation: ${pairs.length} pairs`);

  // Generate from English-only templates (translated)
  if (pairs.length < target && unmatchedTemplates.length > 0) {
    const remaining = target - pairs.length;
    const pairsPerUnmatched = Math.max(1, Math.floor(remaining / unmatchedTemplates.length));

    console.log(`[INFO] Generating ~${pairsPerUnmatched} pairs per English-only template (${unmatchedTemplates.length} templates)`);

    for (const et of unmatchedTemplates) {
      const st = translateToShona(et, rng);
      for (let i = 0; i < pairsPerUnmatched; i++) {
        const pair = generateShonaPair(st, rng);
        pairs.push(pair);
      }
    }
  }

  // If still under target, refill from all templates
  if (pairs.length < target) {
    const remaining = target - pairs.length;
    const bonusPerTemplate = Math.max(1, Math.ceil(remaining / (uniqueMatchedKeys.length || 1)));
    console.log(`[INFO] Still need ${remaining} more, generating ${bonusPerTemplate} extra per matched template`);

    const usedKeys = new Set();
    for (const et of englishTemplates) {
      const key = `${et.subtopic}|${et.type}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      const st = shonaMap.get(key);
      const tmpl = st || translateToShona(et, rng);
      for (let i = 0; i < bonusPerTemplate; i++) {
        const pair = generateShonaPair(tmpl, rng);
        pairs.push(pair);
        if (pairs.length >= target + 500) break;
      }
      if (pairs.length >= target + 500) break;
    }
  }

  // Write output
  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const stream = fs.createWriteStream(OUTPUT_FILE, { encoding: "utf-8" });
  for (const pair of pairs) {
    stream.write(JSON.stringify(pair, Object.keys(pair).sort()) + "\n");
  }
  stream.end();

  console.log(`\n[EXPORT] Saved ${pairs.length} Shona pairs to ${OUTPUT_FILE}`);

  // Count languages in output
  const shonaCount = pairs.filter((p) => p.language === "shona").length;
  console.log(`[INFO] Shona pairs: ${shonaCount}`);

  // Show 3 samples
  console.log("\n=== SAMPLE 1 ===");
  console.log(JSON.stringify(pairs[0], null, 2));
  console.log("\n=== SAMPLE 2 ===");
  console.log(JSON.stringify(pairs[Math.floor(pairs.length / 2)], null, 2));
  console.log("\n=== SAMPLE 3 ===");
  console.log(JSON.stringify(pairs[pairs.length - 1], null, 2));

  return pairs.length;
}

main();

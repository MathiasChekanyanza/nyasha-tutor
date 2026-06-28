# Nyasha Instruction Dataset Expansion Plan

## Current State
- **Seed:** ~140 instruction pairs (7 topics × 7 subtopics × 4 template combos × bilingual)
- **Format:** JSONL with `{instruction, input, response, topic, subtopic, language, type}`
- **Critical Problem:** Template responses are generic "Step 1-5" placeholders — no actual math solutions
- **Target:** 5,000+ high-quality pairs with real worked solutions

## Topic Taxonomy (7 major topics, 49 subtopics)

| # | Topic | Subtopics | Pairs Needed |
|---|-------|-----------|-------------|
| 1 | Numbers and Operations | Place value, Factors/multiples, Fractions/decimals/%, Ratios, Indices, Sets, Sequences | ~700 |
| 2 | Algebra | Expressions, Linear equations, Simultaneous, Quadratics, Algebraic fractions, Functions/graphs, Variation | ~700 |
| 3 | Geometry and Trigonometry | Angles, Triangles, Quadrilaterals, Circles, Congruence/similarity, Trig (SOH CAH TOA), Bearings | ~700 |
| 4 | Mensuration | Perimeter/area, Surface area, Volume, Arc/sector, Density/speed | ~700 |
| 5 | Statistics and Probability | Data presentation, Mean/median/mode, Range/IQR, Probability, Tree/Venn diagrams | ~700 |
| 6 | Vectors and Transformations | Vector ops, Translation/reflection/rotation, Enlargement, Combined transforms | ~700 |
| 7 | Coordinate Geometry | Cartesian plane, Gradient/line eq, Distance/midpoint, Parallel/perpendicular | ~700 |
| **Interleaved/Review** | Mixed topics | Cross-topic exam-style problems | ~200 |

## Generation Strategy (3-tier approach)

### Tier 1: Rich Template Expansion (~1,500 pairs)
Instead of generic "Step 1-5" responses, create 10-15 real math problem templates per subtopic with actual numbers and working.

**Example for Fractions (English):**
```
Instruction: "A piece of string is 3/4 m long. You cut off 2/5 m. How much string remains?"
Type: problem_solving
Response: "Step 1: Write the problem as 3/4 - 2/5
Step 2: Find LCD. LCM of 4 and 5 = 20
Step 3: Convert fractions: 3/4 = 15/20, 2/5 = 8/20
Step 4: Subtract: 15/20 - 8/20 = 7/20
Step 5: 7/20 m remains."
```

**Template Types:**
- `explanation` — Topic overview + key formulas  
- `worked_example` — Full worked solution with steps  
- `exam_question` — Past-paper style question  
- `word_problem` — Real-world application  
- `concept_question` — Test understanding of theory  
- `common_mistake` — Identify/correct error  
- `comparison` — Compare two methods or concepts  

### Tier 2: LLM Synthetic Generation (~2,500 pairs)
Use Self-Instruct + Evol-Instruct methodology:

1. Take 50 high-quality seed instructions (manually written)
2. Feed to Gemini/GPT-4o/DeepSeek with prompt:
   ```
   Generate 5 ZIMSEC O-Level Mathematics questions for topic: [TOPIC], subtopic: [SUBTOPIC].
   Format as real exam-style questions with complete worked solutions.
   Language: English (or Shona).
   Question types: word_problem, worked_example, exam_question.
   Difficulty: mix of easy, medium, hard.
   ```
3. Run quality judge (Gemini eval) — discard poor quality
4. Generate Shona versions via translation + math review

### Tier 3: Past Paper Extraction (~1,000 pairs)
Scrape ZIMSEC past papers (available at freezimsec.com, zimsec.co.zw, pastpapers.co.zw):
- Extract questions + marking schemes
- Convert to instruction format
- 400-500 actual exam questions across all topics

### Tier 4: Ndebele Expansion (~300 pairs)
Translate subset of best Shona pairs into Ndebele for trilingual coverage.

## Quality Filtering Pipeline

1. **Format check** — Valid JSONL, required fields present
2. **Answer correctness** — Compute check for numeric answers; LLM judge for explanations
3. **Instruction clarity** — Instruction must be a clear, standalone question
4. **Response completeness** — Must show working, not just answer
5. **Deduplication** — Remove near-duplicate questions (embedding similarity > 0.85)
6. **Difficulty balance** — Ensure mix across easy/medium/hard per subtopic
7. **Bilingual parity** — Every English instruction should have a Shona version

## Generation Pipeline (Scripts)

```
scripts/
  generate_dataset.py          # Main orchestration
  templates/
    template_library.json       # 10-15 templates per subtopic
    template_renderer.py        # Fill template vars with random numbers
  llm_generator.py              # Self-Instruct generation via API
  quality_filter.py             # Judge-based filtering
  past_paper_parser.py          # Scrape/extract past paper Q&A
  bilingual_pipeline.py         # Translate + verify Shona/Ndebele
  export.py                     # Final JSONL + stats report
```

## Timeline

| Phase | Pairs | Effort | Timeline |
|-------|-------|--------|----------|
| Phase 1: Rich Templates | 1,500 | 2-3 days (replace existing template responses with real math) | Week 1 |
| Phase 2: LLM Generation | 2,500 | 1-2 days (API calls, prompt engineering) | Week 1-2 |
| Phase 3: Past Papers | 1,000 | 2-3 days (scraping + conversion) | Week 2 |
| Phase 4: Ndebele + QA | 300+ | 1 day | Week 2 |
| **Total** | **~5,300** | **5-8 days** | **By Jul 3** |

## Immediate Next Steps (done by me right now)

1. ✅ Build and write plan
2. Write `generate_dataset.py` master script
3. Create rich templates with real math problems for ~20 representative subtopics (proof of concept)
4. Run on Numbers & Operations topic first (~700 pairs)
5. Show Mathias the output quality before scaling to all 7 topics

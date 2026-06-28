const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.NYASHA_PORT || 8000;
const AI_BOS_URL = process.env.AI_BOS_URL || null; // null = not available on Render
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || null; // set this on Render
const AI_BOS_TOKEN = process.env.AI_BOS_TOKEN || 'AI_BOS_SECURE_TOKEN_2026';

// ─── Shona System Prompts ────────────────────────────────

const SHONA_MATH_PROMPT = `Iwe uri Nyasha, murairidzi wemasvomhu weZIMSEC. 
Unofanirwa kudzidzisa vadzidzi ve secondary school.

ZVISUNGO:
1. Pindura mumutauro wakanyorwa mubvunzo (Shona kana English)
2. Ratidza nhanho dzese - usasvetuka
3. Shandisa mienzaniso yepedyo (nguva, mari, chikwereti, zviyero)
4. Kana mudzidzi asinganzwisise, edza nzira yakasiyana
5. Shandisa mazwi aya: wedzera, bvisa, peta, govana, nhamba, mhinduro
6. Ramba wakanyorova uye unonakidza`;

const ENGLISH_MATH_PROMPT = `You are Nyasha, a ZIMSEC Mathematics tutor for secondary students.

RULES:
1. Respond in the language the question was asked (Shona or English)
2. Show ALL working steps - never skip a step
3. Use relatable examples (money, time, shopping, measurements)
4. If student is stuck, try a different explanation
5. Be encouraging and patient
6. For Shona questions, use Shona math terms`;

// ─── AI Routing ──────────────────────────────────────────

async function askViaOpenClaw(prompt, systemPrompt) {
  // Try OpenClaw first (local/self-hosted)
  if (AI_BOS_URL) {
    try {
      const resp = await fetch(`${AI_BOS_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_BOS_TOKEN}`
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1500,
          temperature: 0.3
        })
      });
      const data = await resp.json();
      return data?.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.error('OpenClaw AI error:', e.message);
    }
  }
  
  // Fallback: Direct DeepSeek API (for Render/standalone deployment)
  if (DEEPSEEK_API_KEY) {
    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1500,
          temperature: 0.3
        })
      });
      const data = await resp.json();
      return data?.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.error('DeepSeek API error:', e.message);
    }
  }
  
  return null;
}

// ─── Routes ──────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'nyasha-tutor', ai_backend: 'openclaw-deepseek' });
});

app.post('/api/solve', async (req, res) => {
  try {
    const { question, level } = req.body;
    if (!question) return res.status(400).json({ error: 'Question required' });
    
    // Detect language
    const isShona = /[zvkndmbprtsh]a|ye|ya|dz|gadzirisa|tsvaga|verenga|rerutsa/i.test(question.split(' ').slice(0, 3).join(' '));
    
    const prompt = `Question (${level || 'unknown'} level): ${question}\n\nShow step-by-step working.`;
    const system = isShona ? SHONA_MATH_PROMPT : ENGLISH_MATH_PROMPT;
    
    const answer = await askViaOpenClaw(prompt, system);
    if (answer) {
      res.json({ answer, language: isShona ? 'shona' : 'english' });
    } else {
      // Fallback to local solver for simple equations
      const localAnswer = solveLocalMath(question);
      res.json({ answer: localAnswer || 'Sorry, I could not solve that. Try rephrasing.', language: 'fallback' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    
    const isShona = /[zvkndmbprtsh]a|mhoro|sei|ndine|ndiri|zvinhu|nezve|asi|chii|here/i.test(message);
    const system = isShona ? SHONA_MATH_PROMPT : ENGLISH_MATH_PROMPT;
    
    const reply = await askViaOpenClaw(message, system);
    res.json({ reply: reply || '🤔 Sorry, I did not understand. Try again!', language: isShona ? 'shona' : 'english' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Local Maths Solver (Fallback) ──────────────────────

function solveLocalMath(text) {
  const t = text.trim().toLowerCase();
  
  // Linear equations: 2x + 5 = 13
  const m = t.match(/(\d+)\s*([a-z])\s*([+-])\s*(\d+)\s*=\s*(-?\d+)/);
  if (m) {
    const coeff = parseFloat(m[1]);
    const op = m[3];
    const num = parseFloat(m[4]);
    const result = parseFloat(m[5]);
    if (op === '+') {
      const rhs = result - num;
      return `Step 1: ${coeff}x = ${result} - ${num}\nStep 2: ${coeff}x = ${rhs}\nStep 3: x = ${rhs} ÷ ${coeff}\nStep 4: x = ${rhs / coeff}`;
    }
    if (op === '-') {
      const rhs = result + num;
      return `Step 1: ${coeff}x = ${result} + ${num}\nStep 2: ${coeff}x = ${rhs}\nStep 3: x = ${rhs} ÷ ${coeff}\nStep 4: x = ${rhs / coeff}`;
    }
  }
  
  // Simple percentage: 15% of 200
  const pct = t.match(/(\d+)\s*%\s*(?:of|ye)?\s*(\d+)/);
  if (pct) return `${pct[1]}% of ${pct[2]} = (${pct[1]}/100) × ${pct[2]} = ${(parseFloat(pct[1])/100)*parseFloat(pct[2])}`;
  
  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧮 Nyasha Tutor API running on http://127.0.0.1:${PORT}`);
  console.log('   Endpoints:');
  console.log('   GET  /api/health  →  health check');
  console.log('   POST /api/solve   →  maths solver (Shona/English)');
  console.log('   POST /api/chat    →  Shona-style conversation');
});

/**
 * generators-part2.js — remaining generators: Statistics, Matrices, Transformations, Vectors, Relations & Functions, Graphs, Ratio & Proportion, Consumer Arithmetic
 */

const { gcdEuclid, simplifyFraction, randInt, pick, wrap } = (() => {
  function gcdEuclid(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a; }
  function simplifyFraction(v) {
    const denoms = [2,3,4,5,6,8,10,12,15,16,20,25,30,40,50,60,75,80,100];
    for (const d of denoms) { const n = Math.round(v * d); if (Math.abs(n/d - v) < 0.001) { const g = gcdEuclid(n, d); if (d/g === 1) return `${n/g}`; return `${n/g}/${d/g}`; } }
    return v.toFixed(4);
  }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function wrap(topic, subtopic, gen) { const q = gen(); return { instruction: q.i, input: '', response: q.r, topic, subtopic: q.s || subtopic, language: 'en', type: 'exam_question' }; }
  return { gcdEuclid, simplifyFraction, randInt, pick, wrap };
})();

// ─── 8. Statistics ────────────────────────────────────────────────────────────

function* statsFactory() {
  yield () => { const v=Array.from({length:randInt(5,10)},()=>randInt(2,20)),m=(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2); return {i:`Mean of: ${v.join(', ')}`,r:m,s:'Mean'}; };
  yield () => { const v=Array.from({length:randInt(5,9)},()=>randInt(5,30)).sort((a,b)=>a-b),med=v.length%2===1?v[Math.floor(v.length/2)]:((v[v.length/2-1]+v[v.length/2])/2); return {i:`Median of: ${v.join(', ')}`,r:`${med}`,s:'Median'}; };
  yield () => { const vals=Array.from({length:randInt(5,10)},()=>randInt(1,10)); const f={}; vals.forEach(v=>{f[v]=(f[v]||0)+1;}); const mf=Math.max(...Object.values(f)),modes=Object.entries(f).filter(([,c])=>c===mf).map(([k])=>k),ms=modes.length===vals.length?'No mode':modes.join(', '); return {i:`Mode of: ${vals.join(', ')}`,r:ms,s:'Mode'}; };
  yield () => { const v=Array.from({length:randInt(4,8)},()=>randInt(1,30)),rng=Math.max(...v)-Math.min(...v); return {i:`Range of: ${v.join(', ')}`,r:`${rng}`,s:'Range'}; };
  yield () => { const c=['Red','Blue','Green','Yellow'],f=c.map(()=>randInt(2,15)),ci=randInt(0,3),tot=f.reduce((a,b)=>a+b,0); return {i:`Chart: ${c.map((x,i)=>`${x}:${f[i]}`).join(', ')}. Fraction ${c[ci]}?`,r:simplifyFraction(f[ci]/tot),s:'Bar Charts'}; };
}

function genStatistics(n) { const f=[...statsFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Statistics','',pick(f))); return o; }

// ─── 9. Matrices ──────────────────────────────────────────────────────────────

function* matFactory() {
  yield () => { const a=randInt(1,5),b=randInt(1,5),c=randInt(1,5),d=randInt(1,5); return {i:`A=[${a} ${b}; ${c} ${d}]. Find det(A).`,r:`${a*d-b*c}`,s:'Determinant'}; };
  yield () => { const a=randInt(1,4),b=randInt(1,4),c=randInt(1,4),d=randInt(1,4),det=a*d-b*c; return {i:`A=[${a} ${b}; ${c} ${d}]. Find A⁻¹.`,r:det===0?'No inverse (singular)':`1/${det} × [${d} ${-b}; ${-c} ${a}]`,s:'Inverse'}; };
  yield () => { const a11=randInt(1,5),a12=randInt(1,5),a21=randInt(1,5),a22=randInt(1,5),b11=randInt(1,5),b12=randInt(1,5),b21=randInt(1,5),b22=randInt(1,5); return {i:`A=[${a11} ${a12}; ${a21} ${a22}], B=[${b11} ${b12}; ${b21} ${b22}]. A+B?`,r:`[${a11+b11} ${a12+b12}; ${a21+b21} ${a22+b22}]`,s:'Addition'}; };
  yield () => { const s=randInt(2,5),a11=randInt(1,4),a12=randInt(1,4),a21=randInt(1,4),a22=randInt(1,4); return {i:`A=[${a11} ${a12}; ${a21} ${a22}]. Find ${s}A.`,r:`[${s*a11} ${s*a12}; ${s*a21} ${s*a22}]`,s:'Scalar Multiplication'}; };
}

function genMatrices(n) { const f=[...matFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Matrices','',pick(f))); return o; }

// ─── 10. Transformations ──────────────────────────────────────────────────────

function* transFactory() {
  yield () => { const x=randInt(1,5),y=randInt(1,5); return {i:`P(${x},${y}) translate by (3,-2). Find P'.`,r:`P'(${x+3},${y-2})`,s:'Translation'}; };
  yield () => { const x=randInt(1,5),y=randInt(1,5); return {i:`P(${x},${y}) reflect x-axis. Find P'.`,r:`P'(${x},${-y})`,s:'Reflection'}; };
  yield () => { const x=randInt(1,5),y=randInt(1,5); return {i:`P(${x},${y}) rotate 90° clockwise about origin. Find P'.`,r:`P'(${y},${-x})`,s:'Rotation'}; };
  yield () => { const x=randInt(1,4),y=randInt(1,4),sf=pick([2,3,4]); return {i:`P(${x},${y}) enlarge SF=${sf} about origin. Find P'.`,r:`P'(${sf*x},${sf*y})`,s:'Enlargement'}; };
}

function genTransformations(n) { const f=[...transFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Transformations','',pick(f))); return o; }

// ─── 11. Vectors ──────────────────────────────────────────────────────────────

function* vecFactory() {
  yield () => { const a=randInt(1,5),b=randInt(1,5); return {i:`|(${a},${b})|?`,r:`${Math.sqrt(a*a+b*b).toFixed(2)}`,s:'Magnitude'}; };
  yield () => { const a1=randInt(1,5),a2=randInt(1,5),b1=randInt(1,5),b2=randInt(1,5); return {i:`a=(${a1},${a2}), b=(${b1},${b2}). a+b?`,r:`(${a1+b1}, ${a2+b2})`,s:'Vector Addition'}; };
  yield () => { const a1=randInt(3,8),a2=randInt(3,8),b1=randInt(1,5),b2=randInt(1,5); return {i:`a=(${a1},${a2}), b=(${b1},${b2}). a-b?`,r:`(${a1-b1}, ${a2-b2})`,s:'Vector Subtraction'}; };
  yield () => { const a=randInt(1,3),v1=randInt(1,4),v2=randInt(1,4); return {i:`v=(${v1},${v2}). Find ${a}v.`,r:`(${a*v1}, ${a*v2})`,s:'Scalar Multiple'}; };
}

function genVectors(n) { const f=[...vecFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Vectors','',pick(f))); return o; }

// ─── 12. Relations & Functions ────────────────────────────────────────────────

function* funcFactory() {
  yield () => { const x=randInt(-5,5),m=randInt(1,4),c=randInt(-5,5); return {i:`f(x)=${m}x${c>=0?'+':'-'}${Math.abs(c)}. f(${x})?`,r:`${m*x+c}`,s:'Function Notation'}; };
  yield () => { const a=randInt(1,5),b=randInt(-10,-1),c=randInt(1,5),x=randInt(-3,3),v=a*x*x+b*x+c; return {i:`f(x)=${a}x²${b>=0?'+':'-'}${Math.abs(b)}x${c>=0?'+':'-'}${Math.abs(c)}. f(${x})?`,r:`${v}`,s:'Quadratic Functions'}; };
  yield () => { const g=pick(['f(x)=x+2,g(x)=3x','f(x)=2x-1,g(x)=x²']); return {i:`Given ${g}, find f(2).`,r:g.startsWith('f(x)=x+2')?'4':'3',s:'Composite Functions'}; };
  yield () => { const a=randInt(2,5),b=randInt(-5,-1); return {i:`f(x)=(${a}x+${-b})/(x-${b}). Domain?`,r:`x ≠ ${b}`,s:'Domain & Range'}; };
}

function genFunctions(n) { const f=[...funcFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Relations & Functions','',pick(f))); return o; }

// ─── 13. Graphs ───────────────────────────────────────────────────────────────

function* graphFactory() {
  yield () => { const m=randInt(1,4),c=randInt(-5,5); return {i:`y=${m}x${c>=0?'+':'-'}${Math.abs(c)}. Gradient and y-intercept?`,r:`m=${m}, c=${c}`,s:'Straight Line Graphs'}; };
  yield () => { const m=randInt(2,5),c=randInt(-5,5),x0=-(c/m); return {i:`y=${m}x${c>=0?'+':'-'}${Math.abs(c)}. x-intercept?`,r:`${x0}`,s:'x-intercepts'}; };
  yield () => { const x=randInt(-3,3); return {i:`y=x²-4. Find y when x=${x}.`,r:`${x*x-4}`,s:'Quadratic Graphs'}; };
  yield () => { const x=randInt(-2,3); return {i:`y=2^x. Find y when x=${x}.`,r:`${Math.pow(2,x)}`,s:'Exponential Graphs'}; };
  yield () => { return {i:'Sketch y = 1/x for x > 0. What is the shape called?',r:'Reciprocal (hyperbola)',s:'Reciprocal Graphs'}; };
}

function genGraphs(n) { const f=[...graphFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Graphs','',pick(f))); return o; }

// ─── 14. Ratio & Proportion ───────────────────────────────────────────────────

function* ratioFactory() {
  yield () => { const a=randInt(1,5),b=randInt(1,5); return {i:`Simplify ratio ${a*8}:${b*8}`,r:`${a}:${b}`,s:'Simplifying Ratios'}; };
  yield () => { const a=randInt(2,10),b=randInt(2,5),x=randInt(3,8); return {i:`If a:b=${a}:${b} and a=${a*x}, find b.`,r:`${b*x}`,s:'Direct Proportion'}; };
  yield () => { const a=randInt(3,8),b=randInt(3,8),c1=randInt(3,6),c2=randInt(3,6); return {i:`a varies inversely as b. If a=${c1} when b=${c2}, find a when b=${(c1*c2)/a}`.replace(/\.\d+/,''),r:`${a}`,s:'Inverse Proportion'}; };
  yield () => { return {i:'If 5 books cost $25, how much do 8 books cost?',r:'$40',s:'Direct Proportion'}; };
}

function genRatio(n) { const f=[...ratioFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Ratio & Proportion','',pick(f))); return o; }

// ─── 15. Consumer Arithmetic ──────────────────────────────────────────────────

function* consumerFactory() {
  yield () => { const p=randInt(50,500),r=pick([5,10,12.5,15,20,25]); return {i:`Item costs $${p}. Discount ${r}%. Sale price?`,r:`$${(p*(1-r/100)).toFixed(2)}`,s:'Discount'}; };
  yield () => { const p=randInt(100,1000),r=pick([5,8,10,12,15]),t=p*(1+r/100); return {i:`Price $${p}. Add ${r}% VAT. Total?`,r:`$${t.toFixed(2)}`,s:'VAT'}; };
  yield () => { const p=randInt(500,5000),r=pick([5,8,10,12]),y=randInt(1,3),si=p*r*y/100; return {i:`Principal $${p}, rate ${r}% pa, ${y} years. Simple interest?`,r:`$${si}`,s:'Simple Interest'}; };
  yield () => { const p=randInt(100,500),up=pick([5,10,15,20]); return {i:`Bought for $${p}, sold for $${p+up}. Profit percentage?`,r:`${(up/p*100).toFixed(1)}%`,s:'Profit & Loss'}; };
  yield () => { return {i:'Exchange rate: $1 = ZWL 400. How much in ZWL for $50?',r:'ZWL 20,000',s:'Currency Conversion'}; };
}

function genConsumer(n) { const f=[...consumerFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Consumer Arithmetic','',pick(f))); return o; }

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
  genStatistics, genMatrices, genTransformations, genVectors, genFunctions, genGraphs, genRatio, genConsumer,
};

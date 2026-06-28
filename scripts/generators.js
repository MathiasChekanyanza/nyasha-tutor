/**
 * generators.js — ZIMSEC O-Level Maths question generators (all 15 syllabus topics)
 * Split into parts to fit write limits. Part 1: Numbers, Algebra, Geometry, Mensuration, Trig, Sets, Probability
 */

function gcdEuclid(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

function simplifyFraction(v) {
  const denoms = [2,3,4,5,6,8,10,12,15,16,20,25,30,40,50,60,75,80,100];
  for (const d of denoms) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) < 0.001) {
      const g = gcdEuclid(n, d);
      if (d / g === 1) return `${n / g}`;
      return `${n / g}/${d / g}`;
    }
  }
  return v.toFixed(4);
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function wrap(topic, subtopic, gen) {
  const q = gen();
  return { instruction: q.i, input: '', response: q.r, topic, subtopic: q.s || subtopic, language: 'en', type: 'exam_question' };
}

// ─── 1. Numbers ───────────────────────────────────────────────────────────────

function* numbersFactory() {
  yield () => { const a=randInt(10,99),b=randInt(1,6),s=pick([1,-1]),v=a*Math.pow(10,s*b); return {i:`Write ${v.toLocaleString('en-US',{maximumFractionDigits:0})} in standard form.`,r:`${a} × 10^${s>0?'':'-'}${b}`,s:'Standard Form'}; };
  yield () => { const v=randInt(1000,99999)+Math.random(),sf=pick([1,2,3]); return {i:`Round ${v.toFixed(4)} to ${sf} sf.`,r:parseFloat(v.toPrecision(sf)).toString(),s:'Significant Figures'}; };
  yield () => { const v=randInt(1,100)+Math.random()*100,dp=pick([1,2,3]); return {i:`Round ${v.toFixed(5)} to ${dp} dp.`,r:v.toFixed(dp),s:'Decimal Places'}; };
  yield () => { const an=randInt(1,8),ad=randInt(2,9),bn=randInt(1,8),bd=randInt(2,9),op=pick(['+','-','×','÷']); let v,d; if(op==='+'){v=an/ad+bn/bd;d=`${an}/${ad}+${bn}/${bd}`;}else if(op==='-'){v=an/ad-bn/bd;d=`${an}/${ad}-${bn}/${bd}`;}else if(op==='×'){v=(an*bn)/(ad*bd);d=`${an}/${ad}×${bn}/${bd}`;}else{v=(an*bd)/(ad*bn);d=`${an}/${ad}÷${bn}/${bd}`;} return {i:`Evaluate: ${d}`,r:simplifyFraction(v),s:'Fractions'}; };
  yield () => { const a=randInt(2,7)*2,b=randInt(2,7)*3,g=gcdEuclid(a,b),l=(a*b)/g,t=pick(['LCM','HCF']); return {i:`Find ${t} of ${a} and ${b}.`,r:t==='LCM'?l.toString():g.toString(),s:t}; };
  yield () => { const t=randInt(100,500),p=randInt(1,t),pc=Math.round((p/t)*1000)/10; return {i:`Express ${p} as % of ${t}.`,r:`${pc}%`,s:'Percentages'}; };
  yield () => { const mp=randInt(10,99),sp=randInt(100,500); return {i:`Find ${mp}% of $${sp}.`,r:`$${(mp*sp/100).toFixed(2)}`,s:'Percentages'}; };
  yield () => { const rt=randInt(3,8),amt=randInt(2,9)*10,s1=Math.floor(amt*(1/rt)*100)/100,s2=Math.floor((amt-s1)*100)/100; return {i:`Share $${amt} in ratio 1:${rt-1}.`,r:`$${s1} and $${s2}`,s:'Ratio'}; };
  yield () => { const sp=randInt(20,80),t=randInt(1,4); return {i:`Car ${sp}km/h for ${t}h. Distance?`,r:`${sp*t} km`,s:'Speed-Distance-Time'}; };
}

function genNumbers(n) { const f=[...numbersFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Numbers','',pick(f))); return o; }

// ─── 2. Algebra ───────────────────────────────────────────────────────────────

function* algebraFactory() {
  yield () => { const a=randInt(1,5),b=randInt(1,8),c=randInt(1,8); return {i:`Expand: ${a}x(x${b>=0?'+':'-'}${Math.abs(b)})(x${c>=0?'+':'-'}${Math.abs(c)})`,r:`${a}x³+${a*(b+c)}x²+${a*b*c}x`.replace(/\+\s*-/g,'- '),s:'Expansion'}; };
  yield () => { const r1=randInt(1,8),r2=randInt(1,8),b=-(r1+r2),c=r1*r2; return {i:`Factorise: x²${b>=0?'+':'-'}${Math.abs(b)}x${c>=0?'+':'-'}${Math.abs(c)}`,r:`(x${-r1>=0?'+':'-'}${Math.abs(-r1)})(x${-r2>=0?'+':'-'}${Math.abs(-r2)})`,s:'Factorisation'}; };
  yield () => { const x=randInt(-9,9),a=randInt(1,5),b=randInt(-10,10),rhs=a*x+b; return {i:`Solve: ${a}x${b>=0?'+':'-'}${Math.abs(b)} = ${rhs}`,r:`x=${x}`,s:'Linear Equations'}; };
  yield () => { const r1=randInt(1,6),r2=randInt(1,6),b=-(r1+r2),c=r1*r2; return {i:`Solve: x²${b>=0?'+':'-'}${Math.abs(b)}x${c>=0?'+':'-'}${Math.abs(c)}=0`,r:`x=${Math.min(r1,r2)} or x=${Math.max(r1,r2)}`,s:'Quadratic Equations'}; };
  yield () => { const n=randInt(2,6)*2,d=randInt(2,6)*2; return {i:`Simplify: (${n}x+${n})/(${d}x+${d})`,r:`${n/d} (x≠-1)`,s:'Algebraic Fractions'}; };
  yield () => { const x=randInt(-5,5)||1,y=randInt(-5,5)||1,a1=randInt(1,3),b1=randInt(1,3),c1=a1*x+b1*y,a2=randInt(1,3),b2=randInt(1,3),c2=a2*x+b2*y; return {i:`Solve:\n${a1}x+${b1}y=${c1}\n${a2}x+${b2}y=${c2}`,r:`x=${x}, y=${y}`,s:'Simultaneous Equations'}; };
  yield () => { const b=randInt(2,5),e=randInt(1,4); return {i:`Evaluate: ${b}^${e}`,r:`${Math.pow(b,e)}`,s:'Indices'}; };
  yield () => { const a=randInt(2,5),m=randInt(1,3),n=randInt(1,3); return {i:`Simplify: ${a}^${m} × ${a}^${n}`,r:`${a}^${m+n}`,s:'Laws of Indices'}; };
  yield () => { const x=randInt(-3,-1),y=randInt(-3,-1); return {i:`x=${x}, y=${y}. Find x²+2xy+y².`,r:`${Math.pow(x+y,2)}`,s:'Algebraic Manipulation'}; };
}

function genAlgebra(n) { const f=[...algebraFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Algebra','',pick(f))); return o; }

// ─── 3. Geometry ──────────────────────────────────────────────────────────────

function* geometryFactory() {
  yield () => { const a=randInt(30,70),b=randInt(30,70),c=180-a-b; return {i:`Triangle ∠A=${a}°, ∠B=${b}°. Find ∠C.`,r:`${c}°`,s:'Triangle Angles'}; };
  yield () => { const ba=randInt(40,70); return {i:`Isosceles base angles ${ba}°. Apex angle?`,r:`${180-2*ba}°`,s:'Isosceles Triangles'}; };
  yield () => { const a=randInt(20,80); return {i:`Parallel lines: one angle=${a}°. Corresponding and alternate?`,r:`${a}°, ${a}°`,s:'Parallel Lines'}; };
  yield () => { const s=randInt(3,7); return {i:`Sum of interior angles of ${s}-sided polygon?`,r:`${(s-2)*180}°`,s:'Polygons'}; };
  yield () => { const s=pick([5,6,8,9,10,12]); return {i:`Exterior angle of regular ${s}-sided polygon?`,r:`${360/s}°`,s:'Regular Polygons'}; };
  yield () => { const a=randInt(2,8)*10; return {i:`Centre angle=${a}°. Angle at circumference?`,r:`${a/2}°`,s:'Circle Theorems'}; };
  yield () => { const a=randInt(3,8),b=randInt(3,8),c=Math.sqrt(a*a+b*b); return {i:`Right triangle ${a}cm, ${b}cm. Hypotenuse?`,r:`${c.toFixed(1)} cm`,s:'Pythagoras'}; };
  yield () => { const c=pick(['SSS','SAS','ASA','RHS']); return {i:`Which congruence condition? ${c==='SSS'?'3 sides equal':c==='SAS'?'2 sides+included angle':c==='ASA'?'2 angles+included side':'RHS'}`,r:c,s:'Congruence'}; };
}

function genGeometry(n) { const f=[...geometryFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Geometry','',pick(f))); return o; }

// ─── 4. Mensuration ───────────────────────────────────────────────────────────

function* mensurationFactory() {
  yield () => { const l=randInt(5,14),w=randInt(3,10); return {i:`Rectangle ${l}cm×${w}cm. Area?`,r:`${l*w} cm²`,s:'Area of Rectangle'}; };
  yield () => { const b=randInt(4,13),h=randInt(3,12); return {i:`Triangle base=${b}cm, height=${h}cm. Area?`,r:`${0.5*b*h} cm²`,s:'Area of Triangle'}; };
  yield () => { const r=randInt(2,8); return {i:`Circle radius ${r}cm. Area? (π=3.142)`,r:`${(3.142*r*r).toFixed(2)} cm²`,s:'Area of Circle'}; };
  yield () => { const r=randInt(2,6),h=randInt(5,14); return {i:`Cylinder r=${r}cm, h=${h}cm. Volume? (π=3.142)`,r:`${(3.142*r*r*h).toFixed(2)} cm³`,s:'Volume of Cylinder'}; };
  yield () => { const l=randInt(2,7),w=randInt(2,6),h=randInt(2,5); return {i:`Cuboid ${l}×${w}×${h}cm. Surface area?`,r:`${2*(l*w+l*h+w*h)} cm²`,s:'Surface Area'}; };
  yield () => { const l=randInt(3,8),w=randInt(2,6),h=randInt(2,5); return {i:`Cuboid ${l}m×${w}m×${h}m. Volume?`,r:`${l*w*h} m³`,s:'Volume of Cuboid'}; };
  yield () => { const l=randInt(4,11),w=randInt(3,8); return {i:`Rectangle ${l}cm×${w}cm. Perimeter?`,r:`${2*(l+w)} cm`,s:'Perimeter'}; };
  yield () => { const r=randInt(3,9); return {i:`Circle r=${r}cm. Circumference? (π=3.142)`,r:`${(2*3.142*r).toFixed(2)} cm`,s:'Circumference'}; };
  yield () => { const r=randInt(3,9),a=randInt(1,9)*10; return {i:`Sector r=${r}cm, angle=${a}°. Arc length? (π=3.142)`,r:`${(2*3.142*r*a/360).toFixed(2)} cm`,s:'Arc Length'}; };
  yield () => { const r=randInt(3,9),a=randInt(3,8)*10; return {i:`Sector r=${r}cm, angle=${a}°. Sector area? (π=3.142)`,r:`${(3.142*r*r*a/360).toFixed(2)} cm²`,s:'Sector Area'}; };
}

function genMensuration(n) { const f=[...mensurationFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Mensuration','',pick(f))); return o; }

// ─── 5. Trigonometry ──────────────────────────────────────────────────────────

function* trigFactory() {
  yield () => { const a=pick([0,30,45,60,90]),f=pick(['sin','cos','tan']),m={'0':{'sin':'0','cos':'1','tan':'0'},'30':{'sin':'0.5000','cos':'0.8660','tan':'0.5774'},'45':{'sin':'0.7071','cos':'0.7071','tan':'1'},'60':{'sin':'0.8660','cos':'0.5000','tan':'1.7321'},'90':{'sin':'1','cos':'0','tan':'undefined'}}; return {i:`Find ${f} ${a}°.`,r:m[a][f],s:'Trig Ratios'}; };
  yield () => { const a=randInt(20,60),h=randInt(5,14),o=h*Math.sin(a*Math.PI/180); return {i:`Right triangle hyp=${h}cm, angle=${a}°. Opposite side?`,r:`${o.toFixed(2)} cm`,s:'Finding Sides'}; };
  yield () => { const o=randInt(3,10),a=randInt(3,10),ang=Math.round(Math.atan2(o,a)*180/Math.PI); return {i:`Right triangle opp=${o}cm, adj=${a}cm. Find angle.`,r:`${ang}°`,s:'Finding Angles'}; };
  yield () => { const a=randInt(10,30),A=randInt(30,60),B=randInt(30,60),b=(a/Math.sin(A*Math.PI/180))*Math.sin(B*Math.PI/180); return {i:`Sine rule: a=${a}cm, A=${A}°, B=${B}°. Find b.`,r:`${b.toFixed(2)} cm`,s:'Sine Rule'}; };
  yield () => { const a=randInt(2,8)*10,d=randInt(10,50),h=d*Math.tan(a*Math.PI/180); return {i:`Elevation=${a}°, distance=${d}m. Height?`,r:`${h.toFixed(2)} m`,s:'Angle of Elevation'}; };
}

function genTrigonometry(n) { const f=[...trigFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Trigonometry','',pick(f))); return o; }

// ─── 6. Sets ──────────────────────────────────────────────────────────────────

function* setsFactory() {
  yield () => { const t=randInt(15,35),a=randInt(5,15),b=randInt(5,15),inter=randInt(1,Math.min(a,b)-1),uni=a+b-inter,none=t-uni; return {i:`Class of ${t}: ${a} football, ${b} basketball. ${uni-a} only basketball, ${none} neither. Both?`,r:`${inter}`,s:'Venn Diagrams'}; };
  yield () => ({i:'A={1,2,3,4,5},B={3,4,5,6,7}. Find A∪B.',r:'{1,2,3,4,5,6,7}',s:'Union'});
  yield () => ({i:'A={1,2,3,4,5},B={3,4,5,6,7}. Find A∩B.',r:'{3,4,5}',s:'Intersection'});
  yield () => ({i:"ξ={1..10},A={1,3,5,7,9}. Find A'.",r:'{2,4,6,8,10}',s:'Complement'});
  yield () => { const t=randInt(20,50); return {i:`ξ has ${t}. n(A)=${Math.round(t*0.6)}, n(B)=${Math.round(t*0.5)}, n(A∩B)=${Math.round(t*0.2)}. n(A∪B)?`,r:`${Math.round(t*0.6)+Math.round(t*0.5)-Math.round(t*0.2)}`,s:'Set Notation'}; };
}

function genSets(n) { const f=[...setsFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Sets','',pick(f))); return o; }

// ─── 7. Probability ───────────────────────────────────────────────────────────

function* probFactory() {
  yield () => { const t=randInt(4,12),fv=randInt(1,t-1),g=gcdEuclid(fv,t); return {i:`${t} marbles (${fv} red). P(red)?`,r:`${fv/g}/${t/g}`,s:'Simple Probability'}; };
  yield () => { const nm=randInt(1,5),dn=pick([6,8,10,12]); return {i:`P(rain)=${nm}/${dn}. P(no rain)?`,r:`${dn-nm}/${dn}`,s:'Complement'}; };
  yield () => { const an=randInt(1,3),ad=pick([4,6,8]),bn=randInt(1,2),bd=pick([3,4,5]),pn=an*bn,pd=ad*bd,g=gcdEuclid(pn,pd); return {i:`P(A)=${an}/${ad}, P(B)=${bn}/${bd} (indep). P(A∩B)?`,r:`${pn/g}/${pd/g}`,s:'Independent Events'}; };
  yield () => { const t=[6,10,12][randInt(0,2)]; return {i:`Roll ${t}-sided die. P(even)?`,r:`${t/2}/${t}`,s:'Fair Probability'}; };
  yield () => { const t=randInt(10,20),b=randInt(3,t-3),r=t-b; return {i:`${t} balls: ${b} blue, ${r} red. P(blue then red, no replace)?`,r:`${(b/t * r/(t-1)).toFixed(4)}`,s:'Without Replacement'}; };
}

function genProbability(n) { const f=[...probFactory()],o=[]; for(let i=0;i<n;i++) o.push(wrap('Probability','',pick(f))); return o; }

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
  genNumbers, genAlgebra, genGeometry, genMensuration, genTrigonometry, genSets, genProbability,
};

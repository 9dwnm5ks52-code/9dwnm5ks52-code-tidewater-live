// Tidewater Live: chart indicators (live/ind.js) against independent naive reimplementations, hand-computed values on
// tiny inputs, and edge cases (runs in node: node ds/t_ind.js)
const fs=require('fs'), vm=require('vm');
const ctx={ console, Date, Math, JSON, Map, Set, Object, Array, Number, String, Int32Array, isFinite }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../live/ind.js','utf8')+
  ';this.IND_DEFS=IND_DEFS;this.IND_CATS=IND_CATS;this.IND_LRU=IND_LRU;this.IND_ERR=()=>IND_ERR;', ctx);
const D=ctx.IND_DEFS, F=n=>ctx[n];
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined && !ok?'  · '+d:'')); };
const run=(id, bars, p, x)=>D[id].f(bars, p, x);

// ---------- comparison helpers ----------
function same(a, b, tol){ tol=tol||1e-9; if (!a || !b || a.length!==b.length) return `length ${a&&a.length} vs ${b&&b.length}`;
  for (let i=0;i<a.length;i++){ const x=a[i], y=b[i];
    if (x===null || y===null || x===undefined || y===undefined){ if (!(x===null && (y===null || y===undefined))) return `i=${i}: ${x} vs ${y}`; continue; }
    if (!(Math.abs(x-y)<=tol*Math.max(1, Math.abs(x), Math.abs(y)))) return `i=${i}: ${x} vs ${y}`; }
  return true; }
const firstVal=a=>a.findIndex(x=>x!==null);
const near=(a, b, t)=>Math.abs(a-b)<=(t||1e-9)*Math.max(1, Math.abs(a), Math.abs(b));
const eqArr=(a, b, t)=>same(a, b, t)===true;

// ---------- fixed random-walk bars (15-minute bars, ~6 days, so VWAP / pivots cross several UTC midnights) ----------
let seed=12345; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
function walk(n, start, step, p0, volZeroEvery){ const out=[]; let p=p0;
  for (let i=0;i<n;i++){ const o=p, c=Math.max(p0*0.05, o*(1+(rnd()-.5)*.02)), h=Math.max(o, c)*(1+rnd()*.006), l=Math.min(o, c)*(1-rnd()*.006);
    out.push({ t:start+i*step, o, h, l, c, v: volZeroEvery && i%volZeroEvery===0 ? 0 : Math.round(rnd()*1000*100)/100 }); p=c; }
  return out; }
const T0=Date.UTC(2026,10,1,5,0), M15=9e5;
const BARS=walk(600, T0, M15, 100, 37), C=BARS.map(b=>b.c), H=BARS.map(b=>b.h), L=BARS.map(b=>b.l), V=BARS.map(b=>b.v);
const BTC=walk(600, T0, 6e4, 90000, 0);

// ---------- naive reference implementations (straight loops, no rolling tricks) ----------
const nulls=n=>new Array(n).fill(null);
function nSMA(a, n){ return a.map((_, i)=>{ if (i<n-1) return null; let s=0; for (let j=i-n+1;j<=i;j++){ if (a[j]===null) return null; s+=a[j]; } return s/n; }); }
function nWMA(a, n){ return a.map((_, i)=>{ if (i<n-1) return null; let s=0, w=0; for (let j=0;j<n;j++){ const x=a[i-n+1+j]; if (x===null) return null; s+=(j+1)*x; w+=j+1; } return s/w; }); }
function nEMAa(a, n, al){ const o=nulls(a.length), f=a.findIndex(x=>x!==null); if (f<0 || f+n>a.length) return o; let s=0; for (let j=f;j<f+n;j++) s+=a[j]; let e=s/n; o[f+n-1]=e;
  for (let i=f+n;i<a.length;i++){ e=e+al*(a[i]-e); o[i]=e; } return o; }
const nEMA=(a, n)=>nEMAa(a, n, 2/(n+1));
function nStd(a, n){ const m=nSMA(a, n); return a.map((_, i)=>{ if (m[i]===null) return null; let v=0; for (let j=i-n+1;j<=i;j++) v+=(a[j]-m[i])**2; return Math.sqrt(v/n); }); }
function nHi(a, n){ return a.map((_, i)=>{ if (i<n-1) return null; let m=-Infinity; for (let j=i-n+1;j<=i;j++){ if (a[j]===null) return null; m=Math.max(m, a[j]); } return m; }); }
function nLo(a, n){ return a.map((_, i)=>{ if (i<n-1) return null; let m=Infinity; for (let j=i-n+1;j<=i;j++){ if (a[j]===null) return null; m=Math.min(m, a[j]); } return m; }); }
function nTR(b){ return b.map((x, i)=>i ? Math.max(x.h-x.l, Math.abs(x.h-b[i-1].c), Math.abs(x.l-b[i-1].c)) : x.h-x.l); }
function nATR(b, n){ const tr=nTR(b), o=nulls(b.length); if (b.length<n) return o; let a=0; for (let i=0;i<n;i++) a+=tr[i]; a/=n; o[n-1]=a; for (let i=n;i<b.length;i++){ a=(a*(n-1)+tr[i])/n; o[i]=a; } return o; }
function nRSI(c, n){ const o=nulls(c.length); if (c.length<=n) return o; let g=0, l=0;
  for (let i=1;i<=n;i++){ const d=c[i]-c[i-1]; if (d>0) g+=d; else l-=d; } g/=n; l/=n;
  const val=()=>l===0 ? (g===0 ? 50 : 100) : 100-100/(1+g/l); o[n]=val();
  for (let i=n+1;i<c.length;i++){ const d=c[i]-c[i-1]; g=(g*(n-1)+Math.max(d, 0))/n; l=(l*(n-1)+Math.max(-d, 0))/n; o[i]=val(); } return o; }
function nStochRaw(h, l, c, n){ const hh=nHi(h, n), ll=nLo(l, n); return c.map((x, i)=>hh[i]===null || ll[i]===null || x===null ? null : (hh[i]>ll[i] ? 100*(x-ll[i])/(hh[i]-ll[i]) : 50)); }
const sub=(a, b, f)=>a.map((x, i)=>x===null || b[i]===null ? null : f(x, b[i]));

// ---------- registry shape ----------
const ids=Object.keys(D), CATS=ctx.IND_CATS.map(c=>c.id);
const NEED=['sma','ema','wma','hma','vwma','bb','kc','dc','vwap','ichimoku','psar','supertrend','pivots','vol','rsi','macd','stoch','stochrsi','atr','adx','cci','obv','mfi','willr','roc','mom','cmf','aroon','trix','ao','linreg'];
check('every indicator the spec lists is in IND_DEFS ('+ids.length+' in all)', NEED.every(k=>D[k]), NEED.filter(k=>!D[k]).join(','));
const isPair=x=>Array.isArray(x) && x.length===2 && x.every(s=>typeof s==='string' && s.length>0);
const shapeErr=[];
for (const id of ids){ const d=D[id];
  if (!isPair(d.n) || !isPair(d.d) || typeof d.sn!=='string') shapeErr.push(id+': names');
  if (!['main','sub'].includes(d.pane)) shapeErr.push(id+': pane');
  if (!CATS.includes(d.cat)) shapeErr.push(id+': cat');
  if (typeof d.f!=='function') shapeErr.push(id+': f');
  for (const k in d.p){ const s=d.p[k]; if (!isPair(s.n) || !(s.v>=s.min && s.v<=s.max) || !(s.step>0)) shapeErr.push(id+'.'+k+': param'); }
  const outs=Object.keys(d.out);
  if (!outs.length) shapeErr.push(id+': no outputs');
  for (const k of outs){ const o=d.out[k]; if (!isPair(o.n) || !/^#[0-9a-f]{6}$/i.test(o.c) || !['line','hist','dots','band'].includes(o.kind)) shapeErr.push(id+'.'+k+': out'); }
  const bands=outs.filter(k=>d.out[k].kind==='band'); if (bands.length && !(bands.length===2 && bands.includes('up') && bands.includes('dn'))) shapeErr.push(id+': band pair');
  if ((d.out.up && d.out.up.kind!=='band') || (d.out.dn && d.out.dn.kind!=='band')) shapeErr.push(id+': up/dn not band');
  if (d.lv && !d.lv.every(Number.isFinite)) shapeErr.push(id+': lv');
  if (d.range && !(d.range.length===2 && d.range[0]<d.range[1])) shapeErr.push(id+': range'); }
check('every definition has bilingual names, a pane, a category, valid params and outputs (bands as up/dn pairs)', shapeErr.length===0, shapeErr.join('; '));
check('every category has at least one indicator, and the categories are bilingual', CATS.every(c=>ids.some(id=>D[id].cat===c)) && ctx.IND_CATS.every(c=>isPair(c.n)));
check('the moving averages draw one output named "line" (as in the spec’s state example)', ['sma','ema','wma','hma','vwma','dema','tema'].every(id=>Object.keys(D[id].out).join()==='line'));
check('Volume is a sub-pane histogram with its MA', D.vol.pane==='sub' && D.vol.out.v.kind==='hist' && D.vol.out.ma.kind==='line' && D.vol.cat==='volume');

// ---------- vs naive on 600 random-walk bars ----------
const cmp=(name, got, want, tol)=>{ const r=same(got, want, tol); check(name, r===true, r); };
cmp('SMA 20 matches a naive window average', run('sma', BARS, { n:20 }).line, nSMA(C, 20));
cmp('SMA 250 (long period, rolling sum) matches naive', run('sma', BARS, { n:250 }).line, nSMA(C, 250));
cmp('EMA 20 matches naive (seeded with the SMA)', run('ema', BARS, { n:20 }).line, nEMA(C, 20));
cmp('EMA 200 matches naive', run('ema', BARS, { n:200 }).line, nEMA(C, 200));
cmp('WMA 20 matches naive', run('wma', BARS, { n:20 }).line, nWMA(C, 20));
cmp('WMA 300 (rolling numerator) matches naive', run('wma', BARS, { n:300 }).line, nWMA(C, 300));
{ const n=16, h=nWMA(sub(nWMA(C, 8), nWMA(C, 16), (a, b)=>2*a-b), 4); cmp('HMA 16 matches WMA(2·WMA(8) − WMA(16), 4)', run('hma', BARS, { n }).line, h); }
{ const h=nWMA(sub(nWMA(C, 10), nWMA(C, 21), (a, b)=>2*a-b), 4); cmp('HMA 21 (odd length: floor(n/2), floor(√n)) matches naive', run('hma', BARS, { n:21 }).line, h); }
{ const e1=nEMA(C, 10), e2=nEMA(e1, 10), e3=nEMA(e2, 10);
  cmp('DEMA 10 matches 2·EMA − EMA(EMA)', run('dema', BARS, { n:10 }).line, sub(e1, e2, (a, b)=>2*a-b));
  cmp('TEMA 10 matches 3·EMA − 3·EMA² + EMA³', run('tema', BARS, { n:10 }).line, e1.map((x, i)=>x===null || e2[i]===null || e3[i]===null ? null : 3*x-3*e2[i]+e3[i])); }
{ const n=20, w=C.map((_, i)=>{ if (i<n-1) return null; let a=0, b=0; for (let j=i-n+1;j<=i;j++){ a+=C[j]*V[j]; b+=V[j]; } return a/b; }); cmp('VWMA 20 matches Σ(close·vol)/Σvol', run('vwma', BARS, { n }).line, w); }
{ const n=25, w=C.map((_, i)=>{ if (i<n-1) return null; const ys=C.slice(i-n+1, i+1), xm=(n-1)/2, ym=ys.reduce((a, b)=>a+b)/n; let num=0, den=0; ys.forEach((y, j)=>{ num+=(j-xm)*(y-ym); den+=(j-xm)**2; }); const b=num/den; return ym+b*(n-1-xm); });
  cmp('LSMA 25 matches a least-squares fit per window (mean-centred)', run('lsma', BARS, { n }).line, w, 1e-8); }
{ const r=run('bb', BARS, { n:20, mult:2 }), m=nSMA(C, 20), s=nStd(C, 20);
  cmp('Bollinger basis = SMA 20', r.mid, m); cmp('Bollinger upper = SMA + 2σ (population σ)', r.up, sub(m, s, (a, b)=>a+2*b)); cmp('Bollinger lower = SMA − 2σ', r.dn, sub(m, s, (a, b)=>a-2*b));
  cmp('Bollinger Band Width = 100·(upper − lower)/basis', run('bbw', BARS, { n:20, mult:2 }).bbw, sub(m, s, (a, b)=>100*4*b/a)); }
cmp('Standard deviation 20 matches a two-pass σ', run('stdev', BARS, { n:20 }).sd, nStd(C, 20));
{ const cb=BTC.map(b=>b.c); cmp('Standard deviation on BTC-sized prices (≈90 000) has no cancellation error', run('stdev', BTC, { n:20 }).sd, nStd(cb, 20), 1e-7);
  cmp('Standard deviation 400 on BTC-sized prices', run('stdev', BTC, { n:400 }).sd, nStd(cb, 400), 1e-7); }
{ const r=run('kc', BARS, {}), m=nEMA(C, 20), a=nATR(BARS, 10);
  cmp('Keltner basis = EMA 20', r.mid, m); cmp('Keltner bands = EMA ± 2·ATR 10', r.up, sub(m, a, (x, y)=>x+2*y)); cmp('Keltner lower', r.dn, sub(m, a, (x, y)=>x-2*y)); }
{ const r=run('dc', BARS, { n:20 }), hh=nHi(H, 20), ll=nLo(L, 20);
  cmp('Donchian upper = highest high 20', r.up, hh); cmp('Donchian lower = lowest low 20', r.dn, ll); cmp('Donchian middle', r.mid, sub(hh, ll, (a, b)=>(a+b)/2)); }
{ const r=run('dc', BARS, { n:400 }); cmp('Donchian 400 (monotonic deque) matches naive', r.up, nHi(H, 400)); }
cmp('ATR 14 (Wilder) matches naive', run('atr', BARS, { n:14 }).atr, nATR(BARS, 14));
cmp('RSI 14 (Wilder) matches naive', run('rsi', BARS, { n:14 }).rsi, nRSI(C, 14));
cmp('RSI 2 matches naive', run('rsi', BARS, { n:2 }).rsi, nRSI(C, 2));
{ const r=run('macd', BARS, {}), m=sub(nEMA(C, 12), nEMA(C, 26), (a, b)=>a-b), s=nEMA(m, 9);
  cmp('MACD line = EMA 12 − EMA 26', r.macd, m); cmp('MACD signal = EMA 9 of MACD', r.signal, s); cmp('MACD histogram = MACD − signal', r.hist, sub(m, s, (a, b)=>a-b));
  check('MACD signal starts at bar 26+9−2 = 33', firstVal(r.signal)===33, firstVal(r.signal)); }
{ const r=run('stoch', BARS, {}), k=nSMA(nStochRaw(H, L, C, 14), 3); cmp('Stochastic %K (14, smooth 3) matches naive', r.k, k); cmp('Stochastic %D = SMA 3 of %K', r.d, nSMA(k, 3)); }
{ const rs=nRSI(C, 14), k=nSMA(nStochRaw(rs, rs, rs, 14), 3), r=run('stochrsi', BARS, {});
  cmp('Stochastic RSI %K matches naive', r.k, k); cmp('Stochastic RSI %D matches naive', r.d, nSMA(k, 3)); }
{ // ADX the StockCharts way: Wilder running sums (TR14 = TR14 − TR14/14 + TR), DX, then ADX
  const n=14, len=BARS.length, pdi=nulls(len), mdi=nulls(len), adx=nulls(len); let tr=0, pm=0, mm=0; const dx=[];
  for (let i=1;i<len;i++){ const b=BARS[i], a=BARS[i-1], up=b.h-a.h, dn=a.l-b.l, t=Math.max(b.h-b.l, Math.abs(b.h-a.c), Math.abs(b.l-a.c)), p=up>dn && up>0 ? up : 0, m=dn>up && dn>0 ? dn : 0;
    if (i<=n){ tr+=t; pm+=p; mm+=m; } else { tr=tr-tr/n+t; pm=pm-pm/n+p; mm=mm-mm/n+m; }
    if (i>=n){ pdi[i]=100*pm/tr; mdi[i]=100*mm/tr; dx.push({ i, v:100*Math.abs(pdi[i]-mdi[i])/(pdi[i]+mdi[i]) }); } }
  let a=0; for (let j=0;j<dx.length;j++){ if (j<n) { a+=dx[j].v; if (j===n-1){ a/=n; adx[dx[j].i]=a; } } else { a=(a*(n-1)+dx[j].v)/n; adx[dx[j].i]=a; } }
  const r=run('adx', BARS, {}); cmp('+DI 14 matches Wilder running sums', r.pdi, pdi); cmp('−DI 14 matches naive', r.mdi, mdi); cmp('ADX 14 matches naive', r.adx, adx);
  check('ADX starts at bar 2·14−1 = 27', firstVal(r.adx)===27, firstVal(r.adx)); }
{ const n=20, tp=BARS.map(b=>(b.h+b.l+b.c)/3), w=tp.map((x, i)=>{ if (i<n-1) return null; const win=tp.slice(i-n+1, i+1), m=win.reduce((a, b)=>a+b)/n, md=win.reduce((a, b)=>a+Math.abs(b-m), 0)/n; return (x-m)/(0.015*md); });
  cmp('CCI 20 matches naive', run('cci', BARS, { n }).cci, w); }
{ const hh=nHi(H, 14), ll=nLo(L, 14); cmp('Williams %R 14 matches naive', run('willr', BARS, {}).r, C.map((c, i)=>hh[i]===null ? null : -100*(hh[i]-c)/(hh[i]-ll[i]))); }
cmp('ROC 9 matches naive', run('roc', BARS, {}).roc, C.map((c, i)=>i<9 ? null : 100*(c-C[i-9])/C[i-9]));
cmp('Momentum 10 matches naive', run('mom', BARS, {}).mom, C.map((c, i)=>i<10 ? null : c-C[i-10]));
{ const m=BARS.map(b=>(b.h+b.l)/2); cmp('Awesome Oscillator = SMA 5 − SMA 34 of the midpoint', run('ao', BARS, {}).ao, sub(nSMA(m, 5), nSMA(m, 34), (a, b)=>a-b)); }
{ const e=nEMA(nEMA(nEMA(C, 18), 18), 18), t=e.map((x, i)=>x===null || !i || e[i-1]===null ? null : 100*(x-e[i-1])/e[i-1]), r=run('trix', BARS, {});
  cmp('TRIX 18 matches naive', r.trix, t); cmp('TRIX signal = EMA 9 of TRIX', r.signal, nEMA(t, 9)); }
{ const n=14, up=nulls(600), dn=nulls(600);
  for (let i=n;i<600;i++){ let hi=-Infinity, hj=0, lo=Infinity, lj=0; for (let j=i-n;j<=i;j++){ if (H[j]>=hi){ hi=H[j]; hj=j; } if (L[j]<=lo){ lo=L[j]; lj=j; } } up[i]=100*(n-(i-hj))/n; dn[i]=100*(n-(i-lj))/n; }
  const r=run('aroon', BARS, {}); cmp('Aroon up 14 matches naive', r.aup, up); cmp('Aroon down 14 matches naive', r.adn, dn); }
{ let s=0; const o=C.map((c, i)=>{ if (i) s+= c>C[i-1] ? V[i] : (c<C[i-1] ? -V[i] : 0); return s; }); cmp('OBV matches naive', run('obv', BARS, {}).obv, o); }
{ const n=14, tp=BARS.map(b=>(b.h+b.l+b.c)/3), w=tp.map((_, i)=>{ if (i<n) return null; let p=0, q=0; for (let j=i-n+1;j<=i;j++){ const f=tp[j]*V[j]; if (tp[j]>tp[j-1]) p+=f; else if (tp[j]<tp[j-1]) q+=f; } return q ? 100-100/(1+p/q) : 100; });
  cmp('MFI 14 matches naive', run('mfi', BARS, {}).mfi, w); }
{ const n=20, mf=BARS.map(b=>((b.c-b.l)-(b.h-b.c))/(b.h-b.l)*b.v), w=C.map((_, i)=>{ if (i<n-1) return null; let a=0, b=0; for (let j=i-n+1;j<=i;j++){ a+=mf[j]; b+=V[j]; } return a/b; });
  cmp('CMF 20 matches naive', run('cmf', BARS, {}).cmf, w);
  let s=0; cmp('Accumulation/Distribution matches naive', run('ad', BARS, {}).ad, mf.map(x=>s+=x)); }
{ const r=run('vol', BARS, {}); cmp('Volume = bar volume', r.v, V); cmp('Volume MA 20 matches naive', r.ma, nSMA(V, 20)); check('Volume dir is +1 on up candles, −1 on down candles', r.dir.every((d, i)=>d===(BARS[i].c>=BARS[i].o ? 1 : -1))); }
{ // VWAP straight from the definition: for each bar, loop back over the same UTC day (the bars start at 05:00, so the
  // first day is cut off: no VWAP there)
  const day=t=>Math.floor(t/864e5), vw=[], sd=[];
  for (let i=0;i<600;i++){ if (day(BARS[i].t)===day(BARS[0].t)){ vw.push(null); sd.push(null); continue; } let a=0, b=0; const js=[]; for (let j=i;j>=0 && day(BARS[j].t)===day(BARS[i].t);j--){ const tp=(BARS[j].h+BARS[j].l+BARS[j].c)/3; a+=tp*V[j]; b+=V[j]; js.push(j); }
    if (b===0){ let s=0; for (const j of js) s+=(BARS[j].h+BARS[j].l+BARS[j].c)/3; vw.push(s/js.length); sd.push(0); continue; }   // no volume yet today: plain average
    const m=a/b; let q=0; for (const j of js){ const tp=(BARS[j].h+BARS[j].l+BARS[j].c)/3; q+=V[j]*(tp-m)**2; } vw.push(m); sd.push(Math.sqrt(q/b)); }
  check('…the test bars include zero-volume bars (VWAP falls back to the plain average until volume arrives)', V.filter(x=>x===0).length>=10);
  const r=run('vwap', BARS, { mult:1, mult2:2 });
  cmp('VWAP (resets at UTC midnight, none for the cut-off first day) matches naive', r.vwap, vw); cmp('VWAP +1σ band matches naive', r.up, vw.map((m, i)=>m===null ? null : m+sd[i]), 1e-8); cmp('VWAP −2σ band matches naive', r.dn2, vw.map((m, i)=>m===null ? null : m-2*sd[i]), 1e-8);
  const w0=run('vwap', BARS, { mult:0 }, { sess0:true }).vwap; check('VWAP with sess0 (the first bar opens its session) fills the first day too', w0.every(x=>x!==null));
  const resets=BARS.map((b, i)=>i && day(b.t)!==day(BARS[i-1].t)).filter(Boolean).length; check('…and the test bars really cross several midnights', resets>=5, resets);
  const off=run('vwap', BARS, { mult:0, mult2:0 }); check('VWAP bands can be switched off (σ = 0 → no band)', off.up.every(x=>x===null) && off.dn2.every(x=>x===null) && off.vwap.every((x, i)=>(x!==null)===(day(BARS[i].t)!==day(BARS[0].t)))); }
{ const r=run('ichimoku', BARS, {}), mid=n=>sub(nHi(H, n), nLo(L, n), (a, b)=>(a+b)/2), tk=mid(9), kj=mid(26), A=sub(tk, kj, (a, b)=>(a+b)/2), B=mid(52), s=25;
  cmp('Ichimoku tenkan = midpoint of 9 bars', r.tenkan, tk); cmp('Ichimoku kijun = midpoint of 26 bars', r.kijun, kj);
  cmp('Ichimoku senkou A shifted 25 bars ahead (TradingView displacement 26)', r.up, C.map((_, i)=>i>=s ? A[i-s] : null));
  cmp('Ichimoku senkou B shifted ahead', r.dn, C.map((_, i)=>i>=s ? B[i-s] : null));
  cmp('Ichimoku chikou = close 25 bars later', r.chikou, C.map((_, i)=>i+s<600 ? C[i+s] : null));
  check('Ichimoku keeps the 25 future cloud values in result.ahead (not enumerable)', r.ahead && r.ahead.up.length===25 && eqArr(r.ahead.up, A.slice(575)) && eqArr(r.ahead.dn, B.slice(575)) && !Object.keys(r).includes('ahead') && D.ichimoku.ahead===25); }
{ // pivots: for each bar find the previous UTC day that has bars and read its high/low/close directly (the first day starts
  // at 05:00, so it is only partly covered: the day after it has no pivots)
  const day=t=>Math.floor(t/864e5), r=run('pivots', BARS, {}); let bad=null;
  for (let i=0;i<600 && !bad;i++){ const d=day(BARS[i].t), prevD=Math.max(...BARS.filter(b=>day(b.t)<d).map(b=>day(b.t)));
    if (!isFinite(prevD) || prevD===day(BARS[0].t)){ if (r.p[i]!==null) bad='first two days should be empty'; continue; }
    const pb=BARS.filter(b=>day(b.t)===prevD), ph=Math.max(...pb.map(b=>b.h)), pl=Math.min(...pb.map(b=>b.l)), pc=pb[pb.length-1].c, P=(ph+pl+pc)/3;
    if (!near(r.p[i], P) || !near(r.r1[i], 2*P-pl) || !near(r.s1[i], 2*P-ph) || !near(r.r2[i], P+ph-pl) || !near(r.s2[i], P-(ph-pl)) || !near(r.r3[i], P+2*(ph-pl)) || !near(r.s3[i], P-2*(ph-pl))) bad='bar '+i; }
  check('Pivot points (classic, previous UTC day) match naive on every bar', !bad, bad);
  // whole daily bars passed as context fill the partly covered first day
  const d0=day(BARS[0].t), hi=[{ t:d0*864e5, o:100, h:200, l:50, c:120, v:1 }], r2=run('pivots', BARS, {}, { hi }), i1=BARS.findIndex(b=>day(b.t)===d0+1), P=(200+50+120)/3;
  check('…and with whole daily bars as context the day after the cut-off one gets pivots from the daily bar', r.p[i1]===null && near(r2.p[i1], P) && near(r2.r3[i1], P+300) && near(r2.s3[i1], P-300) && r2.p.slice(0, i1).every(x=>x===null) && r2.p.slice(i1+100).every((x, k)=>near(x, r.p[i1+100+k])), i1); }
{ // Supertrend: a literal port of TradingView's pine_supertrend (direction −1 = up there)
  const f=3, atr=nATR(BARS, 10), len=600, U=nulls(len), Lb=nulls(len), S=nulls(len), bull=nulls(len), bear=nulls(len), dir=nulls(len);
  for (let i=0;i<len;i++){ if (atr[i]===null) continue; const b=BARS[i], m=(b.h+b.l)/2; let u=m+f*atr[i], l=m-f*atr[i];
    const pl=i && Lb[i-1]!==null ? Lb[i-1] : 0, pu=i && U[i-1]!==null ? U[i-1] : 0, pc=i ? BARS[i-1].c : null;
    l= l>pl || (pc!==null && pc<pl) ? l : pl; u= u<pu || (pc!==null && pc>pu) ? u : pu;
    let d; if (!i || atr[i-1]===null) d=1; else if (S[i-1]===U[i-1]) d= b.c>u ? -1 : 1; else d= b.c<l ? 1 : -1;
    S[i]= d===-1 ? l : u; U[i]=u; Lb[i]=l; dir[i]=-d; if (d===-1) bull[i]=l; else bear[i]=u; }
  const r=run('supertrend', BARS, {});
  cmp('Supertrend (10, 3) up-trend line matches TradingView’s algorithm', r.bull, bull); cmp('Supertrend down-trend line matches', r.bear, bear); cmp('Supertrend direction matches', r.dir, dir);
  check('…and the trend flips at least a few times on the random walk', dir.filter((d, i)=>i && d!==null && dir[i-1]!==null && d!==dir[i-1]).length>=3); }
{ const r=run('psar', BARS, {}); let bad=null;
  for (let i=1;i<600 && !bad;i++){ const s=r.sar[i]; if (s===null) bad='null at '+i; else if (!(s<=BARS[i].l+1e-12 || s>=BARS[i].h-1e-12)) bad='inside bar '+i; }
  check('Parabolic SAR: every dot is below the low (up-trend) or above the high (down-trend)', !bad, bad);
  const flips=r.sar.filter((s, i)=>i>1 && s!==null && r.sar[i-1]!==null && (s<BARS[i].l)!==(r.sar[i-1]<BARS[i-1].l)).length; check('Parabolic SAR flips sides several times on the random walk', flips>=5, flips); }
{ const n=100, r=run('linreg', BARS, { n, mult:2 }), ys=C.slice(500), xm=(n-1)/2, ym=ys.reduce((a, b)=>a+b)/n; let num=0, den=0; ys.forEach((y, j)=>{ num+=(j-xm)*(y-ym); den+=(j-xm)**2; });
  const b=num/den, fit=ys.map((_, j)=>ym+b*(j-xm)), sd=Math.sqrt(ys.reduce((a, y, j)=>a+(y-fit[j])**2, 0)/n);
  cmp('Linear regression channel: line over the last 100 bars matches a least-squares fit', r.mid, nulls(500).concat(fit), 1e-8);
  cmp('Linear regression channel: upper band = line + 2·σ of residuals', r.up, nulls(500).concat(fit.map(x=>x+2*sd)), 1e-8); }

// ---------- hand-computed tiny cases ----------
const mk=rows=>rows.map((r, i)=>({ t:T0+i*6e4, o:r[0], h:r[1], l:r[2], c:r[3], v:r[4]===undefined ? 1 : r[4] }));
const cl=cs=>mk(cs.map(c=>[c, c, c, c, 1]));
check('hand: SMA 3 of 1..5 = –, –, 2, 3, 4', eqArr(run('sma', cl([1,2,3,4,5]), { n:3 }).line, [null,null,2,3,4]));
check('hand: EMA 2 of 2,4,6,8 = –, 3, 5, 7', eqArr(run('ema', cl([2,4,6,8]), { n:2 }).line, [null,3,5,7]));
check('hand: WMA 3 of 1,2,3,4 = –, –, 14/6, 20/6', eqArr(run('wma', cl([1,2,3,4]), { n:3 }).line, [null,null,14/6,20/6]));
check('hand: RSI 2 of 1,2,3,2,3 = –, –, 100, 50, 75', eqArr(run('rsi', cl([1,2,3,2,3]), { n:2 }).rsi, [null,null,100,50,75]));
check('hand: ATR 2 with true ranges 2, 4, 1 = –, 3, 2', eqArr(run('atr', mk([[9,10,8,9],[9,13,9,12],[12,12,11,11.5]]), { n:2 }).atr, [null,3,2]));
check('hand: MACD (2, 3, 2) of 1..5 = –, –, 0.5, 0.5, 0.5 with signal 0.5 and histogram 0', (()=>{ const r=run('macd', cl([1,2,3,4,5]), { fast:2, slow:3, sig:2 }); return eqArr(r.macd, [null,null,.5,.5,.5]) && eqArr(r.signal, [null,null,null,.5,.5]) && eqArr(r.hist, [null,null,null,0,0]); })());
{ const b=mk([[9,10,8,9],[9,12,9,11],[11,11,7,8],[8,13,10,12]]);
  check('hand: Stochastic %K (3, 1, 1) = 20 then 83.33', eqArr(run('stoch', b, { k:3, sm:1, d:1 }).k, [null,null,20,500/6]));
  check('hand: Williams %R 3 = −80 then −16.67', eqArr(run('willr', b, { n:3 }).r, [null,null,-80,-100/6]));
  check('hand: Donchian 3 upper 12 → 13, lower 7', eqArr(run('dc', b, { n:3 }).up, [null,null,12,13]) && eqArr(run('dc', b, { n:3 }).dn, [null,null,7,7])); }
check('hand: ROC 2 of 10,11,12,13 = 20%, 18.18%', eqArr(run('roc', cl([10,11,12,13]), { n:2 }).roc, [null,null,20,200/11]));
check('hand: Momentum 2 of 10,11,12,13 = 2, 2', eqArr(run('mom', cl([10,11,12,13]), { n:2 }).mom, [null,null,2,2]));
check('hand: OBV with closes 10, 11, 10.5, 10.5, 12 = 0, 200, −100, −100, 400', eqArr(run('obv', mk([[10,10,10,10,100],[11,11,11,11,200],[10.5,10.5,10.5,10.5,300],[10.5,10.5,10.5,10.5,400],[12,12,12,12,500]]), {}).obv, [0,200,-100,-100,400]));
check('hand: CMF 2 of a bar closing ¾ up (vol 100) and one closing at the low (vol 100) = −0.25', eqArr(run('cmf', mk([[9,10,8,9.5,100],[9,10,8,8,100]]), { n:2 }).cmf, [null,-.25]));
check('hand: CCI 3 of typical prices 1, 2, 3 = 100', eqArr(run('cci', cl([1,2,3]), { n:3 }).cci, [null,null,100]));
{ const day=Date.UTC(2026,10,3), b=[{ t:day, o:10, h:10, l:10, c:10, v:1 }, { t:day+36e5, o:20, h:20, l:20, c:20, v:3 }, { t:day+864e5+6e4, o:30, h:30, l:30, c:30, v:2 }], r=run('vwap', b, { mult:1 });
  check('hand: VWAP 10, then (10·1 + 20·3)/4 = 17.5 with σ = √18.75, then resets to 30 after midnight', eqArr(r.vwap, [10,17.5,30]) && near(r.up[1], 17.5+Math.sqrt(18.75)) && near(r.dn[2], 30)); }
{ const day=Date.UTC(2026,10,3), b=[{ t:day+36e5, o:10, h:10, l:10, c:10, v:1 }, { t:day+72e5, o:20, h:20, l:20, c:20, v:3 }, { t:day+864e5, o:30, h:30, l:30, c:30, v:2 }], r=run('vwap', b, { mult:1 }), r0=run('vwap', b, { mult:1 }, { sess0:true });
  check('hand: a session that started before the first bar has no VWAP (null, not a partial value); sess0 keeps it', eqArr(r.vwap, [null,null,30]) && eqArr(r0.vwap, [10,17.5,30]), JSON.stringify(r.vwap)); }
{ const day=Date.UTC(2026,10,3), b=[{ t:day, o:9, h:12, l:9, c:11, v:1 }, { t:day+36e5, o:11, h:11, l:8, c:10, v:1 }, { t:day+864e5, o:10, h:10.5, l:9.5, c:10, v:1 }, { t:day+864e5+36e5, o:10, h:11, l:10, c:10.5, v:1 }], r=run('pivots', b, {});
  check('hand: classic pivots after a day with high 12, low 8, close 10 → P 10, R1 12, S1 8, R2 14, S2 6, R3 18, S3 2', r.p[0]===null && r.p[1]===null && [2,3].every(i=>r.p[i]===10 && r.r1[i]===12 && r.s1[i]===8 && r.r2[i]===14 && r.s2[i]===6 && r.r3[i]===18 && r.s3[i]===2)); }
{ const W=7*864e5, mon=Date.UTC(2026,10,2), b=[];   // daily bars → previous week (Mon–Sun) pivots; 2026-11-02 is a Monday
  for (let d=0;d<10;d++) b.push({ t:mon+d*864e5, o:100, h:100+d, l:100-d, c:100+d/2, v:1 });
  const r=run('pivots', b, {}), P=(106+94+103)/3;
  check('hand: on daily bars pivots come from the previous Monday–Sunday week', new Date(mon).getUTCDay()===1 && r.p.slice(0, 7).every(x=>x===null) && r.p.slice(7).every(x=>near(x, P)), JSON.stringify(r.p)); }
check('hand: Aroon 2 with highs 1, 3, 2, 2 → up 50 then 0', eqArr(run('aroon', mk([[1,1,1,1],[3,3,3,3],[2,2,2,2],[2,2,2,2]]), { n:2 }).aup, [null,null,50,0]));
{ const r=run('psar', mk([[9.5,10,9,9.5],[10.5,11,10,10.5],[11.5,12,11,11.5],[12.5,13,12,12.5],[12,12.5,8,8.5]]), {});
  check('hand: Parabolic SAR 9, 9, 9.12, then flips above to 13 on the drop', eqArr(r.sar, [null,9,9,9.12,13]), JSON.stringify(r.sar)); }
{ const h=F('indHeikin')([{ t:1, o:10, h:12, l:9, c:11, v:5 }, { t:2, o:11, h:13, l:10, c:12, v:6 }]);
  check('hand: Heikin-Ashi bars (close = OHLC/4, open = previous HA midpoint)', JSON.stringify(h)===JSON.stringify([{ t:1, o:10.5, h:12, l:9, c:10.5, v:5 }, { t:2, o:10.5, h:13, l:10, c:11.5, v:6 }]), JSON.stringify(h)); }
{ const hk=F('indHeikin')(BARS); let ok=hk.length===600;
  for (let i=1;i<600 && ok;i++){ const b=BARS[i], c=(b.o+b.h+b.l+b.c)/4, o=(hk[i-1].o+hk[i-1].c)/2; ok=near(hk[i].c, c) && near(hk[i].o, o) && hk[i].h===Math.max(b.h, o, hk[i].c) && hk[i].l===Math.min(b.l, o, hk[i].c) && hk[i].t===b.t; }
  check('Heikin-Ashi on 600 bars follows the recursion and keeps t', ok); }
{ const line=cl(Array.from({ length:80 }, (_, i)=>5+2*i)), want=line.map(b=>b.c);
  const eqTail=(a, from)=>a.slice(from).every((x, i)=>near(x, want[from+i], 1e-9)) && a.slice(0, from).every(x=>x===null);
  check('a straight line: HMA 4, DEMA 10 and TEMA 10 sit exactly on it (no lag)', eqTail(run('hma', line, { n:4 }).line, 4) && eqTail(run('dema', line, { n:10 }).line, 18) && eqTail(run('tema', line, { n:10 }).line, 27));
  const lr=run('linreg', line, { n:30 }); check('a straight line: LSMA and the regression channel are the line itself, bands collapse', eqTail(run('lsma', line, { n:25 }).line, 24) && lr.mid.slice(50).every((x, i)=>near(x, want[50+i])) && lr.up.slice(50).every((x, i)=>near(x, want[50+i]))); }
{ const r=run('ichimoku', mk([[1,2,0,1],[2,4,2,3],[3,6,4,5]]), { conv:1, base:1, spanB:1, disp:2 });
  check('hand: Ichimoku (1, 1, 1, 2): span A = previous midpoint, chikou = next close, ahead = last midpoint', eqArr(r.up, [null,1,3]) && eqArr(r.dn, [null,1,3]) && eqArr(r.chikou, [3,5,null]) && eqArr(r.ahead.up, [5])); }

// ---------- edge cases: every indicator ----------
const allFinite=(r, len, id)=>{ const keys=Object.keys(D[id].out).concat('dir' in r ? ['dir'] : []);
  for (const k of keys){ const a=r[k]; if (!Array.isArray(a) || a.length!==len) return `${id}.${k} length ${a && a.length} ≠ ${len}`; for (const x of a) if (x!==null && !(typeof x==='number' && isFinite(x))) return `${id}.${k} has ${x}`; }
  return true; };
const sweep=(name, bars, p)=>{ const bad=[]; for (const id of ids){ let r; try { r=D[id].f(bars, p); } catch (e){ bad.push(id+' threw '+e.message); continue; } const ok=allFinite(r, Array.isArray(bars) ? bars.length : 0, id); if (ok!==true) bad.push(ok); }
  check(name, bad.length===0 && !ctx.IND_ERR(), bad.slice(0, 4).join('; ')+(ctx.IND_ERR() ? ' err:'+JSON.stringify(ctx.IND_ERR()) : '')); };
sweep('empty bars: every indicator returns empty arrays for every output', []);
sweep('null / undefined bars are treated as empty', null); sweep('undefined bars', undefined);
sweep('one bar: no NaN / Infinity, arrays of length 1', BARS.slice(0, 1));
sweep('5 bars (shorter than most periods): aligned arrays, no NaN', BARS.slice(0, 5));
{ const r=run('ema', BARS.slice(0, 5), { n:20 }), b=run('bb', BARS.slice(0, 5), {}), m=run('macd', BARS.slice(0, 5), {});
  check('bars shorter than the period → all null (EMA 20, Bollinger 20, MACD on 5 bars)', r.line.every(x=>x===null) && b.up.every(x=>x===null) && m.signal.every(x=>x===null)); }
const FLAT=Array.from({ length:300 }, (_, i)=>({ t:T0+i*M15, o:50, h:50, l:50, c:50, v:0 }));
sweep('300 flat bars with zero volume: no NaN / Infinity anywhere', FLAT);
sweep('300 flat bars with volume', FLAT.map(b=>({ ...b, v:10 })));
{ const r=k=>run(k, FLAT, {}); const last=(k, o)=>r(k)[o][299];
  check('flat prices give the neutral values: RSI 50, Stoch 50, %R −50, CCI 0, CMF 0, MFI 50, ATR 0, σ 0, ADX 0', last('rsi','rsi')===50 && last('stoch','k')===50 && last('willr','r')===-50 && last('cci','cci')===0 && last('cmf','cmf')===0 && last('mfi','mfi')===50 && last('atr','atr')===0 && last('stdev','sd')===0 && last('adx','adx')===0 && last('bb','up')===50 && last('vwap','vwap')===50 && last('vwma','line')===50); }
sweep('random walk with default params: every output finite', BARS);
sweep('BTC-sized prices: every output finite', BTC);
sweep('bars without a volume field', BARS.slice(0, 120).map(({ v, ...b })=>b));
{ const lo={}, hi={}; for (const id of ids){ for (const k in D[id].p){ lo[k]=-1e9; hi[k]=1e9; } }
  sweep('absurd params (−1e9) are clamped to the minimum', BARS.slice(0, 200), lo); sweep('absurd params (1e9) are clamped to the maximum', BARS.slice(0, 200), hi); }
check('params: missing → default, strings parsed, out of range clamped, whole-number steps rounded', JSON.stringify(F('indParams')('ema', {}))==='{"n":20}' && F('indParams')('ema', { n:'50' }).n===50 && F('indParams')('ema', { n:-3 }).n===1 && F('indParams')('ema', { n:9.6 }).n===10 && F('indParams')('psar', { start:0.0234 }).start===0.0234 && F('indParams')('ema', { n:'abc' }).n===20);
check('f() without params uses the defaults', eqArr(run('ema', BARS).line, run('ema', BARS, { n:20 }).line) && eqArr(run('macd', BARS).hist, run('macd', BARS, { fast:12, slow:26, sig:9 }).hist));
check('a null bar in the input is skipped, not a crash', run('sma', [null, ...BARS.slice(0, 30)], { n:5 }).line.length===30);
check('indDefaults / indColors / indLabel', JSON.stringify(F('indDefaults')('macd'))==='{"fast":12,"slow":26,"sig":9}' && F('indColors')('ema').line==='#f5a524' && F('indLabel')({ id:'macd', p:{} })==='MACD 12 26 9' && F('indLabel')({ id:'bb', p:{ n:30 } })==='BB 30 2' && F('indLabel')({ id:'obv', p:{} })==='OBV' && F('indLabel')({ id:'nope' })==='' && F('indLabel')({ id:'vol', p:{} })==='Vol 20' && F('indLabel')({ id:'vol', p:{} }, 'tr')==='Hcm 20' && F('indLabel')({ id:'macd', p:{} }, 'tr')==='MACD 12 26 9');
check('outputs that mean up / down are marked for the theme colours (dir ±1)', D.supertrend.out.bull.dir===1 && D.supertrend.out.bear.dir===-1 && D.adx.out.pdi.dir===1 && D.adx.out.mdi.dir===-1 && D.ichimoku.out.up.dir===1 && D.ichimoku.out.dn.dir===-1 && D.pivots.out.r1.dir===-1 && D.pivots.out.s1.dir===1 && !D.pivots.out.p.dir);
check('indRun runs by id and returns {} for an unknown id', eqArr(F('indRun')('sma', BARS, { n:9 }).line, nSMA(C, 9)) && JSON.stringify(F('indRun')('nope', BARS))==='{}');
check('f() does not modify the bars it is given', (()=>{ const b=JSON.stringify(BARS); for (const id of ids) D[id].f(BARS, {}); F('indHeikin')(BARS); return JSON.stringify(BARS)===b; })());
check('Heikin-Ashi of empty / missing input is empty', F('indHeikin')([]).length===0 && F('indHeikin')(null).length===0);

// ---------- indCache ----------
{ ctx.IND_LRU.clear(); let calls=0; const fn=()=>{ calls++; return { x:calls }; };
  const a=F('indCache')('k1', fn), b=F('indCache')('k1', fn); check('indCache computes once and returns the same object', a===b && calls===1);
  for (let i=0;i<70;i++) F('indCache')('n'+i, fn);
  check('indCache keeps at most 64 entries', ctx.IND_LRU.size===64, ctx.IND_LRU.size);
  calls=0; F('indCache')('k1', fn); check('…dropping the least recently used first', calls===1);
  ctx.IND_LRU.clear(); F('indCache')('a', ()=>1); F('indCache')('b', ()=>2); F('indCache')('a', ()=>9); for (let i=0;i<63;i++) F('indCache')('z'+i, ()=>0);
  check('…and a recently read entry survives eviction', ctx.IND_LRU.has('a') && !ctx.IND_LRU.has('b')); }

// ---------- speed ----------
{ seed=999; const big=walk(5000, T0, 6e4, 30000, 0); let t=Date.now(); for (const id of ids) D[id].f(big, {}); const all=Date.now()-t;
  check('all '+ids.length+' indicators on 5000 bars in under 400 ms', all<400, all+' ms');
  const time=fn=>{ const t0=process.hrtime.bigint(); for (let k=0;k<5;k++) fn(); return Number(process.hrtime.bigint()-t0)/5e6; };
  const ts=time(()=>run('sma', big, { n:2 })), tl=time(()=>run('sma', big, { n:1000 })), ws=time(()=>run('wma', big, { n:2 })), wl=time(()=>run('wma', big, { n:1000 })), ds=time(()=>run('dc', big, { n:2 })), dl=time(()=>run('dc', big, { n:500 }));
  check('long periods cost about the same as short ones (SMA, WMA, Donchian 1000 vs 2: O(n), not O(n·period))', tl<ts*6+2 && wl<ws*6+2 && dl<ds*6+2, `sma ${ts.toFixed(2)}/${tl.toFixed(2)} wma ${ws.toFixed(2)}/${wl.toFixed(2)} dc ${ds.toFixed(2)}/${dl.toFixed(2)} ms`);
  check('rolling sums stay exact over 5000 bars (SMA 7 vs naive)', same(run('sma', big, { n:7 }).line, nSMA(big.map(b=>b.c), 7), 1e-10)===true); }

console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);

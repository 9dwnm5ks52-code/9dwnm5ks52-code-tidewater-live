// Tidewater Live: chart indicators (Piece 1 of the pro chart, prefix IND / ind). Pure math, no DOM.
//
// IND_DEFS[id] = { n:[en,tr], sn:'short name', d:[en,tr] one-line description, cat:'trend'|'momentum'|'volatility'|
//   'volume'|'other', pane:'main'|'sub', p:{ name:{ v:default, min, max, step, n:[en,tr] } },
//   out:{ key:{ n:[en,tr], c:'#hex', kind:'line'|'hist'|'dots'|'band' } }, lv?:[levels], range?:[lo,hi],
//   f(bars, p) → { key: Array(bars.length) of number|null } }
// - Outputs are aligned to `bars` and are null until the indicator has warmed up. f() never returns NaN/Infinity
//   (they become null), never throws, and fills in missing / out-of-range params from the defaults (p may be omitted).
// - kind:'band' outputs come in pairs named `up` / `dn`; the renderer shades between them.
// - kind:'hist' draws bars from 0, coloured by sign. Volume ('vol') is the exception: colour each bar by `dir`
//   (+1 close ≥ open, −1 otherwise), an extra array in its result that is not listed in `out`.
// - Supertrend also returns `dir` (+1 up-trend, −1 down-trend) next to its `bull` / `bear` lines.
// - Ichimoku follows TradingView: with displacement D the leading spans are plotted D−1 bars ahead and the lagging
//   span D−1 bars back (the current bar counts as the first). In the result, `up` (Senkou A) and `dn` (Senkou B) are
//   shifted into the same index space as the bars, so the values that fall beyond the last bar are dropped from them;
//   those future values are kept in the non-enumerable `result.ahead = { up:[…], dn:[…] }` (length D−1, for the bars
//   after the last one) and IND_DEFS.ichimoku.ahead holds D−1 for the default D.
// - Pivot points (classic: R3 = P + 2(H − L), S3 = P − 2(H − L)) use the previous period: the previous UTC day on
//   intraday bars, the previous week (Mon–Sun) on daily bars, the previous month on weekly bars. A period the bars only
//   partly cover (the first one, when the bars start more than one bar after its start) is never used: pivots are null
//   there rather than wrong. f(bars, p, x) takes optional context x = { hi:[bars] }: whole-period bars (e.g. daily bars
//   for an intraday chart) that supply each period's high / low / close when the chart's own bars do not cover it.
// - VWAP resets at UTC midnight (so on daily or weekly bars every bar is its own session: VWAP = typical price). A session
//   that started before the first bar (a 24-hour market cut off by the window) has no VWAP (null) instead of a partial
//   one; pass x = { sess0:true } when the first bar is known to open its session (e.g. a stock's first minute).
// - Outputs that mean a direction (Supertrend up / down, ±DI, the Ichimoku cloud spans, pivot resistance / support) carry
//   dir:+1 / −1 so the chart can draw them in the theme's --gain / --loss colours (colour-blind mode) by default.
// - Where a ratio is 0/0 on perfectly flat prices: RSI / MFI 50, Stochastic / Stoch RSI 50, Williams %R −50,
//   CCI 0, CMF 0.
// Also exported: indHeikin(bars), indCache(key, fn), indRun(id, bars, p), indParams(id, p), indDefaults(id),
// indColors(id), indLabel(ind, lang), indShort(id, lang), IND_CATS, and the series helpers indSMA indEMA indRMA indWMA indSum indStdev indExt indTR.

const IND_N = 64;                       // indCache size
const IND_DAY = 864e5;

function indNum(x){ return typeof x==='number' && isFinite(x); }
function indNulls(n){ return new Array(n).fill(null); }
function indCol(bars, k){ const n=bars.length, a=new Array(n); for (let i=0;i<n;i++){ const x=bars[i] && bars[i][k]; a[i]= k==='v' ? (indNum(+x) ? +x : 0) : (x==null ? null : +x); } return a; }

// rolling sum of the last n consecutive valid values (a null / non-number restarts the window). The sum is recomputed
// exactly every n outputs so floating-point drift stays bounded; total cost O(len).
function indSum(src, n){
  const len=src.length, out=indNulls(len); let s=0, cnt=0, k=0;
  for (let i=0;i<len;i++){
    const x=src[i];
    if (!indNum(x)){ s=0; cnt=0; k=0; continue; }
    cnt++; s+=x; if (cnt>n) s-=src[i-n];
    if (cnt>=n){ if (++k>=n){ k=0; s=0; for (let j=i-n+1;j<=i;j++) s+=src[j]; } out[i]=s; }
  }
  return out;
}
function indSMA(src, n){ const s=indSum(src, n); for (let i=0;i<s.length;i++) if (s[i]!==null) s[i]/=n; return s; }
// weighted moving average, weights 1..n (newest heaviest), O(len) with periodic exact resync
function indWMA(src, n){
  const len=src.length, out=indNulls(len), den=n*(n+1)/2; let S=0, W=0, cnt=0, k=0;
  for (let i=0;i<len;i++){
    const x=src[i];
    if (!indNum(x)){ S=0; W=0; cnt=0; k=0; continue; }
    cnt++;
    if (cnt<=n){ W+=cnt*x; S+=x; } else { W+=n*x-S; S+=x-src[i-n]; }
    if (cnt>=n){
      if (++k>=n){ k=0; S=0; W=0; for (let j=0;j<n;j++){ const y=src[i-n+1+j]; S+=y; W+=(j+1)*y; } }
      out[i]=W/den;
    }
  }
  return out;
}
// exponential smoothing seeded with the simple average of the first n valid values (TradingView / StockCharts)
function indEMAx(src, n, a){
  const len=src.length, out=indNulls(len); let e=null, cnt=0, s=0;
  for (let i=0;i<len;i++){
    const x=src[i];
    if (!indNum(x)){ e=null; cnt=0; s=0; continue; }
    if (e===null){ cnt++; s+=x; if (cnt===n){ e=s/n; out[i]=e; } }
    else { e=a*x+(1-a)*e; out[i]=e; }
  }
  return out;
}
function indEMA(src, n){ return indEMAx(src, n, 2/(n+1)); }
function indRMA(src, n){ return indEMAx(src, n, 1/n); }          // Wilder's smoothing
// population standard deviation over n values (as TradingView ta.stdev / StockCharts), from rolling sums of values
// shifted by the first valid value (keeps the squares small, so no cancellation on high prices)
function indStdev(src, n){
  const len=src.length; let ref=0; for (let i=0;i<len;i++) if (indNum(src[i])){ ref=src[i]; break; }
  const d=src.map(x=>indNum(x) ? x-ref : null), d2=d.map(x=>x===null ? null : x*x), s=indSum(d, n), s2=indSum(d2, n), out=indNulls(len);
  for (let i=0;i<len;i++) if (s[i]!==null){ const m=s[i]/n; let v=s2[i]/n-m*m; const sc=s2[i]/n; if (!(v>1e-12*sc)) v=0; out[i]=Math.sqrt(v); }
  return out;
}
// highest (isMax) or lowest value over the last n valid values, with the index where it sits (the most recent one on
// ties); monotonic deque, O(len)
function indExt(src, n, isMax){
  const len=src.length, v=indNulls(len), idx=indNulls(len), dq=new Int32Array(len||1); let h=0, t=0, cnt=0;
  for (let i=0;i<len;i++){
    const x=src[i];
    if (!indNum(x)){ h=0; t=0; cnt=0; continue; }
    cnt++;
    while (t>h && (isMax ? src[dq[t-1]]<=x : src[dq[t-1]]>=x)) t--;
    dq[t++]=i;
    if (dq[h]<=i-n) h++;
    if (cnt>=n){ v[i]=src[dq[h]]; idx[i]=dq[h]; }
  }
  return { v, idx };
}
// true range; the first bar uses high − low
function indTR(bars){ const n=bars.length, a=new Array(n); for (let i=0;i<n;i++){ const b=bars[i]; a[i]= i ? Math.max(b.h-b.l, Math.abs(b.h-bars[i-1].c), Math.abs(b.l-bars[i-1].c)) : b.h-b.l; } return a; }
function indOp(a, b, f){ const n=a.length, o=indNulls(n); for (let i=0;i<n;i++) if (a[i]!==null && b[i]!==null) o[i]=f(a[i], b[i]); return o; }
function indTP(bars){ return bars.map(b=>(b.h+b.l+b.c)/3); }
function indHL2(bars){ return bars.map(b=>(b.h+b.l)/2); }
function indRSIs(c, n){
  const len=c.length, g=indNulls(len), l=indNulls(len), out=indNulls(len);
  for (let i=1;i<len;i++){ const d=c[i]-c[i-1]; g[i]=d>0 ? d : 0; l[i]=d<0 ? -d : 0; }
  const ag=indRMA(g, n), al=indRMA(l, n);
  for (let i=0;i<len;i++) if (ag[i]!==null) out[i]= al[i]===0 ? (ag[i]===0 ? 50 : 100) : (ag[i]===0 ? 0 : 100-100/(1+ag[i]/al[i]));
  return out;
}
// stochastic of a series against highs/lows (same array for all three for Stoch RSI)
function indStochRaw(h, l, c, n){ const hh=indExt(h, n, true).v, ll=indExt(l, n, false).v, out=indNulls(c.length);
  for (let i=0;i<c.length;i++) if (hh[i]!==null && ll[i]!==null && c[i]!==null) out[i]= hh[i]-ll[i]>0 ? 100*(c[i]-ll[i])/(hh[i]-ll[i]) : 50;
  return out; }
// bar spacing in ms (smallest positive gap among the first bars)
function indStep(bars){ let m=Infinity; for (let i=1;i<Math.min(bars.length, 200);i++){ const d=bars[i].t-bars[i-1].t; if (d>0 && d<m) m=d; } return m===Infinity ? 6e4 : m; }
function indDayKey(t){ return Math.floor(t/IND_DAY); }
function indWeekKey(t){ return Math.floor((t-4*IND_DAY)/(7*IND_DAY)); }       // weeks start Monday (1970-01-05)
function indMonthKey(t){ const d=new Date(t); return d.getUTCFullYear()*12+d.getUTCMonth(); }

const IND_CATS = [
  { id:'trend', n:['Trend','Trend'] },
  { id:'momentum', n:['Momentum','Momentum'] },
  { id:'volatility', n:['Volatility','Oynaklık'] },
  { id:'volume', n:['Volume','Hacim'] },
  { id:'other', n:['Other','Diğer'] },
];
const INDP = {
  n:(v, mx)=>({ v, min:1, max:mx||500, step:1, n:['Length','Uzunluk'] }),
  mult:(v)=>({ v, min:0.1, max:10, step:0.1, n:['Multiplier','Çarpan'] }),
};
const INDO = (en, tr, c, kind)=>({ n:[en, tr], c, kind:kind||'line' });
const INDD = (o, dir)=>Object.assign(o, { dir });   // an output that means up (+1) or down (−1)
function indMA(fn, sn, en, tr, c, d){ return { n:[en, tr], sn, d, cat:'trend', pane:'main', p:{ n:INDP.n(20, 1000) }, out:{ line:INDO('MA','Ortalama', c) }, f:(bars, p)=>({ line:fn(indCol(bars,'c'), p.n) }) }; }

const IND_DEFS = {
  // ---------------- trend: moving averages ----------------
  sma: indMA(indSMA, 'SMA', 'Simple Moving Average', 'Basit Hareketli Ortalama', '#2962ff', ['Average close of the last N bars.','Son N mumun kapanış ortalaması.']),
  ema: indMA(indEMA, 'EMA', 'Exponential Moving Average', 'Üssel Hareketli Ortalama', '#f5a524', ['Moving average that weights recent bars more.','Son mumlara daha çok ağırlık veren ortalama.']),
  wma: indMA(indWMA, 'WMA', 'Weighted Moving Average', 'Ağırlıklı Hareketli Ortalama', '#ab47bc', ['Linearly weighted average: the newest bar counts most.','Doğrusal ağırlıklı ortalama: en yeni mum en çok sayılır.']),
  hma: indMA((c, n)=>{ const a=indWMA(c, Math.max(1, Math.floor(n/2))), b=indWMA(c, n); return indWMA(indOp(a, b, (x, y)=>2*x-y), Math.max(1, Math.floor(Math.sqrt(n)))); },
    'HMA', 'Hull Moving Average', 'Hull Hareketli Ortalaması', '#00acc1', ['Fast, smooth average with little lag.','Gecikmesi az, hızlı ve yumuşak ortalama.']),
  dema: indMA((c, n)=>{ const e1=indEMA(c, n), e2=indEMA(e1, n); return indOp(e1, e2, (x, y)=>2*x-y); },
    'DEMA', 'Double EMA', 'Çift Üssel Ortalama', '#26a69a', ['2×EMA − EMA of EMA: less lag than an EMA.','2×EMA − EMA’nın EMA’sı: EMA’dan daha az gecikir.']),
  tema: indMA((c, n)=>{ const e1=indEMA(c, n), e2=indEMA(e1, n), e3=indEMA(e2, n); return indOp(indOp(e1, e2, (x, y)=>3*x-3*y), e3, (x, y)=>x+y); },
    'TEMA', 'Triple EMA', 'Üçlü Üssel Ortalama', '#ec407a', ['3×EMA − 3×EMA² + EMA³: very responsive average.','3×EMA − 3×EMA² + EMA³: çok hızlı tepki veren ortalama.']),
  vwma: { n:['Volume-Weighted Moving Average','Hacim Ağırlıklı Hareketli Ortalama'], sn:'VWMA', cat:'trend', pane:'main', d:['Average close weighted by each bar’s volume.','Her mumun hacmine göre ağırlıklandırılmış kapanış ortalaması.'],
    p:{ n:INDP.n(20, 1000) }, out:{ line:INDO('MA','Ortalama','#7e57c2') },
    f(bars, p){ const c=indCol(bars,'c'), v=indCol(bars,'v'), cv=indSum(c.map((x, i)=>x*v[i]), p.n), sv=indSum(v, p.n), sm=indSMA(c, p.n);
      return { line:cv.map((x, i)=>x===null ? null : (sv[i]>0 ? x/sv[i] : sm[i])) }; } },
  lsma: { n:['Least Squares Moving Average','En Küçük Kareler Ortalaması'], sn:'LSMA', cat:'trend', pane:'main', d:['End point of the best-fit straight line over the last N bars.','Son N muma oturtulan doğrunun son noktası.'],
    p:{ n:INDP.n(25, 1000) }, out:{ line:INDO('LSMA','LSMA','#8d6e63') },
    f(bars, p){ const n=p.n, c=indCol(bars,'c'), Sy=indSum(c, n), Wn=indWMA(c, n), Sx=n*(n-1)/2, Sxx=(n-1)*n*(2*n-1)/6, den=n*Sxx-Sx*Sx;
      return { line:Sy.map((sy, i)=>{ if (sy===null) return null; if (den===0) return c[i]; const sxy=Wn[i]*n*(n+1)/2-sy, b=(n*sxy-Sx*sy)/den, a=(sy-b*Sx)/n; return a+b*(n-1); }) }; } },
  // ---------------- trend: systems ----------------
  ichimoku: { n:['Ichimoku Cloud','Ichimoku Bulutu'], sn:'Ichimoku', cat:'trend', pane:'main', ahead:25, d:['Conversion and base lines with a cloud plotted ahead.','Dönüşüm ve taban çizgileri ile ileriye çizilen bulut.'],
    p:{ conv:{ v:9, min:1, max:200, step:1, n:['Conversion line','Dönüşüm çizgisi'] }, base:{ v:26, min:1, max:300, step:1, n:['Base line','Taban çizgisi'] },
        spanB:{ v:52, min:1, max:500, step:1, n:['Leading span B','Öncü açıklık B'] }, disp:{ v:26, min:1, max:300, step:1, n:['Displacement','Kaydırma'] } },
    out:{ tenkan:INDO('Conversion (Tenkan)','Dönüşüm (Tenkan)','#2962ff'), kijun:INDO('Base (Kijun)','Taban (Kijun)','#b71c1c'), chikou:INDO('Lagging span','Gecikmeli açıklık','#43a047'),
          up:INDD(INDO('Leading span A','Öncü açıklık A','#26a69a','band'), 1), dn:INDD(INDO('Leading span B','Öncü açıklık B','#ef5350','band'), -1) },
    f(bars, p){
      const h=indCol(bars,'h'), l=indCol(bars,'l'), c=indCol(bars,'c'), len=bars.length, s=p.disp-1;
      const mid=n=>indOp(indExt(h, n, true).v, indExt(l, n, false).v, (a, b)=>(a+b)/2);
      const tenkan=mid(p.conv), kijun=mid(p.base), A=indOp(tenkan, kijun, (a, b)=>(a+b)/2), B=mid(p.spanB);
      const up=indNulls(len), dn=indNulls(len), chikou=indNulls(len);
      for (let i=0;i<len;i++){ if (i-s>=0){ up[i]=A[i-s]; dn[i]=B[i-s]; } if (i+s<len) chikou[i]=c[i+s]; }
      const r={ tenkan, kijun, chikou, up, dn }, au=[], ad=[];
      for (let k=0;k<s;k++){ const j=len-s+k; au.push(j>=0 ? A[j] : null); ad.push(j>=0 ? B[j] : null); }
      Object.defineProperty(r, 'ahead', { value:{ up:au, dn:ad }, enumerable:false });
      return r; } },
  psar: { n:['Parabolic SAR','Parabolik SAR'], sn:'SAR', cat:'trend', pane:'main', d:['Stop-and-reverse dots that trail the trend.','Trendi takip eden dur-ve-dön noktaları.'],
    p:{ start:{ v:0.02, min:0.001, max:1, step:0.001, n:['Start','Başlangıç'] }, inc:{ v:0.02, min:0.001, max:1, step:0.001, n:['Increment','Artış'] }, max:{ v:0.2, min:0.01, max:1, step:0.01, n:['Maximum','Azami'] } },
    out:{ sar:INDO('SAR','SAR','#2962ff','dots') },
    f(bars, p){   // TradingView ta.sar
      const len=bars.length, out=indNulls(len); if (len<2) return { sar:out };
      let res, ext, acc, below;
      for (let i=1;i<len;i++){
        const b=bars[i]; let first=false;
        if (i===1){ if (b.c>bars[0].c){ below=true; ext=b.h; res=bars[0].l; } else { below=false; ext=b.l; res=bars[0].h; } first=true; acc=p.start; }
        res=res+acc*(ext-res);
        if (below){ if (res>b.l){ first=true; below=false; res=Math.max(b.h, ext); ext=b.l; acc=p.start; } }
        else if (res<b.h){ first=true; below=true; res=Math.min(b.l, ext); ext=b.h; acc=p.start; }
        if (!first){ if (below){ if (b.h>ext){ ext=b.h; acc=Math.min(acc+p.inc, p.max); } } else if (b.l<ext){ ext=b.l; acc=Math.min(acc+p.inc, p.max); } }
        if (below){ res=Math.min(res, bars[i-1].l); if (i>1) res=Math.min(res, bars[i-2].l); }
        else { res=Math.max(res, bars[i-1].h); if (i>1) res=Math.max(res, bars[i-2].h); }
        out[i]=res;
      }
      return { sar:out }; } },
  supertrend: { n:['Supertrend','Supertrend'], sn:'Supertrend', cat:'trend', pane:'main', d:['ATR-based trailing line that flips with the trend.','Trend dönünce yön değiştiren, ATR tabanlı takip çizgisi.'],
    p:{ n:{ v:10, min:1, max:200, step:1, n:['ATR length','ATR uzunluğu'] }, mult:INDP.mult(3) },
    out:{ bull:INDD(INDO('Up trend','Yükseliş trendi','#22ab94'), 1), bear:INDD(INDO('Down trend','Düşüş trendi','#f23645'), -1) },
    f(bars, p){   // TradingView ta.supertrend (dir here: +1 up, −1 down)
      const len=bars.length, atr=indRMA(indTR(bars), p.n), bull=indNulls(len), bear=indNulls(len), dir=indNulls(len);
      let pu=0, pl=0, pd=null, pc=null;
      for (let i=0;i<len;i++){
        const b=bars[i];
        if (atr[i]===null){ pc=b.c; continue; }
        const m=(b.h+b.l)/2; let ub=m+p.mult*atr[i], lb=m-p.mult*atr[i];
        if (pd!==null){ lb= lb>pl || pc<pl ? lb : pl; ub= ub<pu || pc>pu ? ub : pu; }
        const d= pd===null ? -1 : (pd===-1 ? (b.c>ub ? 1 : -1) : (b.c<lb ? -1 : 1));
        if (d===1) bull[i]=lb; else bear[i]=ub;
        dir[i]=d; pd=d; pu=ub; pl=lb; pc=b.c;
      }
      return { bull, bear, dir }; } },
  adx: { n:['ADX / Directional Movement','ADX / Yönsel Hareket'], sn:'ADX', cat:'trend', pane:'sub', lv:[20], range:[0,100], d:['Trend strength (ADX) with +DI and −DI.','Trend gücü (ADX), +DI ve −DI ile.'],
    p:{ n:{ v:14, min:1, max:200, step:1, n:['DI length','DI uzunluğu'] }, sm:{ v:14, min:1, max:200, step:1, n:['ADX smoothing','ADX yumuşatma'] } },
    out:{ adx:INDO('ADX','ADX','#f5a524'), pdi:INDD(INDO('+DI','+DI','#22ab94'), 1), mdi:INDD(INDO('−DI','−DI','#f23645'), -1) },
    f(bars, p){   // TradingView DMI: everything starts at the 2nd bar, Wilder smoothing
      const len=bars.length, tr=indNulls(len), pm=indNulls(len), mm=indNulls(len);
      for (let i=1;i<len;i++){ const b=bars[i], a=bars[i-1], up=b.h-a.h, dn=a.l-b.l;
        tr[i]=Math.max(b.h-b.l, Math.abs(b.h-a.c), Math.abs(b.l-a.c)); pm[i]= up>dn && up>0 ? up : 0; mm[i]= dn>up && dn>0 ? dn : 0; }
      const str=indRMA(tr, p.n), sp=indRMA(pm, p.n), sm=indRMA(mm, p.n);
      const pdi=indOp(sp, str, (a, t)=>t>0 ? 100*a/t : 0), mdi=indOp(sm, str, (a, t)=>t>0 ? 100*a/t : 0);
      const dx=indOp(pdi, mdi, (a, b)=>{ const s=a+b; return 100*Math.abs(a-b)/(s===0 ? 1 : s); });
      return { adx:indRMA(dx, p.sm), pdi, mdi }; } },
  aroon: { n:['Aroon','Aroon'], sn:'Aroon', cat:'trend', pane:'sub', range:[0,100], lv:[30,70], d:['How recently the highest high and lowest low happened.','En yüksek ve en düşük seviyenin ne kadar yakın zamanda görüldüğü.'],
    p:{ n:INDP.n(14) }, out:{ aup:INDO('Aroon up','Aroon yukarı','#ff6d00'), adn:INDO('Aroon down','Aroon aşağı','#2962ff') },
    f(bars, p){ const n=p.n, hi=indExt(indCol(bars,'h'), n+1, true).idx, lo=indExt(indCol(bars,'l'), n+1, false).idx;
      return { aup:hi.map((j, i)=>j===null ? null : 100*(n-(i-j))/n), adn:lo.map((j, i)=>j===null ? null : 100*(n-(i-j))/n) }; } },
  // ---------------- volatility ----------------
  bb: { n:['Bollinger Bands','Bollinger Bantları'], sn:'BB', cat:'volatility', pane:'main', d:['Moving average with bands N standard deviations away.','N standart sapma uzaklıkta bantları olan hareketli ortalama.'],
    p:{ n:INDP.n(20), mult:{ v:2, min:0.1, max:10, step:0.1, n:['Standard deviations','Standart sapma'] } },
    out:{ mid:INDO('Basis','Orta','#ff6d00'), up:INDO('Upper','Üst','#2962ff','band'), dn:INDO('Lower','Alt','#2962ff','band') },
    f(bars, p){ const c=indCol(bars,'c'), mid=indSMA(c, p.n), sd=indStdev(c, p.n);
      return { mid, up:indOp(mid, sd, (m, s)=>m+p.mult*s), dn:indOp(mid, sd, (m, s)=>m-p.mult*s) }; } },
  kc: { n:['Keltner Channels','Keltner Kanalları'], sn:'KC', cat:'volatility', pane:'main', d:['EMA with bands a multiple of ATR away.','ATR’nin katı uzaklıkta bantları olan EMA.'],
    p:{ n:INDP.n(20), atr:{ v:10, min:1, max:500, step:1, n:['ATR length','ATR uzunluğu'] }, mult:INDP.mult(2) },
    out:{ mid:INDO('Basis','Orta','#2962ff'), up:INDO('Upper','Üst','#00897b','band'), dn:INDO('Lower','Alt','#00897b','band') },
    f(bars, p){ const mid=indEMA(indCol(bars,'c'), p.n), atr=indRMA(indTR(bars), p.atr);
      return { mid, up:indOp(mid, atr, (m, a)=>m+p.mult*a), dn:indOp(mid, atr, (m, a)=>m-p.mult*a) }; } },
  dc: { n:['Donchian Channels','Donchian Kanalları'], sn:'DC', cat:'volatility', pane:'main', d:['Highest high and lowest low of the last N bars.','Son N mumun en yüksek ve en düşük seviyesi.'],
    p:{ n:INDP.n(20) }, out:{ mid:INDO('Basis','Orta','#ff6d00'), up:INDO('Upper','Üst','#0288d1','band'), dn:INDO('Lower','Alt','#0288d1','band') },
    f(bars, p){ const up=indExt(indCol(bars,'h'), p.n, true).v, dn=indExt(indCol(bars,'l'), p.n, false).v; return { mid:indOp(up, dn, (a, b)=>(a+b)/2), up, dn }; } },
  atr: { n:['Average True Range','Ortalama Gerçek Aralık'], sn:'ATR', cat:'volatility', pane:'sub', d:['Average size of a bar’s full range (Wilder).','Bir mumun tam aralığının ortalama büyüklüğü (Wilder).'],
    p:{ n:INDP.n(14) }, out:{ atr:INDO('ATR','ATR','#d81b60') }, f:(bars, p)=>({ atr:indRMA(indTR(bars), p.n) }) },
  stdev: { n:['Standard Deviation','Standart Sapma'], sn:'StDev', cat:'volatility', pane:'sub', d:['How far closes spread around their average.','Kapanışların ortalama etrafında ne kadar dağıldığı.'],
    p:{ n:INDP.n(20) }, out:{ sd:INDO('StDev','Std. sapma','#5c6bc0') }, f:(bars, p)=>({ sd:indStdev(indCol(bars,'c'), p.n) }) },
  bbw: { n:['Bollinger Band Width','Bollinger Bant Genişliği'], sn:'BBW', cat:'volatility', pane:'sub', d:['Width of the Bollinger Bands as % of the basis: low = squeeze.','Bollinger bantlarının ortaya göre % genişliği: düşükse sıkışma.'],
    p:{ n:INDP.n(20), mult:{ v:2, min:0.1, max:10, step:0.1, n:['Standard deviations','Standart sapma'] } }, out:{ bbw:INDO('BBW','BBW','#00897b') },
    f(bars, p){ const c=indCol(bars,'c'), m=indSMA(c, p.n), sd=indStdev(c, p.n); return { bbw:indOp(m, sd, (a, s)=>a!==0 ? 100*2*p.mult*s/a : null) }; } },
  // ---------------- momentum ----------------
  rsi: { n:['Relative Strength Index','Göreceli Güç Endeksi'], sn:'RSI', cat:'momentum', pane:'sub', lv:[30,70], range:[0,100], d:['Speed of price moves, 0–100; above 70 overbought, below 30 oversold.','Fiyat hareketinin hızı, 0–100; 70 üstü aşırı alım, 30 altı aşırı satım.'],
    p:{ n:INDP.n(14) }, out:{ rsi:INDO('RSI','RSI','#7e57c2') }, f:(bars, p)=>({ rsi:indRSIs(indCol(bars,'c'), p.n) }) },
  macd: { n:['MACD','MACD'], sn:'MACD', cat:'momentum', pane:'sub', lv:[0], d:['Gap between a fast and a slow EMA, with a signal line.','Hızlı ve yavaş EMA arasındaki fark, sinyal çizgisiyle.'],
    p:{ fast:{ v:12, min:1, max:500, step:1, n:['Fast length','Hızlı uzunluk'] }, slow:{ v:26, min:1, max:500, step:1, n:['Slow length','Yavaş uzunluk'] }, sig:{ v:9, min:1, max:200, step:1, n:['Signal length','Sinyal uzunluğu'] } },
    out:{ hist:INDO('Histogram','Histogram','#26a69a','hist'), macd:INDO('MACD','MACD','#2962ff'), signal:INDO('Signal','Sinyal','#ff6d00') },
    f(bars, p){ const c=indCol(bars,'c'), macd=indOp(indEMA(c, p.fast), indEMA(c, p.slow), (a, b)=>a-b), signal=indEMA(macd, p.sig);
      return { macd, signal, hist:indOp(macd, signal, (a, b)=>a-b) }; } },
  stoch: { n:['Stochastic','Stokastik'], sn:'Stoch', cat:'momentum', pane:'sub', lv:[20,80], range:[0,100], d:['Where the close sits in the recent high–low range.','Kapanışın son yüksek–düşük aralığındaki yeri.'],
    p:{ k:{ v:14, min:1, max:500, step:1, n:['%K length','%K uzunluğu'] }, sm:{ v:3, min:1, max:100, step:1, n:['%K smoothing','%K yumuşatma'] }, d:{ v:3, min:1, max:100, step:1, n:['%D smoothing','%D yumuşatma'] } },
    out:{ k:INDO('%K','%K','#2962ff'), d:INDO('%D','%D','#ff6d00') },
    f(bars, p){ const k=indSMA(indStochRaw(indCol(bars,'h'), indCol(bars,'l'), indCol(bars,'c'), p.k), p.sm); return { k, d:indSMA(k, p.d) }; } },
  stochrsi: { n:['Stochastic RSI','Stokastik RSI'], sn:'Stoch RSI', cat:'momentum', pane:'sub', lv:[20,80], range:[0,100], d:['Stochastic applied to RSI: faster overbought / oversold signals.','RSI’ye uygulanan stokastik: daha hızlı aşırı alım / satım sinyalleri.'],
    p:{ rsi:{ v:14, min:1, max:500, step:1, n:['RSI length','RSI uzunluğu'] }, st:{ v:14, min:1, max:500, step:1, n:['Stochastic length','Stokastik uzunluğu'] },
        k:{ v:3, min:1, max:100, step:1, n:['%K smoothing','%K yumuşatma'] }, d:{ v:3, min:1, max:100, step:1, n:['%D smoothing','%D yumuşatma'] } },
    out:{ k:INDO('%K','%K','#2962ff'), d:INDO('%D','%D','#ff6d00') },
    f(bars, p){ const r=indRSIs(indCol(bars,'c'), p.rsi), k=indSMA(indStochRaw(r, r, r, p.st), p.k); return { k, d:indSMA(k, p.d) }; } },
  cci: { n:['Commodity Channel Index','Emtia Kanal Endeksi'], sn:'CCI', cat:'momentum', pane:'sub', lv:[-100,100], d:['Distance of the typical price from its average, in mean deviations.','Tipik fiyatın ortalamasından uzaklığı, ortalama sapma cinsinden.'],
    p:{ n:INDP.n(20) }, out:{ cci:INDO('CCI','CCI','#2196f3') },
    f(bars, p){ const n=p.n, tp=indTP(bars), m=indSMA(tp, n), out=indNulls(tp.length);
      for (let i=0;i<tp.length;i++) if (m[i]!==null){ let md=0; for (let j=i-n+1;j<=i;j++) md+=Math.abs(tp[j]-m[i]); md/=n; out[i]= md>0 ? (tp[i]-m[i])/(0.015*md) : 0; }
      return { cci:out }; } },
  willr: { n:['Williams %R','Williams %R'], sn:'%R', cat:'momentum', pane:'sub', lv:[-80,-20], range:[-100,0], d:['Close versus the recent high, from 0 (top) to −100 (bottom).','Kapanışın son zirveye göre yeri, 0 (tepe) ile −100 (dip) arası.'],
    p:{ n:INDP.n(14) }, out:{ r:INDO('%R','%R','#7e57c2') },
    f(bars, p){ const c=indCol(bars,'c'), hh=indExt(indCol(bars,'h'), p.n, true).v, ll=indExt(indCol(bars,'l'), p.n, false).v;
      return { r:c.map((x, i)=>hh[i]===null ? null : (hh[i]-ll[i]>0 ? -100*(hh[i]-x)/(hh[i]-ll[i]) : -50)) }; } },
  roc: { n:['Rate of Change','Değişim Oranı'], sn:'ROC', cat:'momentum', pane:'sub', lv:[0], d:['Percent change from N bars ago.','N mum öncesine göre yüzde değişim.'],
    p:{ n:INDP.n(9) }, out:{ roc:INDO('ROC','ROC','#2962ff') },
    f(bars, p){ const c=indCol(bars,'c'), n=p.n; return { roc:c.map((x, i)=>i>=n && c[i-n]!==0 ? 100*(x-c[i-n])/c[i-n] : null) }; } },
  mom: { n:['Momentum','Momentum'], sn:'Mom', cat:'momentum', pane:'sub', lv:[0], d:['Close minus the close N bars ago.','Kapanış eksi N mum önceki kapanış.'],
    p:{ n:INDP.n(10) }, out:{ mom:INDO('Momentum','Momentum','#2962ff') },
    f(bars, p){ const c=indCol(bars,'c'), n=p.n; return { mom:c.map((x, i)=>i>=n ? x-c[i-n] : null) }; } },
  ao: { n:['Awesome Oscillator','Awesome Osilatör'], sn:'AO', cat:'momentum', pane:'sub', lv:[0], d:['5-bar minus 34-bar average of the bar midpoints.','Mum orta noktalarının 5 ve 34 mumluk ortalamaları farkı.'],
    p:{ fast:{ v:5, min:1, max:200, step:1, n:['Fast length','Hızlı uzunluk'] }, slow:{ v:34, min:1, max:500, step:1, n:['Slow length','Yavaş uzunluk'] } },
    out:{ ao:INDO('AO','AO','#26a69a','hist') },
    f(bars, p){ const m=indHL2(bars); return { ao:indOp(indSMA(m, p.fast), indSMA(m, p.slow), (a, b)=>a-b) }; } },
  trix: { n:['TRIX','TRIX'], sn:'TRIX', cat:'momentum', pane:'sub', lv:[0], d:['1-bar % change of a triple-smoothed EMA, with a signal line.','Üç kez yumuşatılmış EMA’nın 1 mumluk % değişimi, sinyal çizgisiyle.'],
    p:{ n:INDP.n(18), sig:{ v:9, min:1, max:200, step:1, n:['Signal length','Sinyal uzunluğu'] } },
    out:{ trix:INDO('TRIX','TRIX','#d81b60'), signal:INDO('Signal','Sinyal','#2962ff') },
    f(bars, p){ const e=indEMA(indEMA(indEMA(indCol(bars,'c'), p.n), p.n), p.n), t=e.map((x, i)=>x!==null && i && e[i-1]!==null && e[i-1]!==0 ? 100*(x-e[i-1])/e[i-1] : null);
      return { trix:t, signal:indEMA(t, p.sig) }; } },
  // ---------------- volume ----------------
  vol: { n:['Volume','Hacim'], sn:'Vol', snTr:'Hcm', cat:'volume', pane:'sub', d:['Traded volume per bar, with its moving average.','Mum başına işlem hacmi ve hareketli ortalaması.'],
    p:{ n:{ v:20, min:1, max:500, step:1, n:['MA length','Ortalama uzunluğu'] } },
    out:{ v:INDO('Volume','Hacim','#78909c','hist'), ma:INDO('Volume MA','Hacim ort.','#2962ff') },
    f(bars, p){ const v=indCol(bars,'v'); return { v, ma:indSMA(v, p.n), dir:bars.map(b=>b.c>=b.o ? 1 : -1) }; } },
  vwap: { n:['VWAP','VWAP (Hacim Ağırlıklı Ortalama Fiyat)'], sn:'VWAP', cat:'volume', pane:'main', d:['Volume-weighted average price since UTC midnight, with σ bands.','UTC gece yarısından beri hacim ağırlıklı ortalama fiyat, σ bantlarıyla.'],
    p:{ mult:{ v:1, min:0, max:5, step:0.5, n:['Band 1 (σ, 0 = off)','Bant 1 (σ, 0 = kapalı)'] }, mult2:{ v:0, min:0, max:5, step:0.5, n:['Band 2 (σ, 0 = off)','Bant 2 (σ, 0 = kapalı)'] } },
    out:{ vwap:INDO('VWAP','VWAP','#2962ff'), up:INDO('Upper band','Üst bant','#009688','band'), dn:INDO('Lower band','Alt bant','#009688','band'),
          up2:INDO('Upper band 2','Üst bant 2','#8d6e63'), dn2:INDO('Lower band 2','Alt bant 2','#8d6e63') },
    f(bars, p, x){
      const len=bars.length, vw=indNulls(len), up=indNulls(len), dn=indNulls(len), up2=indNulls(len), dn2=indNulls(len);
      if (!len) return { vwap:vw, up, dn, up2, dn2 };
      // the first session is cut off when the bars start more than one bar after its UTC midnight: no VWAP there
      const cut= !(x && x.sess0) && bars[0].t-indDayKey(bars[0].t)*IND_DAY>=indStep(bars), k0=indDayKey(bars[0].t);
      let day=null, sv=0, spv=0, sp2v=0, st=0, cnt=0, ref=0;
      for (let i=0;i<len;i++){
        const b=bars[i], k=indDayKey(b.t), tp=(b.h+b.l+b.c)/3, v=indNum(b.v) && b.v>0 ? b.v : 0;
        if (cut && k===k0) continue;
        if (k!==day){ day=k; sv=0; spv=0; sp2v=0; st=0; cnt=0; ref=tp; }
        const d=tp-ref; sv+=v; spv+=d*v; sp2v+=d*d*v; st+=d; cnt++;
        const m= sv>0 ? spv/sv : st/cnt, varr= sv>0 ? Math.max(0, sp2v/sv-m*m) : 0, sd=Math.sqrt(varr);
        vw[i]=ref+m;
        if (p.mult>0){ up[i]=vw[i]+p.mult*sd; dn[i]=vw[i]-p.mult*sd; }
        if (p.mult2>0){ up2[i]=vw[i]+p.mult2*sd; dn2[i]=vw[i]-p.mult2*sd; }
      }
      return { vwap:vw, up, dn, up2, dn2 }; } },
  obv: { n:['On-Balance Volume','Denge İşlem Hacmi (OBV)'], sn:'OBV', cat:'volume', pane:'sub', d:['Running total of volume: added on up closes, subtracted on down closes.','Hacmin birikimli toplamı: yükselen kapanışta eklenir, düşende çıkarılır.'],
    p:{}, out:{ obv:INDO('OBV','OBV','#2962ff') },
    f(bars){ const len=bars.length, o=new Array(len); let s=0; for (let i=0;i<len;i++){ if (i){ const d=bars[i].c-bars[i-1].c, v=indNum(bars[i].v) ? bars[i].v : 0; s+= d>0 ? v : (d<0 ? -v : 0); } o[i]=s; } return { obv:o }; } },
  mfi: { n:['Money Flow Index','Para Akışı Endeksi'], sn:'MFI', cat:'volume', pane:'sub', lv:[20,80], range:[0,100], d:['Volume-weighted RSI of the typical price.','Tipik fiyatın hacim ağırlıklı RSI’ı.'],
    p:{ n:INDP.n(14) }, out:{ mfi:INDO('MFI','MFI','#7e57c2') },
    f(bars, p){ const tp=indTP(bars), v=indCol(bars,'v'), len=tp.length, pos=indNulls(len), neg=indNulls(len);
      for (let i=1;i<len;i++){ const f=tp[i]*v[i]; pos[i]= tp[i]>tp[i-1] ? f : 0; neg[i]= tp[i]<tp[i-1] ? f : 0; }
      const sp=indSum(pos, p.n), sn=indSum(neg, p.n);
      return { mfi:sp.map((a, i)=>a===null ? null : (sn[i]>0 ? 100-100/(1+a/sn[i]) : (a>0 ? 100 : 50))) }; } },
  cmf: { n:['Chaikin Money Flow','Chaikin Para Akışı'], sn:'CMF', cat:'volume', pane:'sub', lv:[0], d:['Buying versus selling pressure over N bars, from −1 to +1.','N mum boyunca alım ve satım baskısı, −1 ile +1 arası.'],
    p:{ n:INDP.n(20) }, out:{ cmf:INDO('CMF','CMF','#26a69a') },
    f(bars, p){ const v=indCol(bars,'v'), mfv=bars.map((b, i)=>b.h>b.l ? ((b.c-b.l)-(b.h-b.c))/(b.h-b.l)*v[i] : 0), a=indSum(mfv, p.n), s=indSum(v, p.n);
      return { cmf:a.map((x, i)=>x===null ? null : (s[i]>0 ? x/s[i] : 0)) }; } },
  ad: { n:['Accumulation / Distribution','Birikim / Dağıtım'], sn:'A/D', cat:'volume', pane:'sub', d:['Running total of volume weighted by where each bar closes in its range.','Her mumun kapanış yerine göre ağırlıklandırılmış hacmin birikimli toplamı.'],
    p:{}, out:{ ad:INDO('A/D','A/D','#ff6d00') },
    f(bars){ let s=0; return { ad:bars.map(b=>{ const v=indNum(b.v) ? b.v : 0; if (b.h>b.l) s+=((b.c-b.l)-(b.h-b.c))/(b.h-b.l)*v; return s; }) }; } },
  // ---------------- other ----------------
  pivots: { n:['Pivot Points (classic)','Pivot Noktaları (klasik)'], sn:'Pivots', cat:'other', pane:'main', d:['Support and resistance from the previous day’s high, low and close.','Önceki günün yüksek, düşük ve kapanışından destek ve dirençler.'],
    p:{}, out:{ r3:INDD(INDO('R3','R3','#f23645'), -1), r2:INDD(INDO('R2','R2','#f23645'), -1), r1:INDD(INDO('R1','R1','#f23645'), -1), p:INDO('P','P','#f5a524'),
               s1:INDD(INDO('S1','S1','#22ab94'), 1), s2:INDD(INDO('S2','S2','#22ab94'), 1), s3:INDD(INDO('S3','S3','#22ab94'), 1) },
    f(bars, p, x){
      const len=bars.length, o={ r3:indNulls(len), r2:indNulls(len), r1:indNulls(len), p:indNulls(len), s1:indNulls(len), s2:indNulls(len), s3:indNulls(len) };
      if (!len) return o;
      const st=indStep(bars), per= st<IND_DAY ? 0 : (st<7*IND_DAY ? 1 : 2), key=[indDayKey, indWeekKey, indMonthKey][per];
      const start=k=>per===0 ? k*IND_DAY : per===1 ? k*7*IND_DAY+4*IND_DAY : Date.UTC(Math.floor(k/12), k%12, 1);
      // high / low / close of every period a bar list covers; `seen` gets every period that has bars, `full` only the whole ones
      const seen=new Set(), full=new Map();
      const scan=src=>{ const B=Array.isArray(src) ? src.filter(b=>b && indNum(b.t) && indNum(b.h) && indNum(b.l) && indNum(b.c)).sort((a, b)=>a.t-b.t) : []; if (!B.length) return;
        const k0=key(B[0].t), part0=B[0].t-start(k0)>=indStep(B); let cur=null, H=0, L=0, C=0;
        const put=()=>{ if (cur===null) return; seen.add(cur); if (!(cur===k0 && part0)) full.set(cur, { H, L, C }); };
        for (const b of B){ const k=key(b.t); if (k!==cur){ put(); cur=k; H=b.h; L=b.l; } else { if (b.h>H) H=b.h; if (b.l<L) L=b.l; } C=b.c; }
        put(); };
      scan(bars); if (x && x.hi) scan(x.hi);     // the whole-period bars win where both cover a period
      const ks=[...seen].sort((a, b)=>a-b); let j=-1, cur=null, prev=null;
      for (let i=0;i<len;i++){
        const k=key(bars[i].t);
        if (k!==cur){ cur=k; while (j+1<ks.length && ks[j+1]<k) j++; prev= j>=0 ? full.get(ks[j]) || null : null; }
        if (prev){ const P=(prev.H+prev.L+prev.C)/3, R=prev.H-prev.L;
          o.p[i]=P; o.r1[i]=2*P-prev.L; o.s1[i]=2*P-prev.H; o.r2[i]=P+R; o.s2[i]=P-R; o.r3[i]=P+2*R; o.s3[i]=P-2*R; }
      }
      return o; } },
  linreg: { n:['Linear Regression Channel','Doğrusal Regresyon Kanalı'], sn:'LinReg', cat:'other', pane:'main', d:['Best-fit line over the last N bars with deviation bands.','Son N muma oturtulan en uygun doğru ve sapma bantları.'],
    p:{ n:INDP.n(100, 1000), mult:{ v:2, min:0.1, max:10, step:0.1, n:['Deviations','Sapma'] } },
    out:{ mid:INDO('Regression','Regresyon','#ff6d00'), up:INDO('Upper','Üst','#2962ff','band'), dn:INDO('Lower','Alt','#2962ff','band') },
    f(bars, p){
      const len=bars.length, mid=indNulls(len), up=indNulls(len), dn=indNulls(len), m=Math.min(p.n, len);
      if (m<2) return { mid, up, dn };
      const s=len-m, ref=bars[s].c; let sx=0, sy=0, sxx=0, sxy=0;
      for (let j=0;j<m;j++){ const y=bars[s+j].c-ref; sx+=j; sy+=y; sxx+=j*j; sxy+=j*y; }
      const b=(m*sxy-sx*sy)/(m*sxx-sx*sx), a=(sy-b*sx)/m; let e=0;
      for (let j=0;j<m;j++){ const r=bars[s+j].c-ref-(a+b*j); e+=r*r; }
      const sd=Math.sqrt(e/m);
      for (let j=0;j<m;j++){ const y=ref+a+b*j; mid[s+j]=y; up[s+j]=y+p.mult*sd; dn[s+j]=y-p.mult*sd; }
      return { mid, up, dn }; } },
};

// params: defaults for anything missing or not a number, clamped to [min,max], whole numbers where the step is whole
function indParams(id, p){
  const d=IND_DEFS[id], q={}; if (!d) return q;
  for (const k in d.p){ const s=d.p[k]; let x= p && p[k]!=null && p[k]!=='' ? +p[k] : NaN;
    if (!isFinite(x)) x=s.v;
    if (s.min!=null && x<s.min) x=s.min; if (s.max!=null && x>s.max) x=s.max;
    if (Number.isInteger(s.step)) x=Math.round(x);
    q[k]=x; }
  return q;
}
function indDefaults(id){ const d=IND_DEFS[id], q={}; if (d) for (const k in d.p) q[k]=d.p[k].v; return q; }
function indColors(id){ const d=IND_DEFS[id], q={}; if (d) for (const k in d.out) q[k]=d.out[k].c; return q; }
// legend label, e.g. "EMA 20", "MACD 12 26 9"
// short name in the page language (lang 'tr' → Turkish where it differs, e.g. Volume: Vol / Hcm)
function indShort(id, lang){ const d=IND_DEFS[id]; return !d ? '' : lang==='tr' && d.snTr ? d.snTr : d.sn; }
function indLabel(ind, lang){ const d=ind && IND_DEFS[ind.id]; if (!d) return ''; const q=indParams(ind.id, ind.p), v=Object.keys(d.p).map(k=>String(+q[k].toFixed(3)));
  return indShort(ind.id, lang)+(v.length ? ' '+v.join(' ') : ''); }
let IND_ERR=null;     // last error caught inside an indicator (for debugging)

// wrap every f: normalise inputs, catch errors, force aligned arrays of finite numbers or null
for (const id in IND_DEFS){
  const d=IND_DEFS[id], raw=d.f; d.id=id;
  d.f=function(bars, p, x){
    const B=Array.isArray(bars) ? bars.filter(b=>b && typeof b==='object') : [], len=B.length, q=indParams(id, p); let r;
    try { r=raw(B, q, x && typeof x==='object' ? x : null) || {}; } catch (e){ IND_ERR={ id, msg:String(e && e.message || e) }; r={}; }
    const keys=Object.keys(d.out); if ('dir' in r) keys.push('dir');
    for (const k of keys){
      let a=r[k]; if (!Array.isArray(a) || a.length!==len){ const b=indNulls(len); if (Array.isArray(a)) for (let i=0;i<Math.min(len, a.length);i++) b[i]=a[i]; a=r[k]=b; }
      for (let i=0;i<len;i++){ const x=a[i]; if (x!==null && !(typeof x==='number' && isFinite(x))) a[i]=null; }
    }
    return r;
  };
}
function indRun(id, bars, p, x){ const d=IND_DEFS[id]; return d ? d.f(bars, p, x) : {}; }

// Heikin-Ashi bars (t and v kept)
function indHeikin(bars){
  const out=[]; if (!Array.isArray(bars)) return out; let po=null, pc=null;
  for (const b of bars){ const c=(b.o+b.h+b.l+b.c)/4, o= po===null ? (b.o+b.c)/2 : (po+pc)/2;
    out.push({ t:b.t, o, h:Math.max(b.h, o, c), l:Math.min(b.l, o, c), c, v:b.v }); po=o; pc=c; }
  return out;
}

// small LRU cache: indCache(key, () => value) returns the cached value for key, computing it once
const IND_LRU=new Map();
function indCache(key, fn){
  if (IND_LRU.has(key)){ const v=IND_LRU.get(key); IND_LRU.delete(key); IND_LRU.set(key, v); return v; }
  const v=fn(); IND_LRU.set(key, v);
  while (IND_LRU.size>IND_N) IND_LRU.delete(IND_LRU.keys().next().value);
  return v;
}

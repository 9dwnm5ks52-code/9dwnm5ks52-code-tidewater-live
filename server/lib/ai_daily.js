/* ---------- Tidewater Live: the Strategy Desk engine (daily candles, many years) ----------
   Strategies that hold coins for days or weeks, built from published research, with every setting chosen before looking at results
   (nothing here was tuned on the data it is tested on). One backtester serves the multi-year test (server), today's targets and the paper accounts (browser).
   Costs: every change in a holding pays the exchange fee plus slippage; small changes are skipped (a no-trade band) to save costs. */
const DLY_U = ['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','TRX','AVAX','LINK','DOT','LTC','BCH','XLM','ATOM','ETC','NEAR','UNI','FIL','HBAR',
  // big coins of earlier years that fell back (some since delisted): they keep the test honest about picking winners after the fact
  'EOS','NEO','IOTA','XTZ','ZEC','VET','ALGO','THETA','WAVES','OMG'];
const DLY_DAY = 864e5, DLY_START = Date.UTC(2017, 7, 17);
// fee and slippage per side: standard taker fee, or a limit order paying the fee in BNB (25% off)
const DLY_COST = { taker:{ fee:.001, slip:.0005 }, maker:{ fee:.00075, slip:.0002 } };
const DLY = { raw:{}, D:null, fund:{}, status:'idle', err:'', t:0 };

// ---- data: Binance daily candles (free, no key), paged 1,000 days at a time
async function dlyFetch(sym, from, until){ const out=[]; let t=from; const base=(typeof LIVE!=='undefined' && LIVE.BN_REST) || 'https://data-api.binance.vision/api/v3';
  for (let k=0;k<12;k++){ const r=await fetch(`${base}/klines?symbol=${sym}USDT&interval=1d&startTime=${t}&limit=1000`); if (!r.ok) throw new Error(sym+' HTTP '+r.status); const x=await r.json(); if (!x.length) break;
    for (const b of x) if (!until || +b[0]<until) out.push([+b[0], +b[2], +b[3], +b[4]]); t=+x[x.length-1][0]+DLY_DAY; if (x.length<1000) break; } return out; }   // [day, high, low, close]
// put every coin on one grid of days (NaN where a coin did not trade); only finished days are used
function dlyBuild(raw, now){ now=now||Date.now(); const last=Math.floor(now/DLY_DAY)*DLY_DAY-DLY_DAY; let first=Infinity; for (const s in raw) if (raw[s].length) first=Math.min(first, raw[s][0][0]);
  if (!isFinite(first)) return null; const n=Math.round((last-first)/DLY_DAY)+1, days=Array.from({ length:n }, (_,i)=>first+i*DLY_DAY), px={};
  for (const s in raw){ const c=new Float64Array(n).fill(NaN), h=new Float64Array(n).fill(NaN), l=new Float64Array(n).fill(NaN); for (const b of raw[s]){ const i=Math.round((b[0]-first)/DLY_DAY); if (i>=0 && i<n){ h[i]=b[1]; l[i]=b[2]; c[i]=b[3]; } } px[s]={ c, h, l }; }
  return dlyInd({ days, px, syms:Object.keys(raw) }); }
// indicators per coin: daily return, 30-day volatility, averages, momentum, and rolling highs/lows of closes for the trend channels
const DLY_LB = [5,10,20,30,60,90,150,250];
function dlyInd(D){ const n=D.days.length; D.ind={};
  for (const s of D.syms){ const c=D.px[s].c, r=new Float64Array(n).fill(NaN), vol=new Float64Array(n).fill(NaN), age=new Int32Array(n), sma={}, hi={}, lo={};
    let a=0; for (let i=0;i<n;i++){ if (isFinite(c[i])){ a++; if (i && isFinite(c[i-1])) r[i]=Math.log(c[i]/c[i-1]); } else a=0; age[i]=a; }
    for (let i=30;i<n;i++){ let m=0, k=0; for (let j=i-29;j<=i;j++) if (isFinite(r[j])){ m+=r[j]; k++; } if (k<20) continue; m/=k; let v=0; for (let j=i-29;j<=i;j++) if (isFinite(r[j])) v+=(r[j]-m)**2; vol[i]=Math.sqrt(v/(k-1))*Math.sqrt(365); }
    for (const p of [20,50,100,200]){ const x=new Float64Array(n).fill(NaN); let sum=0, k=0; for (let i=0;i<n;i++){ if (isFinite(c[i])){ sum+=c[i]; k++; } if (i>=p && isFinite(c[i-p])){ sum-=c[i-p]; k--; } if (age[i]>=p) x[i]=sum/k; } sma[p]=x; }
    // highest close of the previous lb days, lowest close of the previous ceil(lb/2) days (today excluded): the classic breakout channel with a trailing exit
    for (const lb of DLY_LB){ hi[lb]=dlyRoll(c, lb, true); lo[lb]=dlyRoll(c, Math.ceil(lb/2), false); }
    D.ind[s]={ r, vol, age, sma, hi, lo }; } return D; }
function dlyRoll(c, w, max){ const n=c.length, out=new Float64Array(n).fill(NaN), q=[]; let head=0, run=0;   // monotonic queue over the previous w days (needs w unbroken days)
  for (let i=0;i<n;i++){ while (head<q.length && q[head]<i-w) head++; if (run>=w && head<q.length) out[i]=c[q[head]];
    if (isFinite(c[i])){ while (q.length>head && (max ? c[q[q.length-1]]<=c[i] : c[q[q.length-1]]>=c[i])) q.pop(); q.push(i); run++; } else { q.length=0; head=0; run=0; } }
  return out; }
const dlyOk = (D, s, i) => isFinite(D.px[s].c[i]);
// the share of four trend votes that are up: the close above its 20, 50, 100 and 200-day averages (no single setting to bet on)
function dlyEns(D, s, i){ const I=D.ind[s], c=D.px[s].c[i]; let k=0, m=0; for (const n of [20,50,100,200]){ const v=I.sma[n][i]; if (!isFinite(v)) continue; m++; if (c>v) k++; } return m ? k/m : 0; }
// the annualised volatility a set of weights would have had over the last 30 days
function dlyPortVol(D, w, i){ const ks=Object.keys(w).filter(s=>w[s]>0); if (!ks.length) return 0; const xs=[];
  for (let j=i-29;j<=i;j++){ let p=0; for (const s of ks){ const r=D.ind[s].r[j]; if (isFinite(r)) p+=w[s]*(Math.exp(r)-1); } xs.push(p); }
  const m=xs.reduce((a,b)=>a+b,0)/xs.length; return Math.sqrt(xs.reduce((a,b)=>a+(b-m)**2,0)/(xs.length-1))*Math.sqrt(365); }
// volatility targeting: scale all weights down when the mix would swing more than the target (never up past fully invested)
function dlyVolTarget(D, w, i, target){ const v=dlyPortVol(D, w, i); if (!(v>0)) return w; const k=Math.min(1, target/v), out={}; for (const s in w) out[s]=w[s]*k; return out; }
function dlyFundAvg(sym, t, days){ const a=DLY.fund[sym]; if (!a || !a.length || a[0][0]>t) return null; let lo=0, hi=a.length-1; while (lo<hi){ const m=(lo+hi+1)>>1; if (a[m][0]<=t) lo=m; else hi=m-1; }
  const from=t-days*DLY_DAY; let s=0, k=0; for (let j=lo;j>=0 && a[j][0]>from;j--){ s+=a[j][1]; k++; } return k ? s/k : null; }

// ---- the strategies: each returns the weights to hold from this close on (fractions of the account; the rest is cash)
const DLY_STRATS = [
  { id:'guard', name:['BTC Trend Guard','BTC Trend Koruyucu'], ico:'🛡️', ref:['Grayscale 2023; Detzel et al. 2021','Grayscale 2023; Detzel ve ark. 2021'],
    d:['Holds Bitcoin while it closes above its 50-day average, cash below. The simplest way to stay in rising markets and step aside in falling ones.','Bitcoin 50 günlük ortalamasının üstünde kapanırken Bitcoin tutar, altında nakde geçer. Yükselişte içeride kalıp düşüşte kenara çekilmenin en basit yolu.'],
    p:{ sma:50, vt:0 }, w(D, i, p){ const s=D.ind.BTC.sma[p.sma][i], c=D.px.BTC.c[i]; return isFinite(s) && c>s ? { BTC:1 } : {}; } },
  { id:'guardvt', name:['BTC Guard + Risk Brake','BTC Koruyucu + Risk Freni'], ico:'🧯', ref:['Man Group (volatility scaling); Grayscale 2023','Man Group (oynaklık ölçekleme); Grayscale 2023'],
    d:['The Trend Guard, with a risk brake: when Bitcoin swings more than 40% a year (annualised), the position shrinks so the risk stays near that level.','Trend Koruyucu, risk freniyle: Bitcoin yıllık %40’tan fazla salındığında pozisyon küçülür, risk o seviyede kalır.'],
    p:{ sma:50, vt:.4 }, w(D, i, p){ const s=D.ind.BTC.sma[p.sma][i], c=D.px.BTC.c[i]; return isFinite(s) && c>s ? dlyVolTarget(D, { BTC:1 }, i, p.vt) : {}; } },
  { id:'trend', name:['Trend Ensemble','Trend Topluluğu'], ico:'📈', ref:['Zarattini, Pagani, Barbon 2025 (Catching Crypto Trends)','Zarattini, Pagani, Barbon 2025'],
    d:['For every coin, eight breakout channels (5 to 250 days): a channel turns on when the close is the highest of its period and off at the lowest of half that period. A coin’s share follows how many channels are on, divided by its volatility; the whole mix aims at 30% yearly volatility.','Her coin için sekiz kırılım kanalı (5–250 gün): kapanış dönemin en yükseğiyse kanal açılır, yarım dönemin en düşüğünde kapanır. Coinin payı açık kanal sayısına göre, oynaklığına bölünerek belirlenir; tüm karışım yıllık %30 oynaklığı hedefler.'],
    p:{ vt:.3, fund:false }, w(D, i, p, st){ const on=st.on||(st.on={}), raw={};
      for (const s of D.syms){ if (!dlyOk(D, s, i)){ delete on[s]; continue; } const I=D.ind[s], c=D.px[s].c[i], o=on[s]||(on[s]={}); let k=0, m=0;
        for (const lb of DLY_LB){ if (I.age[i]<=lb) continue; m++; if (o[lb]){ if (c<=I.lo[lb][i]) o[lb]=0; } else if (c>=I.hi[lb][i]) o[lb]=1; if (o[lb]) k++; }
        if (!m || !k || !(I.vol[i]>0)) continue; if (p.fund){ const f=dlyFundAvg(s, D.days[i]+DLY_DAY, 3); if (f!=null && f>.0005) continue; } raw[s]=(k/m)/I.vol[i]; }
      const tot=Object.values(raw).reduce((a,b)=>a+b,0); if (!tot) return {}; const n=Math.max(5, Object.keys(raw).length), w={};
      for (const s in raw) w[s]=Math.min(.25, raw[s]/tot*Math.min(1, Object.keys(raw).length/n)); return dlyVolTarget(D, w, i, p.vt); } },
  { id:'trendf', name:['Trend Ensemble + Funding Filter','Trend Topluluğu + Fonlama Filtresi'], ico:'🌡️', ref:['Zarattini et al. 2025; funding-rate research','Zarattini ve ark. 2025; fonlama oranı araştırmaları'],
    d:['The Trend Ensemble, but it will not hold a coin while traders pay an extreme funding rate to stay long (over 0.05% every 8 hours, averaged over 3 days): a crowded, leveraged trade.','Trend Topluluğu, ama yatırımcılar uzun kalmak için aşırı fonlama ödüyorsa (3 günlük ortalama 8 saatte %0,05’in üstü) o coini tutmaz: kalabalık, kaldıraçlı bir işlem.'],
    p:{ vt:.3, fund:true }, w(D, i, p, st){ return DLY_STRATS.find(x=>x.id==='trend').w(D, i, p, st); } },
  { id:'mom', name:['Momentum Rotation','Momentum Rotasyonu'], ico:'🔄', ref:['Liu, Tsyvinski, Wu 2022 (Journal of Finance)','Liu, Tsyvinski, Wu 2022'],
    d:['Once a week, ranks the coins by their average return over the last 1, 2 and 4 weeks and holds the best 3, as long as their momentum is positive (otherwise cash). Shares are set by volatility; the mix aims at 40% yearly volatility.','Haftada bir, coinleri son 1, 2 ve 4 haftalık ortalama getirilerine göre sıralar ve momentumu pozitif olan en iyi 3’ünü tutar (yoksa nakit). Paylar oynaklığa göre belirlenir; karışım yıllık %40 oynaklığı hedefler.'],
    p:{ top:3, vt:.4, every:7 }, w(D, i, p, st){ if (st.p0==null) st.p0=i+(p.phase||0); if (i<st.p0) return {}; if (st.w && st.next>i){ const w={}; for (const s in st.w) if (dlyOk(D, s, i)) w[s]=st.w[s]; return w; }
      const sc=[]; for (const s of D.syms){ if (!dlyOk(D, s, i) || D.ind[s].age[i]<90) continue; const c=D.px[s].c; const m=[7,14,28].map(k=>c[i]/c[i-k]-1); if (m.some(x=>!isFinite(x))) continue; sc.push({ s, m:(m[0]+m[1]+m[2])/3 }); }
      sc.sort((a,b)=>b.m-a.m); const pick=sc.slice(0, p.top).filter(x=>x.m>0), raw={}; for (const x of pick) if (D.ind[x.s].vol[i]>0) raw[x.s]=1/D.ind[x.s].vol[i];
      const tot=Object.values(raw).reduce((a,b)=>a+b,0), w={}; for (const s in raw) w[s]=raw[s]/tot; st.w=dlyVolTarget(D, w, i, p.vt); st.next=i+p.every; return st.w; } },
  { id:'mombull', name:['Momentum + Bull Filter','Momentum + Boğa Filtresi'], ico:'🐂', ref:['Liu, Tsyvinski, Wu 2022; Han, Kang, Ryu (momentum lives in bull markets); Hoffstein (rebalance timing luck)','Liu, Tsyvinski, Wu 2022; Han, Kang, Ryu (momentum boğa piyasasında yaşar); Hoffstein (yeniden dengeleme zamanlama şansı)'],
    d:['Momentum Rotation, but only while Bitcoin’s own trend is up (at least 2 of its 4 averages below the price); otherwise all cash. Research finds crypto momentum works mostly in rising markets. The money is split into 7 slices, each rebalanced on a different weekday, so the result does not hinge on the trading day.','Momentum Rotasyonu, ama sadece Bitcoin’in kendi trendi yukarıyken (4 ortalamasından en az 2’si fiyatın altında); yoksa tamamen nakit. Araştırmalar kripto momentumunun çoğunlukla yükselen piyasada çalıştığını buluyor. Para 7 dilime bölünür, her dilim haftanın farklı bir günü dengelenir; böylece sonuç işlem gününe bağlı kalmaz.'],
    p:{ f:'ens', slices:7 }, w(D, i, p, st){ const m=DLY_STRATS.find(x=>x.id==='mom'), n=p.slices||1, T=st.t||(st.t=Array.from({ length:n }, ()=>({}))), w={};
      for (let k=0;k<n;k++){ const x=m.w(D, i, { ...m.p, phase:(p.phase||0)+k }, T[k]); for (const s in x) w[s]=(w[s]||0)+x[s]/n; }
      return (p.f==='sma50' ? D.px.BTC.c[i]>D.ind.BTC.sma[50][i] : dlyEns(D, 'BTC', i)>=.5) ? w : {}; } },
  { id:'core', name:['Core + Satellite','Çekirdek + Uydu'], ico:'🪐', ref:['a mix of the two above','yukarıdaki ikisinin karışımı'],
    d:['60% follows the BTC Guard with its risk brake, 40% the Trend Ensemble. Two different trend views, one account.','%60 risk frenli BTC Koruyucu’yu, %40 Trend Topluluğu’nu izler. İki farklı trend görüşü, tek hesap.'],
    p:{}, w(D, i, p, st){ const a=DLY_STRATS.find(x=>x.id==='guardvt'), b=DLY_STRATS.find(x=>x.id==='trend'), wa=a.w(D, i, a.p, st.a||(st.a={})), wb=b.w(D, i, b.p, st.b||(st.b={})), w={};
      for (const s in wa) w[s]=(w[s]||0)+.6*wa[s]; for (const s in wb) w[s]=(w[s]||0)+.4*wb[s]; return w; } },
];
// the same rule with other settings, kept for the record: every variant tried counts against luck in the deflated Sharpe ratio
const DLY_VARIANTS = [ { of:'mombull', p:{ f:'sma50', slices:7 } }, { of:'mombull', p:{ f:'ens', slices:1 } }, { of:'guard', p:{ sma:100, vt:0 } }, { of:'guard', p:{ sma:200, vt:0 } }, { of:'guardvt', p:{ sma:100, vt:.4 } }, { of:'guardvt', p:{ sma:200, vt:.4 } }, { of:'mom', p:{ top:5, vt:.4, every:7 } } ];

// ---- the backtester: weights decided at a close are held from that close; holdings drift with prices; trades only when a weight is off by more than the band
function dlyNew(){ return { E:1, cur:{}, st:{}, i:null, eq:[], gross:[], turn:0, trades:0, cost:0, rets:[] }; }
function dlyStep(D, S, p, A, i, C){ const prev=A.i; A.i=i;
  if (prev!=null){ let tot=1-Object.values(A.cur).reduce((a,b)=>a+b,0); const nw={};
    for (const s in A.cur){ const a=D.px[s].c[prev], b=D.px[s].c[i]; if (isFinite(a) && isFinite(b)){ nw[s]=A.cur[s]*b/a; tot+=nw[s]; } else tot+=A.cur[s]; }   // a coin with no price (delisted) is sold at its last close
    if (C.cash) tot+=(1-Object.values(A.cur).reduce((a,b)=>a+b,0))*C.cash*(D.days[i]-D.days[prev])/(365*DLY_DAY);   // interest on the cash share (stablecoin savings), if chosen
    const E=A.E*tot; A.rets.push(tot-1); A.E=E; A.cur={}; for (const s in nw) A.cur[s]=nw[s]/tot; }
  const T=S.w(D, i, p, A.st)||{}; let turn=0;
  for (const s of new Set([...Object.keys(A.cur), ...Object.keys(T)])){ const have=A.cur[s]||0, want=T[s]||0, d=want-have;
    if (Math.abs(d)<=Math.max(.02, .2*Math.max(want, have)) && want>0 && have>0) continue; if (Math.abs(d)<1e-9) continue;
    turn+=Math.abs(d); A.trades++; if (want>0) A.cur[s]=want; else delete A.cur[s]; }
  const cost=turn*(C.fee+C.slip); A.E*=1-cost; A.cost+=cost; A.turn+=turn; A.eq.push(A.E); A.gross.push(Object.values(A.cur).reduce((a,b)=>a+b,0)); return T; }
function dlyRun(D, S, p, C, from, to){ const A=dlyNew(); for (let i=from;i<=to;i++) dlyStep(D, S, p, A, i, C); return A; }

// ---- statistics
function dlyStats(eq, rets, days, gross){ const n=rets.length; if (n<30) return null; const m=rets.reduce((a,b)=>a+b,0)/n, sd=Math.sqrt(rets.reduce((a,b)=>a+(b-m)**2,0)/(n-1)), dn=Math.sqrt(rets.reduce((a,b)=>a+Math.min(0,b)**2,0)/n);
  let pk=eq[0], dd=0; for (const v of eq){ pk=Math.max(pk, v); dd=Math.max(dd, 1-v/pk); } const yrs=n/365, cagr=Math.pow(eq[eq.length-1]/eq[0], 1/yrs)-1;
  const sk=rets.reduce((a,b)=>a+((b-m)/sd)**3,0)/n, ku=rets.reduce((a,b)=>a+((b-m)/sd)**4,0)/n;
  const by={}; for (let k=1;k<eq.length;k++){ const y=new Date(days[k]).getUTCFullYear(); by[y]=(by[y]||1)*eq[k]/eq[k-1]; } const years={}; for (const y in by) years[y]=by[y]-1;
  return { ret:eq[eq.length-1]/eq[0]-1, cagr, vol:sd*Math.sqrt(365), sharpe:sd>0 ? m/sd*Math.sqrt(365) : 0, sortino:dn>0 ? m/dn*Math.sqrt(365) : 0, dd, calmar:dd>0 ? cagr/dd : null, srd:sd>0 ? m/sd : 0, skew:sk, kurt:ku, n, years,
    expo:gross ? gross.reduce((a,b)=>a+b,0)/gross.length : null }; }
// the deflated Sharpe ratio (Bailey & López de Prado 2014): the chance the true Sharpe is above zero, after allowing for the number of variants tried and for fat tails
const dlyPhi = x => { const t=1/(1+.2316419*Math.abs(x)), d=.3989423*Math.exp(-x*x/2), p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return x>0 ? 1-p : p; };
function dlyPhiInv(p){ let lo=-10, hi=10; for (let k=0;k<100;k++){ const m=(lo+hi)/2; if (dlyPhi(m)<p) lo=m; else hi=m; } return (lo+hi)/2; }
function dlyDSR(st, srs){ const N=Math.max(2, srs.length), m=srs.reduce((a,b)=>a+b,0)/srs.length, v=srs.length>1 ? srs.reduce((a,b)=>a+(b-m)**2,0)/(srs.length-1) : 0, g=.5772156649;
  const sr0=Math.sqrt(v)*((1-g)*dlyPhiInv(1-1/N)+g*dlyPhiInv(1-1/(N*Math.E))), SR=st.srd, den=Math.sqrt(Math.max(1e-12, 1-st.skew*SR+(st.kurt-1)/4*SR*SR));
  return dlyPhi((SR-sr0)*Math.sqrt(st.n-1)/den); }
// the real-money check for a daily strategy: all five must hold
function dlyReady(r, btc){ const ys=Object.values(r.years||{}), up=ys.filter(v=>v>0).length; const c=[
    [r.cagr>0, ['makes money after standard fees','standart ücretlerden sonra kazandırıyor']], [r.dsr>=.95, [`deflated Sharpe ≥ 95% (${Math.round((r.dsr||0)*100)}%)`,`deflated Sharpe ≥ %95 (%${Math.round((r.dsr||0)*100)})`]],
    [r.sharpe>btc.sharpe, ['better risk-adjusted than holding Bitcoin','risk-düzeltmeli olarak Bitcoin tutmaktan iyi']], [r.dd<=btc.dd*.6, ['deepest fall at most 60% of Bitcoin’s','en derin düşüş Bitcoin’inkinin en fazla %60’ı']],
    [ys.length && up/ys.length>=2/3, [`up in at least 2 of 3 years (${up}/${ys.length})`,`yılların en az 2/3’ünde artıda (${up}/${ys.length})`]] ];
  return { ok:c.every(x=>x[0]), pass:c.filter(x=>x[0]).length, c }; }
// today's targets for every strategy, and yesterday's, from the latest finished day
function dlyToday(D){ const n=D.days.length, out={}; for (const S of DLY_STRATS){ const A=dlyNew(); for (let i=Math.max(1, n-400);i<n;i++){ const T=dlyStep(D, S, S.p, A, i, DLY_COST.taker); if (i===n-2) out[S.id]={ prev:{ ...T } }; if (i===n-1) out[S.id]={ ...(out[S.id]||{}), now:{ ...T } }; } } return out; }
// the coins' trend and momentum today (for the report)
function dlyBoard(D){ const i=D.days.length-1, rows=[];
  for (const s of D.syms){ if (!dlyOk(D, s, i)) continue; const I=D.ind[s], c=D.px[s].c; let k=0, m=0; for (const lb of DLY_LB){ if (I.age[i]<=lb) continue; m++; if (dlyChanOn(D, s, lb, i)) k++; }
    const mom=I.age[i]>28 ? ([7,14,28].map(j=>c[i]/c[i-j]-1).reduce((a,b)=>a+b,0)/3) : null; rows.push({ s, trend:m ? k/m : null, mom, vol:I.vol[i], sma50:I.sma[50][i] ? c[i]/I.sma[50][i]-1 : null, sma200:I.sma[200][i] ? c[i]/I.sma[200][i]-1 : null, px:c[i] }); }
  const ranked=rows.filter(r=>r.mom!=null).sort((a,b)=>b.mom-a.mom); ranked.forEach((r,k)=>r.rank=k+1); return rows; }
function dlyChanOn(D, s, lb, i){ const I=D.ind[s], c=D.px[s].c; let on=0; for (let j=Math.max(1, i-400);j<=i;j++){ if (!isFinite(c[j]) || I.age[j]<=lb) { on=0; continue; } if (on){ if (c[j]<=I.lo[lb][j]) on=0; } else if (c[j]>=I.hi[lb][j]) on=1; } return !!on; }
// browser: load the last 400 days of every coin (cached for the session), then build
async function dlyLoad(force){ if (DLY.status==='loading') return; if (DLY.D && !force && Date.now()-DLY.t<30*60000) return; DLY.status='loading';
  try{ const from=Math.floor(Date.now()/DLY_DAY)*DLY_DAY-400*DLY_DAY, res=await Promise.allSettled(DLY_U.map(s=>dlyFetch(s, from)));
    const raw={}; res.forEach((r,k)=>{ if (r.status==='fulfilled' && r.value.length>60 && r.value[r.value.length-1][0]>=Date.now()-5*DLY_DAY) raw[DLY_U[k]]=r.value; });
    if (!raw.BTC) throw new Error('no Bitcoin candles'); DLY.D=dlyBuild(raw); DLY.t=Date.now(); DLY.status='live'; }
  catch(e){ DLY.status='offline'; DLY.err=String(e.message||e); } }

// ideas tried in round 2 that did not pass the exam (better on 2018-06 → 2022-08, worse after): kept on record, counted against luck, never traded
const DLY_TRIED = [
  { id:'guardens', name:['BTC Guard, four averages','BTC Koruyucu, dört ortalama'], vs:'guard', why:['No better than the 50-day Guard even in development.','Geliştirme döneminde bile 50 günlük Koruyucu’dan iyi değildi.'],
    p:{ vt:0 }, w(D, i, p){ const e=dlyEns(D, 'BTC', i); if (!e) return {}; const w={ BTC:e }; return p.vt ? dlyVolTarget(D, w, i, p.vt) : w; }, vars:[{ vt:.4 }] },
  { id:'duo', name:['BTC + ETH Guard','BTC + ETH Koruyucu'], vs:'guardvt', why:['Better than the Guard + Risk Brake in development, worse in the exam: Ether lagged after 2022.','Geliştirmede Koruyucu + Risk Freni’nden iyi, sınavda daha kötü: Ether 2022’den sonra geride kaldı.'],
    p:{ sig:'ens', vt:.4 }, w(D, i, p){ const raw={}; let tot=0; for (const s of ['BTC','ETH']){ if (!dlyOk(D, s, i) || !(D.ind[s].vol[i]>0)) continue; tot+=1/D.ind[s].vol[i]; const sig=p.sig==='ens' ? dlyEns(D, s, i) : (D.px[s].c[i]>D.ind[s].sma[50][i] ? 1 : 0); if (sig>0) raw[s]=sig/D.ind[s].vol[i]; }
      const w={}; for (const s in raw) w[s]=raw[s]/tot; return Object.keys(w).length ? dlyVolTarget(D, w, i, p.vt) : {}; }, vars:[{ sig:'sma50', vt:.4 }] },
  { id:'mix', name:['Risk-Balanced Mix','Risk Dengeli Karışım'], vs:'core', why:['Far better than Core + Satellite in development; in the exam no better (its edge did not carry over).','Geliştirmede Çekirdek + Uydu’dan çok daha iyi; sınavda daha iyi değil (avantajı devam etmedi).'],
    p:{ vt:.35 }, w(D, i, p, st){ const g=DLY_TRIED[0], t=DLY_STRATS.find(x=>x.id==='trend'), m=DLY_STRATS.find(x=>x.id==='mombull'), a=g.w(D, i, { vt:.4 }), b=t.w(D, i, t.p, st.b||(st.b={})), c=m.w(D, i, m.p, st.c||(st.c={})), w={};
      for (const x of [a, b, c]) for (const s in x) w[s]=(w[s]||0)+x[s]/3; return p.vt ? dlyVolTarget(D, w, i, p.vt) : w; }, vars:[{ vt:0 }] } ];

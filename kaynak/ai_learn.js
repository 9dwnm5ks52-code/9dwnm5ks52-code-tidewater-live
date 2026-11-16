/* ---------- Tidewater Live: the bots that learn and improve themselves ----------
   All free and local, all on real prices. Every learner is scored walk-forward: a guess is graded before the bot sees the answer.
   Candle learners (the three forecasters on hourly crypto candles, the Q-Learning Agent on 5-minute candles of the coins and 8 big US stocks):
     knn     Pattern Matcher   k-nearest neighbours: remembers past situations and what came next, votes with the 50 most alike
     nb      Bayesian Classifier   Gaussian naive Bayes: learns how each signal is spread before rises and before falls
     forest  Random Forest   a random forest of 15 small decision trees, regrown every 150 new examples
     q       Q-Learning Agent      reinforcement learning (Q-learning with experience replay): learns from rewards when to be in or out
   Stock learners (a snapshot of about 800 big US companies every 5 minutes while the market is open):
     rank    Cross-Sectional Ranker  learns which signals predict which stocks beat the others next, holds the top 5
     sector  Sector Rotator   learns which sectors lead, holds the ETFs of the top 3 */
const AI_STOCKS = ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','SPY'];
const AI_PROB = ['knn','nb','forest'];
// ---- small tools
function aiRng(M){ let t=(M.rs=(M.rs+0x6D2B79F5)>>>0); t=Math.imul(t^t>>>15, t|1); t^=t+Math.imul(t^t>>>7, t|61); return ((t^t>>>14)>>>0)/4294967296; }
const aiR5 = v => Math.round(v*1e5)/1e5;
function scNew(k){ return { n:0, m:Array(k).fill(0), s:Array(k).fill(0) }; }
function scAdd(sc, x){ sc.n++; for (let j=0;j<x.length;j++){ const d=x[j]-sc.m[j]; sc.m[j]+=d/sc.n; sc.s[j]+=d*(x[j]-sc.m[j]); } }
const aiHit = (M, p, y) => { if (M.n>=50){ M.hits.push((p>=.5)===(y===1) ? 1 : 0); if (M.hits.length>300) M.hits.shift(); } };
// ---- the probability learners: p(M, x) is the chance the next 15 minutes go up; fit(M, x, y) learns one answer
const AIL = {
  knn:{ init:()=>({ mem:[], max:2000, k:50, sc:scNew(AI_FEATS.length), hits:[], n:0, seen:{} }),
    p(M, x){ if (M.mem.length<60) return .5; const sc=M.sc, k=x.length, iv=new Array(k), best=[];
      for (let j=0;j<k;j++){ const sd=sc.n>1 ? Math.sqrt(sc.s[j]/(sc.n-1)) : 0; iv[j]=sd>0 ? 1/sd : 0; }
      for (const e of M.mem){ let d=0; for (let j=0;j<k;j++){ const u=(x[j]-e.x[j])*iv[j]; d+=u*u; } d=Math.sqrt(d);
        if (best.length<M.k){ best.push({ d, y:e.y }); if (best.length===M.k) best.sort((a,b)=>a.d-b.d); } else if (d<best[M.k-1].d){ best[M.k-1]={ d, y:e.y }; best.sort((a,b)=>a.d-b.d); } }
      let w=0, s=0; for (const b of best){ const wi=1/(b.d+.25); w+=wi; s+=wi*b.y; } return (s+.5)/(w+1); },
    fit(M, x, y){ scAdd(M.sc, x); M.mem.push({ x:x.map(aiR5), y }); if (M.mem.length>M.max) M.mem.shift(); } },
  nb:{ init:()=>({ c:[scNew(AI_FEATS.length), scNew(AI_FEATS.length)], hits:[], n:0, seen:{} }),
    p(M, x){ const [c0, c1]=M.c; if (c0.n<20 || c1.n<20) return .5; let ll=Math.log(c1.n/c0.n);
      for (let j=0;j<x.length;j++){ const v0=c0.s[j]/(c0.n-1)+1e-14, v1=c1.s[j]/(c1.n-1)+1e-14; ll+=-.5*Math.log(v1/v0)-(x[j]-c1.m[j])**2/(2*v1)+(x[j]-c0.m[j])**2/(2*v0); }
      return 1/(1+Math.exp(-Math.max(-30, Math.min(30, ll/3)))); },   // tempered: naive Bayes is famously over-sure
    fit(M, x, y){ scAdd(M.c[y], x); } },
  forest:{ init:()=>({ trees:[], buf:[], max:1500, since:0, grown:0, hits:[], n:0, seen:{}, rs:77 }),
    leaf(t, x){ let n=t; while (n.f!=null) n = x[n.f]<=n.v ? n.l : n.r; return n.p; },
    p(M, x){ if (!M.trees.length) return .5; let s=0; for (const t of M.trees) s+=AIL.forest.leaf(t, x); return s/M.trees.length; },
    fit(M, x, y){ (M.buf||(M.buf=[])).push({ x, y }); if (M.buf.length>M.max) M.buf.shift(); if (++M.since>=150 && M.buf.length>=300){ AIL.forest.grow(M); M.since=0; } },
    grow(M){ const T=[]; for (let k=0;k<15;k++){ const S=Array.from({ length:Math.min(600, M.buf.length) }, ()=>M.buf[Math.floor(aiRng(M)*M.buf.length)]); T.push(AIL.forest.node(M, S, 0)); } M.trees=T; M.grown++; },
    node(M, S, depth){ const pos=S.filter(s=>s.y===1).length, p=(pos+1)/(S.length+2); if (depth>=3 || S.length<40 || pos===0 || pos===S.length) return { p };
      const gini=(a,n)=>n ? 1-(a/n)**2-((n-a)/n)**2 : 0; let best=null; const feats=[...Array(S[0].x.length).keys()].sort(()=>aiRng(M)-.5).slice(0, Math.max(4, Math.round(Math.sqrt(S[0].x.length)+1)));
      for (const f of feats){ const vals=S.map(s=>s.x[f]).sort((a,b)=>a-b); for (const q of [.2,.35,.5,.65,.8]){ const v=vals[Math.floor(q*(vals.length-1))]; let nl=0, pl=0; for (const s of S) if (s.x[f]<=v){ nl++; pl+=s.y; }
        const nr=S.length-nl, pr=pos-pl; if (nl<15 || nr<15) continue; const g=(nl*gini(pl,nl)+nr*gini(pr,nr))/S.length; if (!best || g<best.g) best={ g, f, v }; } }
      if (!best) return { p }; return { f:best.f, v:best.v, l:AIL.forest.node(M, S.filter(s=>s.x[best.f]<=best.v), depth+1), r:AIL.forest.node(M, S.filter(s=>s.x[best.f]>best.v), depth+1) }; } },
};
// learn from every candle of this symbol whose answer is now known (score first, then learn)
function aiTrainP(id, M, sym, bars, I, rec){ const L=AIL[id], H=AI_CFG.H, from=M.seen[sym]||0; let n=0;
  for (let i=60;i+H<bars.length;i++){ if (bars[i].t<=from) continue; const x=aiFeat(I, i); if (!x) continue; const y=aiLabel(bars, i, sym);
    const p0=L.p(M, x); aiHit(M, p0, y); if (rec) rec(bars[i].t, p0, bars[i].c, bars[i+H].c/bars[i].c-1); L.fit(M, x, y);
    if (AI_CFG.SHORT && !aiIsStock(sym)) L.fit(M, aiMirrorX(x), aiLabelDn(bars, i, sym));   // the mirrored example: learning falls from the same candles
    M.n++; M.seen[sym]=bars[i].t; n++; } return n; }
// ---- Q-learning: 60 states (trend, RSI band, 1-hour move, in or out) x 2 actions (stay, switch)
function qState(I, i, h){ const tr=I.e12[i]>I.e26[i] ? 1 : 0, r=I.rsi[i], rb=r<30 ? 0 : r<45 ? 1 : r<55 ? 2 : r<70 ? 3 : 4, m=I.c[i]/I.c[i-12]-1, mb=m<-.005 ? 0 : m>.005 ? 2 : 1; return ((tr*5+rb)*3+mb)*2+h; }
// experience replay: each new step is followed by a few past ones, so rare situations are practised more than once
const QL = { init:()=>({ Q:Array(120).fill(0), cnt:Array(120).fill(0), vis:Array(60).fill(0), g:.8, n:0, seen:{}, rs:31, rb:[] }),
  // the step shrinks as a case is seen more often, so noisy rewards average out
  upd(M, s, a, r, s2){ const k=s*2+a, c=(M.cnt||(M.cnt=Array(120).fill(0)))[k]++, al=Math.max(.01, 1/Math.pow(1+c, .6)); M.Q[k]+=al*(r+M.g*Math.max(M.Q[s2*2], M.Q[s2*2+1])-M.Q[k]); },
  train(M, sym, bars, I, fee){ const from=M.seen[sym]||0; let n=0; const rb=M.rb||(M.rb=[]);
    for (let i=60;i+1<bars.length;i++){ if (bars[i].t<=from) continue; const g=Math.log(I.c[i+1]/I.c[i])*100;
      // a small trader does not move the price, so every candle teaches all four cases: in or out, stay or switch
      for (const h of [0,1]) for (const a of [0,1]){ const s=qState(I, i, h), h2=a ? 1-h : h, r=(h2 ? g : 0)-(a ? fee*100 : 0), s2=qState(I, i+1, h2); QL.upd(M, s, a, r, s2); rb.push([s, a, r, s2]); }
      while (rb.length>4000) rb.shift(); for (let k=0;k<8 && rb.length>200;k++){ const e=rb[Math.floor(aiRng(M)*rb.length)]; QL.upd(M, e[0], e[1], e[2], e[3]); }
      const s=qState(I, i, 0);
      M.vis[s>>1]++; M.seen[sym]=bars[i].t; M.n++; n++; } return n; } };
// ---- stock learners: snapshots of big US companies
const STK = { snap:null, prev:null, t:0, k:0, status:'idle', err:'', busy:false };
const STK_COLS = ['name','close','change','change_from_open','Perf.W','Perf.1M','Perf.3M','RSI','SMA50','SMA200','relative_volume_10d_calc','Volatility.D','beta_1_year','sector'];
const STK_SECT = { 'Electronic Technology':'XLK','Technology Services':'IGV','Finance':'XLF','Health Technology':'XLV','Health Services':'IHF','Retail Trade':'XRT','Consumer Non-Durables':'XLP','Consumer Durables':'XLY','Consumer Services':'PEJ','Energy Minerals':'XLE','Utilities':'XLU','Transportation':'IYT','Communications':'XLC','Process Industries':'XLB','Non-Energy Minerals':'XME','Producer Manufacturing':'XLI','Industrial Services':'PAVE','Commercial Services':'XLI' };
function stkRows(data){ const out={}; for (const r of data||[]){ const v=r.d, px=v[1]; if (!(px>0)) continue; const n=(i,d)=>v[i]!=null && isFinite(v[i]) ? v[i] : d;
    out[mktKey(v[0])]={ px, sec:v[13]||'', f:[n(2,0)/100, n(3,0)/100, n(4,0)/100, n(5,0)/100, n(6,0)/100, n(7,50)/100-.5, n(8,px) ? px/n(8,px)-1 : 0, n(9,px) ? px/n(9,px)-1 : 0, Math.log(Math.max(.05, n(10,1))), n(11,0)/100, n(12,1)] }; }
  // the same signal means different things on different days, so each one is ranked against the others in the same snapshot
  const ks=Object.keys(out), k=11; for (let j=0;j<k;j++){ let m=0, s=0; for (const sym of ks) m+=out[sym].f[j]; m/=ks.length||1; for (const sym of ks) s+=(out[sym].f[j]-m)**2; s=Math.sqrt(s/(ks.length||1))||1;
    for (const sym of ks) (out[sym].z||(out[sym].z=[]))[j]=Math.max(-4, Math.min(4, (out[sym].f[j]-m)/s)); }
  return out; }
async function stkLoad(){ const x=await mktPost({ filter:[{ left:'market_cap_basic', operation:'greater', right:1e10 }, { left:'type', operation:'equal', right:'stock' }, { left:'exchange', operation:'in_range', right:['NASDAQ','NYSE','AMEX'] }, { left:'close', operation:'greater', right:5 }],
    columns:STK_COLS, range:[0,1200], sort:{ sortBy:'market_cap_basic', sortOrder:'desc' } }); const rows=stkRows(x.data); if (Object.keys(rows).length<50) throw new Error('empty');
  STK.prev=STK.snap; STK.snap={ t:Date.now(), rows }; STK.t=STK.snap.t; STK.k++; STK.status='live'; return STK.snap; }
function spearman(a, b){ const rk=v=>{ const o=v.map((x,i)=>[x,i]).sort((p,q)=>p[0]-q[0]), r=Array(v.length); o.forEach((e,k)=>{ r[e[1]]=k; }); return r; }, ra=rk(a), rb=rk(b), n=a.length; if (n<5) return 0;
  let d=0; for (let i=0;i<n;i++) d+=(ra[i]-rb[i])**2; return 1-6*d/(n*(n*n-1)); }
const RK = { init:()=>({ w:Array(11).fill(0), b:0, n:0, lr:.003, ic:[], hits:[], seen:{} }),
  score:(M, z)=>z.reduce((s,v,j)=>s+v*M.w[j], M.b),
  learn(M, prev, snap){ const ks=Object.keys(prev.rows).filter(s=>snap.rows[s]); if (ks.length<50) return 0; const r=ks.map(s=>snap.rows[s].px/prev.rows[s].px-1), mean=r.reduce((a,b)=>a+b,0)/r.length;
    const pred=ks.map(s=>RK.score(M, prev.rows[s].z)); if (M.n>0){ M.ic.push(spearman(pred, r)); if (M.ic.length>60) M.ic.shift(); }
    ks.forEach((s,i)=>{ const z=prev.rows[s].z, y=Math.max(-3, Math.min(3, (r[i]-mean)*100)), e=y-RK.score(M, z); for (let j=0;j<z.length;j++) M.w[j]+=M.lr*(e*z[j]-.01*M.w[j]); M.b+=M.lr*e*.1; M.n++; }); return ks.length; } };
const SR = { init:()=>({ w:[0,0,0,0,0], b:0, n:0, lr:.02, hits:[], seen:{} }), F:[0,1,2,3,5],
  agg(snap){ const by={}; for (const s in snap.rows){ const r=snap.rows[s], e=STK_SECT[r.sec]; if (!e) continue; const g=by[r.sec]||(by[r.sec]={ n:0, z:Array(5).fill(0), px:{} }); g.n++; SR.F.forEach((j,k)=>{ g.z[k]+=r.z[j]; }); g.px[s]=r.px; }
    for (const k in by){ const g=by[k]; g.z=g.z.map(v=>v/g.n); } return by; },
  score:(M, z)=>z.reduce((s,v,j)=>s+v*M.w[j], M.b),
  learn(M, prev, snap){ const a=SR.agg(prev), out=[]; for (const sec in a){ const rs=Object.keys(a[sec].px).filter(s=>snap.rows[s]).map(s=>snap.rows[s].px/a[sec].px[s]-1); if (rs.length>=3) out.push({ sec, z:a[sec].z, r:rs.reduce((x,y)=>x+y,0)/rs.length }); }
    if (out.length<5) return 0; const mean=out.reduce((x,o)=>x+o.r,0)/out.length, best=out.slice().sort((p,q)=>SR.score(M,q.z)-SR.score(M,p.z))[0];
    if (M.n>0){ M.hits.push(best.r>mean ? 1 : 0); if (M.hits.length>200) M.hits.shift(); }
    for (const o of out){ const y=Math.max(-3, Math.min(3, (o.r-mean)*100)), e=y-SR.score(M, o.z); for (let j=0;j<5;j++) M.w[j]+=M.lr*(e*o.z[j]-.01*M.w[j]); M.n++; } return out.length; } };
// one stock bot's turn after a new snapshot: learn from what the last one predicted, then rebalance every 30 minutes
function stkStep(bots, quoteOf, now){ const snap=STK.snap, prev=STK.prev, out=[]; if (!snap) return out;
  for (const bot of bots){ if (bot.id!=='rank' && bot.id!=='sector') continue; const M=bot.model;
    if (prev && M.seen.snap!==snap.t){ M.seen.snap=snap.t; (bot.id==='rank' ? RK : SR).learn(M, prev, snap); }
    if (!bot.on) continue; if (!M.n){ bot.think.US={ code:'stk_learning', vals:{ n:0 }, t:now }; continue; }
    if (M.reb && now-M.reb<29*60000 && Object.keys(bot.meta).length) { bot.think.US={ code:'stk_hold', vals:{ n:M.n }, t:now }; continue; } M.reb=now;
    let want; if (bot.id==='rank'){ const ranked=Object.keys(snap.rows).map(s=>({ s, v:RK.score(M, snap.rows[s].z) })).sort((a,b)=>b.v-a.v); want=ranked.slice(0,5).map(x=>x.s); bot.think.US={ code:'rank_pick', vals:{ top:want, keep:ranked.slice(0,15).map(x=>x.s) }, t:now };
      for (const s of Object.keys(bot.meta)) if (!ranked.slice(0,15).some(x=>x.s===s)){ const q=quoteOf(s); if (q && q.open && aiSell(bot, s, q, 'rank_out', { rank:ranked.findIndex(x=>x.s===s)+1 }, now)) out.push({ bot:bot.id, sym:s, act:'s' }); } }
    else { const a=SR.agg(snap), secs=Object.keys(a).map(sec=>({ sec, e:STK_SECT[sec], v:SR.score(M, a[sec].z) })).sort((x,y)=>y.v-x.v), seen=new Set(); want=[]; for (const x of secs){ if (!seen.has(x.e) && quoteOf(x.e)){ seen.add(x.e); want.push(x.e); } if (want.length===3) break; }
      bot.think.US={ code:'sector_pick', vals:{ top:want, secs:secs.slice(0,3).map(x=>x.sec) }, t:now };
      for (const s of Object.keys(bot.meta)) if (!want.includes(s)){ const q=quoteOf(s); if (q && q.open && aiSell(bot, s, q, 'sector_out', {}, now)) out.push({ bot:bot.id, sym:s, act:'s' }); } }
    const slots=bot.id==='rank' ? 5 : 3, size=bot.id==='rank' ? .19 : .31;
    for (const s of want){ if (bot.meta[s] || Object.keys(bot.meta).length>=slots) continue; const q=quoteOf(s); if (!q || !q.open) continue; const E=brkEquity(bot.A, { [s]:q }), usd=Math.min(brkFree(bot.A)*.995, E*size); if (usd<20) continue;
      const r=brkOrder(bot.A, { sym:s, kind:'stock', side:'b', usd }, q, now); if (!r.ok || !r.fill) continue; bot.meta[s]={ entry:r.fill.px, stop:r.fill.px*.92, peak:r.fill.px, t:now, bt:now };
      aiLog(bot, { t:now, sym:s, act:'b', code:bot.id==='rank' ? 'rank_buy' : 'sector_buy', vals:{ rank:want.indexOf(s)+1, sec:bot.id==='sector' ? Object.keys(STK_SECT).find(k=>STK_SECT[k]===s) : null }, px:r.fill.px, q:r.fill.q, usd:r.fill.q*r.fill.px }); out.push({ bot:bot.id, sym:s, act:'b' }); } }
  return out; }

/* ---------- Tidewater Live: the bots that trade by themselves (the engine) ----------
   Free and local: everything runs in this browser on real Binance (or Coinbase) candles. No paid service, no AI service.
   The learners are in ai_learn.js: three forecasters (Pattern Matcher, Bayesian Classifier, Random Forest), a Q-Learning Agent, and two stock bots.
   Every forecast is scored walk-forward (before the bot sees the answer), and a bot opens trades only where its own record shows an edge after costs.
   Each bot has its own $10,000 paper account with the same broker, prices and 0.1% fee as you. They trade only while this page is open. */
const AI_COINS = ['BTC','ETH','SOL','BNB','XRP','DOGE'];
const AI_CFG = { V:5, SHORT:true, HH:4, CASH:10000, SIZE:.3, MAX_POS:3, BAR:300000, H:12, MIN_P:.5, EXIT_P:.3, LOG:80, HEAT:.06, WIN:1000 };
const AI_DEFS = [ { id:'knn', name:'Pattern Matcher', kind:'ml' }, { id:'nb', name:'Bayesian Classifier', kind:'ml' }, { id:'forest', name:'Random Forest', kind:'ml' },
  { id:'q', name:'Q-Learning Agent', kind:'rl' }, { id:'rank', name:'Cross-Sectional Ranker', kind:'stocks' }, { id:'sector', name:'Sector Rotator', kind:'stocks' } ];
// bots that were retired (none of them beat holding Bitcoin in the 90-day Arena); saved states and the server drop them on load
// (their names are kept only for the note that tells a user their money came back)
const AI_GONE = { trend:'Trend Follower', band:'Mean Reversion', learn:'Logistic Model', mlp:'Neural Network', gbm:'Gradient Booster', ga:'Genetic Optimizer', bandit:'Adaptive Bandit', council:'Ensemble Council', regime:'Regime Allocator' };
// keep only the bots of the current roster (and the user's own); used on every load, in the browser and on the server
const aiKeep = b => !!b && (!!b.custom || AI_DEFS.some(d=>d.id===b.id));
// v1: 8 signals and a 15-minute up-or-down target. v2 adds 7 signals and asks a harder, more useful question: will the next hour beat the costs?
const AI_F1 = ['m5','m15','m60','rsi','dist','band','vol','volu'], AI_F2 = AI_F1.concat(['m4h','volr','hi1d','lo1d','btc','hs','hc']), AI_F5 = AI_F2.concat(['fund','basis','lag']);
let AI_FEATS = AI_F5;
function aiSetV(v){ AI_CFG.V=v; AI_CFG.SHORT=v>=3; AI_FEATS = v===1 ? AI_F1 : v>=5 ? AI_F5 : AI_F2; AI_CFG.H = v===1 ? 3 : 12; AI_CFG.MIN_P = v===1 ? .6 : .5; AI_CFG.EXIT_P = v===1 ? .47 : .3; }
// the costs a trade must beat: two fees and a small margin
const aiThr = sym => 2*((typeof AI_STOCKS!=='undefined' && AI_STOCKS.includes(sym)) ? .0005 : BRK.FEES.crypto)+.001;
// the mirror of a situation: the same candles upside down (rises become falls). A model that learns from both sides can also spot a coming fall.
function aiMirrorX(x){ const y=x.slice(); for (const j of [0,1,2,3,4,5,8,12,15,16,17]) if (j<x.length) y[j]=-x[j]; if (x.length>11){ y[10]=-x[11]; y[11]=-x[10]; } return y; }
function aiLabelDn(bars, i, sym){ return bars[i+AI_CFG.H].c/bars[i].c-1 < -aiThr(sym) ? 1 : 0; }
function aiLabel(bars, i, sym){ const r=bars[i+AI_CFG.H].c/bars[i].c-1; return (AI_CFG.V>=2 ? r>aiThr(sym) : r>0) ? 1 : 0; }
const AI = { bars:{}, hb:{}, der:{ fund:{}, basis:{} }, btc:new Map(), btcH:new Map(), hT:0, status:'idle', err:'', t:0, listeners:[], timer:null, busy:false };
function aiOn(fn){ AI.listeners.push(fn); }
function aiEmit(kind){ for (const fn of AI.listeners){ try{ fn(kind); }catch(e){ console.error(e); } } }
// ---- indicators (each returns one value per bar)
function aiEMA(xs, n){ const k=2/(n+1), out=[]; let e=null; for (const x of xs){ e = e==null ? x : e+k*(x-e); out.push(e); } return out; }
function aiSMA(xs, n){ const out=[]; let s=0; for (let i=0;i<xs.length;i++){ s+=xs[i]; if (i>=n) s-=xs[i-n]; out.push(i>=n-1 ? s/n : null); } return out; }
function aiSD(xs, n){ const m=aiSMA(xs, n); return xs.map((_,i)=>{ if (i<n-1) return null; let v=0; for (let j=i-n+1;j<=i;j++) v+=(xs[j]-m[i])**2; return Math.sqrt(v/n); }); }
function aiRSI(xs, n){ n=n||14; const out=[null]; let up=0, dn=0;
  for (let i=1;i<xs.length;i++){ const d=xs[i]-xs[i-1], u=Math.max(d,0), w=Math.max(-d,0);
    if (i<=n){ up+=u; dn+=w; if (i===n){ up/=n; dn/=n; } out.push(i<n ? null : (dn===0 ? 100 : 100-100/(1+up/dn))); }
    else { up=(up*(n-1)+u)/n; dn=(dn*(n-1)+w)/n; out.push(dn===0 ? 100 : 100-100/(1+up/dn)); } } return out; }
function aiATR(bars, n){ n=n||14; const out=[]; let a=null;
  for (let i=0;i<bars.length;i++){ const b=bars[i], p=i ? bars[i-1].c : b.c, tr=Math.max(b.h-b.l, Math.abs(b.h-p), Math.abs(b.l-p)); a = a==null ? tr : (a*(n-1)+tr)/n; out.push(a); } return out; }
function aiInd(bars){ const c=bars.map(b=>b.c), v=bars.map(b=>b.v||0), sma=aiSMA(c,20), sd=aiSD(c,20);
  return { c, v, t:bars.map(b=>b.t), h:bars.map(b=>b.h), l:bars.map(b=>b.l), e12:aiEMA(c,12), e20:aiEMA(c,20), e26:aiEMA(c,26), e50:aiEMA(c,50), rsi:aiRSI(c,14), atr:aiATR(bars,14), sma, sd, vma:aiSMA(v,20) }; }
// ---- the learning bot's features for bar i (only bars up to i are used)
function aiFeat(I, i){ const c=I.c, v2=AI_CFG.V>=2; if (i<(v2 ? 290 : 60) || !I.sd[i] || !I.atr[i]) return null; const lo=I.sma[i]-2*I.sd[i], hi=I.sma[i]+2*I.sd[i];
  const x=[ c[i]/c[i-1]-1, c[i]/c[i-3]-1, c[i]/c[i-12]-1, I.rsi[i]/100-.5, (c[i]-I.e20[i])/I.atr[i], hi>lo ? (c[i]-lo)/(hi-lo)-.5 : 0, I.atr[i]/c[i], Math.log(((I.v[i]||0)+1)/((I.vma[i]||0)+1)) ];
  if (!v2) return x;
  // v2: the 4-hour move, today's volatility against normal, distance from the last day's high and low, what Bitcoin did in the last 15 minutes, the hour of the day
  let dh=-Infinity, dl=Infinity, am=0; for (let k=i-287;k<=i;k++){ if (I.h[k]>dh) dh=I.h[k]; if (I.l[k]<dl) dl=I.l[k]; } for (let k=i-199;k<=i;k++) am+=I.atr[k]/I.c[k]; am/=200;
  const t=I.t[i], b0=AI.btc.get(t), b3=AI.btc.get(t-3*AI_CFG.BAR), hr=2*Math.PI*((t/36e5)%24)/24;
  const x2=x.concat([ c[i]/c[i-48]-1, am>0 ? (I.atr[i]/c[i])/am-1 : 0, c[i]/dh-1, c[i]/dl-1, b0 && b3 ? b0/b3-1 : 0, Math.sin(hr), Math.cos(hr) ]); if (AI_CFG.V<5) return x2;
  // v5: the futures funding rate and the futures-spot gap (how crowded and how leveraged the bets are), and how far this coin lags Bitcoin's last move
  const b1=AI.btc.get(t-AI_CFG.BAR); return x2.concat([ aiFund(I.sym, t+AI_CFG.BAR)*1000, aiBasis(I.sym, t)*1000, I.sym==='BTC' || !b0 || !b1 ? 0 : (b0/b1-1)-(c[i]/c[i-1]-1) ]); }
const aiAcc = M => M.hits.length>=30 ? M.hits.reduce((a,b)=>a+b,0)/M.hits.length : null;
// ---- one decision for one bot on one coin, from closed bars only
function aiDecide(bot, sym, bars, I){ if (bot.custom) return stDecide(bot.custom.rules, bars, bot.meta[sym]); I=I||aiInd(bars); const i=bars.length-1, c=I.c[i], pos=bot.meta[sym]; if (i<60) return { code:'warm' };
  if (AI_PROB.includes(bot.id)){ const M=bot.model, x=aiFeat(I, i); if (!x || M.n<200) return { code:'learning', vals:{ n:M.n } };
    const p=AIL[bot.id].p(M, x), pd=AI_CFG.SHORT && !aiIsStock(sym) ? AIL[bot.id].p(M, aiMirrorX(x)) : null;
    bot.pnow=bot.pnow||{}; bot.pnow[sym]={ t:bars[i].t, p, pd }; aiHistAdd(bot, sym, bars[i].t, p, c, pd); return aiProbAct(pos, c, p, { p, pd, acc:aiAcc(M) }, { atr:I.atr[i], bot, t:bars[i].t, pd }); }
  if (bot.id==='q'){ const M=bot.model; if (M.n<500) return { code:'learning', vals:{ n:M.n } }; const st=qState(I, i, pos ? 1 : 0), stay=M.Q[st*2], sw=M.Q[st*2+1], vals={ stay, sw };
    if (pos && c<=pos.stop) return { act:'s', code:'stop', vals:{ stop:pos.stop } }; if (sw>stay+.02) return pos ? { act:'s', code:'q_sell', vals } : { act:'b', code:'q_buy', vals, stop:c*.97 }; return { code: pos ? 'q_hold' : 'q_wait', vals }; }
  return { code:'warm' }; }
function aiProbAct(pos, c, p, vals, X){ X=X||{}; const v2=AI_CFG.V>=2, minP=(X.bot && X.bot.tune && X.bot.tune.minP) || (v2 ? 1.01 : AI_CFG.MIN_P); vals.minP=minP;
  const minPs=(X.bot && X.bot.tune && X.bot.tune.minPs) || 1.01; vals.minPs=minPs;
  if (!pos){ if (p>=minP) return { act:'b', code:'ml_up', vals, stop:v2 && X.atr ? c-2*X.atr : c*.975, tp:v2 && X.atr ? c+3*X.atr : c*1.04 };
    if (AI_CFG.SHORT && X.pd!=null && X.pd>=minPs && X.atr) return { act:'ss', code:'ml_short', vals, stop:c+2*X.atr, tp:c-3*X.atr };
    return { code:minP>1 && (!AI_CFG.SHORT || minPs>1) ? 'ml_noedge' : 'ml_wait', vals }; }
  if (pos.dir===-1){ if (c>=pos.stop) return { act:'bc', code:'short_stop', vals:{ stop:pos.stop } }; if (pos.tp && c<=pos.tp) return { act:'bc', code:'short_tp', vals };
    if (X.pd!=null && X.pd<AI_CFG.EXIT_P) return { act:'bc', code:'ml_cover', vals }; if (X.t && pos.bt && X.t-pos.bt>=2*AI_CFG.H*AI_CFG.BAR && !(X.pd>=minPs)) return { act:'bc', code:'short_time', vals }; return { code:'ml_hold_short', vals }; }
  if (c<=pos.stop) return { act:'s', code:'stop', vals:{ stop:pos.stop } }; if (c>=(pos.tp || pos.entry*1.04)) return { act:'s', code:'take_profit', vals };
  if (p<AI_CFG.EXIT_P) return { act:'s', code:'ml_down', vals }; if (v2 && X.t && pos.bt && X.t-pos.bt>=2*AI_CFG.H*AI_CFG.BAR && p<minP) return { act:'s', code:'ml_time', vals }; return { code:'ml_hold', vals }; }
// every forecast is kept with what happened next, so the bot can tune its own entry threshold on its own record (past only)
function aiHistAdd(bot, sym, t, p, c, pd){ const h=bot.hist||(bot.hist=[]); if (h.length && h[h.length-1].s===sym && h[h.length-1].t===t) return; h.push({ s:sym, t, p:Math.round(p*1000)/1000, c, ...(pd!=null ? { pd:Math.round(pd*1000)/1000 } : {}) }); if (h.length>4000) h.shift(); }
// candles are 5 minutes apart, so a candle's place is found by arithmetic (checked, with a search as the fallback)
function aiIdx(bars, t){ const k=Math.round((t-bars[0].t)/AI_CFG.BAR); if (k>=0 && k<bars.length && bars[k].t===t) return k; let lo=0, hi=bars.length-1; while (lo<=hi){ const m=(lo+hi)>>1; if (bars[m].t===t) return m; if (bars[m].t<t) lo=m+1; else hi=m-1; } return -1; }
function aiHistFill(bot, sym, bars){ const h=bot.hist; if (!h || !h.length || !bars.length) return;
  for (let k=h.length-1;k>=0;k--){ const e=h[k]; if (e.s!==sym || e.r!=null) continue; if (e.t<bars[0].t) break; const i=aiIdx(bars, e.t), hz=e.hz||AI_CFG.H; if (i>=0 && i+hz<bars.length) e.r=bars[i+hz].c/e.c-1; } }
function aiTune(bot, now){ const h=(bot.hist||[]).filter(e=>e.r!=null); if (h.length<200) return null; const grid=AI_CFG.V>=2 ? [.35,.4,.45,.5,.55,.6,.65,.7,.75] : [.5,.55,.6,.65,.7,.75]; let best=null;
  // a threshold counts only with at least 30 calls and a gain that is statistically clear (t > 2), so trying many thresholds does not crown a lucky one
  for (const m of grid){ const xs=h.filter(e=>e.p>=m); if (xs.length<(AI_CFG.V>=2 ? 30 : 15)) continue; const rs=xs.map(e=>e.r-(aiThr(e.s)-.001)), net=rs.reduce((a,b)=>a+b,0)/rs.length, sd=Math.sqrt(rs.reduce((a,b)=>a+(b-net)**2,0)/(rs.length-1)), tt=sd>0 ? net/(sd/Math.sqrt(rs.length)) : 0;
    if (AI_CFG.V>=2 && tt<2) continue; if (!best || net>best.net) best={ m, net, n:xs.length, tt }; }
  const prev=bot.tune ? bot.tune.minP : null; bot.tune={ minP:best && best.net>0 ? best.m : (AI_CFG.V>=2 ? 1.01 : grid[grid.length-1]), at:now, net:best ? best.net : 0, n:best ? best.n : 0, prev, of:h.length };
  // the same test for shorts: a fall of more than the costs is the gain
  if (AI_CFG.SHORT){ let bs=null; for (const m of grid){ const xs=h.filter(e=>e.pd!=null && e.pd>=m); if (xs.length<30) continue; const rs=xs.map(e=>-e.r-(aiThr(e.s)-.001)-.0003*AI_CFG.H*AI_CFG.BAR/864e5), net=rs.reduce((a,b)=>a+b,0)/rs.length, sd=Math.sqrt(rs.reduce((a,b)=>a+(b-net)**2,0)/(rs.length-1)), tt=sd>0 ? net/(sd/Math.sqrt(rs.length)) : 0;
      if (tt<2) continue; if (!bs || net>bs.net) bs={ m, net, n:xs.length }; } bot.tune.minPs=bs && bs.net>0 ? bs.m : 1.01; bot.tune.nets=bs ? bs.net : 0; }
  return bot.tune; }
// position size by volatility: calmer coin, bigger position; wilder coin, smaller (between 8% and 35% of the money)
function aiSize(I, i){ const a=I.atr[i]/I.c[i]; let m=0, n=0; for (let k=Math.max(0, i-199);k<=i;k++){ m+=I.atr[k]/I.c[k]; n++; } m/=n||1; return Math.max(.08, Math.min(.35, AI_CFG.SIZE*(a>0 ? m/a : 1))); }
// ---- accounts and orders
function aiNew(){ return AI_DEFS.map(d=>aiBot(d.id)); }
function aiInit(id){ const L=AIL[id] || { q:QL, rank:RK, sector:SR }[id]; if (!L) return null;   // your own bots (my1, my2, …) follow fixed rules
  const M=L.init(); if (AI_PROB.includes(id)) M.dim=AI_FEATS.length; return M; }
function aiBot(id){ return { id, on:true, A:brkNew(AI_CFG.CASH), meta:{}, log:[], think:{}, seen:{}, eqi:[], pnow:{}, model:aiInit(id) }; }
const aiIsStock = sym => AI_STOCKS.includes(sym);
function aiLog(bot, e){ bot.log.push(e); if (bot.log.length>AI_CFG.LOG) bot.log.shift(); }
function aiBuy(bot, sym, q, d, now, bt){ if (Object.keys(bot.meta).length>=AI_CFG.MAX_POS) return { code:'full' };
  const E=brkEquity(bot.A, { [sym]:q }); let usd=Math.min(brkFree(bot.A)*.995, E*(d.size||AI_CFG.SIZE)); if (AI_CFG.SHORT) usd=Math.min(usd, E-aiGross(bot)); if (usd<BRK.MIN_ORDER*5) return { code:'no_cash' };
  const per=d.stop>0 ? (q.last-d.stop)/q.last : 0; if (AI_CFG.V>=2 && per>0 && !bot.custom){ const used=Object.values(bot.meta).reduce((s,m)=>s+(m.risk||0),0), room=AI_CFG.HEAT*E-used; usd=Math.min(usd, room/per); if (usd<50) return { code:'heat_full' }; }
  const r=brkOrder(bot.A, { sym, kind:aiIsStock(sym) ? 'stock' : 'crypto', side:'b', usd }, q, now); if (!r.ok || !r.fill) return { code:'refused', vals:{ msg:r.msg } };
  bot.meta[sym]={ entry:r.fill.px, stop:d.stop, tp:d.tp||null, peak:r.fill.px, t:now, bt:bt||now, arm:d.arm||null, risk:per>0 ? r.fill.q*r.fill.px*per : 0 }; aiLog(bot, { t:now, sym, act:'b', code:d.code, vals:d.vals, px:r.fill.px, q:r.fill.q, usd:r.fill.q*r.fill.px }); return d; }
function aiSell(bot, sym, q, code, vals, now){ const held=brkHeld(bot.A, sym); if (!(held>0)){ delete bot.meta[sym]; return null; }
  const r=brkOrder(bot.A, { sym, kind:bot.A.pos[sym] ? bot.A.pos[sym].kind : (aiIsStock(sym) ? 'stock' : 'crypto'), side:'s', q:held }, q, now); if (!r.ok || !r.fill) return null; const m=bot.meta[sym]; delete bot.meta[sym];
  aiLog(bot, { t:now, sym, act:'s', code, vals, px:r.fill.px, q:r.fill.q, pl:r.fill.pl, ret:m ? r.fill.px/m.entry-1 : null }); if (AI_CFG.V>=2) (bot.cool||(bot.cool={}))[sym]=now+AI_CFG.H*AI_CFG.BAR; return r.fill; }
// v3: shorts. Opening: like a buy, with the stop above the price; the sale's money is cover, so the total of all positions stays within the account's value
function aiGross(bot){ let g=0; for (const k of Object.keys(bot.A.pos)){ const p=bot.A.pos[k], m=bot.meta[k]; g+=Math.abs(p.q)*(m ? m.entry : p.avg); } return g; }
function aiShortOpen(bot, sym, q, d, now, bt){ if (Object.keys(bot.meta).length>=AI_CFG.MAX_POS) return { code:'full' }; const E=brkEquity(bot.A, { [sym]:q });
  let usd=Math.min(E*(d.size||AI_CFG.SIZE), E-aiGross(bot)); const per=d.stop>0 ? (d.stop-q.last)/q.last : 0; if (per>0){ const used=Object.values(bot.meta).reduce((s,m)=>s+(m.risk||0),0); usd=Math.min(usd, (AI_CFG.HEAT*E-used)/per); }
  if (usd<50) return { code:'heat_full' }; const r=brkShort(bot.A, { sym, kind:'crypto', usd }, q, now); if (!r.ok) return { code:'refused', vals:{ msg:r.msg } };
  bot.meta[sym]={ dir:-1, entry:r.fill.px, stop:d.stop, tp:d.tp||null, peak:r.fill.px, t:now, bt:bt||now, risk:r.fill.q*r.fill.px*per }; aiLog(bot, { t:now, sym, act:'ss', code:d.code, vals:d.vals, px:r.fill.px, q:r.fill.q, usd:r.fill.q*r.fill.px }); return d; }
function aiCover(bot, sym, q, code, vals, now){ const r=brkCover(bot.A, { sym }, q, now), m=bot.meta[sym]; if (!r.ok){ if (!(bot.A.pos[sym] && bot.A.pos[sym].q<0)) delete bot.meta[sym]; return null; } delete bot.meta[sym];
  aiLog(bot, { t:now, sym, act:'bc', code, vals, px:r.fill.px, q:r.fill.q, pl:r.fill.pl, ret:m ? m.entry/r.fill.px-1 : null }); (bot.cool||(bot.cool={}))[sym]=now+AI_CFG.H*AI_CFG.BAR; return r.fill; }
const AI_REG_SHORT = ['down','range','storm'];
// v4: the rule bot (the Q-Learning Agent: a learned rule, not a forecast) keeps a record of every signal it gives and what followed; a side (buying or selling short)
// opens trades only when its recent record beats the costs clearly (at least 25 signals, t > 2), the same test the learners pass
const AI_RULE = ['q'];
function aiTuneRule(bot, now){ const h=(bot.hist||[]).filter(e=>e.r!=null).slice(-300), side=dir=>{ const xs=h.filter(e=>dir>0 ? e.p===1 : e.pd===1); if (xs.length<25) return { ok:false, n:xs.length, net:null };
    const rs=xs.map(e=>dir*e.r-(aiThr(e.s)-.001)-(dir<0 ? .0003*(e.hz||AI_CFG.H)*AI_CFG.BAR/864e5 : 0)), m=rs.reduce((a,b)=>a+b,0)/rs.length, sd=Math.sqrt(rs.reduce((a,b)=>a+(b-m)**2,0)/(rs.length-1)), tt=sd>0 ? m/(sd/Math.sqrt(rs.length)) : 0;
    return { ok:m>0 && tt>=2, n:xs.length, net:m }; };
  const L=side(1), S=side(-1); bot.tune={ rule:true, at:now, okL:L.ok, okS:S.ok, netL:L.net, netS:S.net, n:L.n+S.n, nL:L.n, nS:S.n }; return bot.tune; }
// hourly candles built from the 5-minute ones (the Arena uses them to feed the hourly learners)
function aiHourly(bars){ const H=3600e3, out=[]; for (const b of bars){ const k=Math.floor(b.t/H)*H, a=out[out.length-1]; if (!a || a.t!==k) out.push({ t:k, o:b.o, h:b.h, l:b.l, c:b.c, v:b.v||0, n:1 }); else { a.h=Math.max(a.h, b.h); a.l=Math.min(a.l, b.l); a.c=b.c; a.v+=b.v||0; a.n++; } }
  const last=bars[bars.length-1], done=(last.t+AI_CFG.BAR)%H===0; if (!done) out.pop(); return { hb:out, fresh:done }; }
// v2: where each bot may open trades (by Bitcoin's regime): nobody buys into a falling market
const AI_REG_OK = { knn:['up','range','storm'], nb:['up','range','storm'], forest:['up','range','storm'], q:['up','range','storm'] };
// every new closed bar: learn, then let each bot decide; quoteOf(sym) gives the live broker quote
function aiStep(bots, sym, bars, quoteOf, now, ctx){ ctx=ctx||{}; const closed=bars.filter(b=>b.t+AI_CFG.BAR<=now); if (closed.length<61) return [];
  const t=closed[closed.length-1].t, q=quoteOf(sym), out=[], I=aiInd(closed), stock=aiIsStock(sym), fee=stock ? .0005 : BRK.FEES.crypto, open=!stock || ctx.open!==false; I.sym=sym;
  if (sym==='BTC'){ for (const b of closed) AI.btc.set(b.t, b.c); AI.reg=aiRegime(I, I.c.length-1); }
  // v5: the hourly bots see closed hourly candles and decide once an hour; their stops are still watched every few seconds (aiTick)
  const HB=AI_CFG.V>=5 && !stock && (AI.derReady || ctx.hb) ? aiHBars(sym, now, ctx) : null; let IH=null; if (HB && sym==='BTC') for (const b of HB) AI.btcH.set(b.t, b.c);
  for (const bot of bots){ if (bot.id==='rank' || bot.id==='sector' || (bot.custom && bot.custom.sym!==sym)) continue;
    if (AI_CFG.V>=5 && aiIsHourly(bot.id) && !bot.custom){ if (bot.seen[sym]===t) continue; bot.seen[sym]=t;
      if (stock){ bot.think[sym]={ code:'tf_crypto', vals:{}, t:now }; continue; }
      if (!HB || HB.length<61){ bot.seen[sym]=null; bot.think[sym]={ code:HB ? 'gathering' : 'loading_h', vals:{ n:HB ? HB.length : 0 }, t:now }; continue; }
      if (bot.tf!=='1h'){ bot.tf='1h'; bot.hist=[]; bot.tune=null; bot.seenH={}; }   // a fresh record on the new timeframe
      const th=HB[HB.length-1].t, sh=bot.seenH||(bot.seenH={}); if (sh[sym]===th) continue; sh[sym]=th;
      if (!IH){ IH=aiInd(HB); IH.sym=sym; } aiTF(()=>aiBotStep(bot, sym, HB, IH, th, q, now, stock, fee, open, out)); continue; }
    if (bot.seen[sym]===t) continue; bot.seen[sym]=t; aiBotStep(bot, sym, closed, I, t, q, now, stock, fee, open, out); }
  return out; }
// one bot, one symbol, one closed candle (5-minute, or hourly inside aiTF)
function aiBotStep(bot, sym, closed, I, t, q, now, stock, fee, open, out){
    if (bot.model && AI_PROB.includes(bot.id) && bot.model.dim!==AI_FEATS.length){ bot.model=aiInit(bot.id); bot.tune=null; bot.hist=[]; }
    const M=bot.model; if (AI_PROB.includes(bot.id)){ aiHistFill(bot, sym, closed); if ((sym==='BTC' || !bot.tune) && now-((bot.tune && bot.tune.at)||0)>=6*3600e3) aiTune(bot, now); }
    else if (AI_CFG.V>=4 && AI_RULE.includes(bot.id) && !bot.custom){ aiHistFill(bot, sym, closed); if (sym==='BTC' && now-((bot.tune && bot.tune.at)||0)>=3600e3) aiTuneRule(bot, now); }
    if (M){ if (AI_PROB.includes(bot.id)) aiTrainP(bot.id, M, sym, closed, I); else if (bot.id==='q') QL.train(M, sym, closed, I, fee); }
    if (bot.meta[sym] && bot.meta[sym].dir===-1 && bot.A.pos[sym] && bot.A.pos[sym].q<0) bot.A.cash-=-bot.A.pos[sym].q*I.c[I.c.length-1]*.0003*AI_CFG.BAR/864e5;   // borrowing the coins costs about 0.03% a day
    if (!bot.on) return;
    if (!open){ bot.think[sym]={ code:'mkt_closed', vals:{}, t:now }; return; }
    const d=aiDecide(bot, sym, closed, I); bot.think[sym]={ code:d.code, vals:d.vals, t:now };
    if (AI_CFG.V>=4 && AI_RULE.includes(bot.id) && !bot.custom && (d.act==='b' || (d.act==='ss' && !stock)) && !bot.meta[sym]){ const hz=AI_CFG.H;
      aiHistAdd(bot, sym, t, d.act==='b' ? 1 : 0, closed[closed.length-1].c, d.act==='ss' ? 1 : null); bot.hist[bot.hist.length-1].hz=hz;
      const T=bot.tune||{}, ok=d.act==='b' ? T.okL : T.okS; if (!ok){ bot.think[sym]={ code:'rule_noedge', vals:{ n:T.n||0, net:d.act==='b' ? T.netL : T.netS }, t:now }; return; } } if (AI_CFG.V>=2 && (d.act==='b' || d.act==='ss') && !d.size) d.size=aiSize(I, I.c.length-1); if (d.act==='ss' && stock) return;
    // v2 market filter: no bot starts a new long while Bitcoin is in a falling regime, and trades are half size in a storm
    if (AI_CFG.V>=2 && (d.act==='b' || d.act==='ss') && !bot.custom){ const ok=d.act==='ss' ? AI_REG_SHORT : AI_REG_OK[bot.id];
      if (!stock && ok && AI.reg && !ok.includes(AI.reg)){ bot.think[sym]={ code:'regime_block', vals:{ reg:AI.reg }, t:now }; return; }
      if (bot.cool && bot.cool[sym]>now){ bot.think[sym]={ code:'cooldown', vals:{}, t:now }; return; }
      // circuit breaker: after a bad run (the last 10 closed trades lost 3% or more together), no new trades for 6 hours
      if (bot.pause>now){ bot.think[sym]={ code:'breaker', vals:{ until:bot.pause }, t:now }; return; }
      { const last=bot.log.filter(x=>(x.act==='s' || x.act==='bc') && x.ret!=null).slice(-10); if (last.length===10 && last.reduce((a,x)=>a+x.ret,0)<=-.03 && (bot.brkAt||0)<last[9].t){ bot.brkAt=last[9].t; bot.pause=now+6*3600e3; bot.think[sym]={ code:'breaker', vals:{ until:bot.pause }, t:now }; return; } }
      if (!stock && AI.reg==='storm') d.size=(d.size||AI_CFG.SIZE)*.5; }
    if (!q || !(q.last>0)) return;
    if (d.act==='b' && !bot.meta[sym]){ const r=aiBuy(bot, sym, q, d, now, t); if (r && r.code!==d.code) bot.think[sym]={ code:r.code, vals:r.vals, t:now }; else out.push({ bot:bot.id, sym, act:'b' }); }
    else if (d.act==='s' && bot.meta[sym] && bot.meta[sym].dir!==-1){ if (aiSell(bot, sym, q, d.code, d.vals, now)) out.push({ bot:bot.id, sym, act:'s' }); }
    else if (d.act==='ss' && !bot.meta[sym]){ const r=aiShortOpen(bot, sym, q, d, now, t); if (r && r.code!==d.code) bot.think[sym]={ code:r.code, vals:r.vals, t:now }; else out.push({ bot:bot.id, sym, act:'ss' }); }
    else if (d.act==='bc' && bot.meta[sym] && bot.meta[sym].dir===-1){ if (aiCover(bot, sym, q, d.code, d.vals, now)) out.push({ bot:bot.id, sym, act:'bc' }); }
}
// between bars: trailing highs and stops follow the live price
function aiTick(bots, quotes, now){ const out=[]; for (const bot of bots){ if (!bot.on || bot.srv) continue; for (const sym of Object.keys(bot.meta)){ const q=quotes[sym], m=bot.meta[sym]; if (!q || !(q.last>0) || (q.kind==='stock' && !q.open)) continue;
  if (m.dir===-1){ if (m.stop>0 && q.last>=m.stop && aiCover(bot, sym, q, 'short_stop', { stop:m.stop }, now)) out.push({ bot:bot.id, sym, act:'bc' }); continue; }
  if (q.last>m.peak) m.peak=q.last; if (m.stop>0 && q.last<=m.stop){ if (aiSell(bot, sym, q, 'stop_hit', { stop:m.stop }, now)) out.push({ bot:bot.id, sym, act:'s' }); } } } return out; }
function aiMarkAll(bots, quotes, now){ for (const bot of bots){ if (bot.srv && typeof window!=='undefined') continue; const v=brkEquity(bot.A, quotes), last=bot.eqi[bot.eqi.length-1]; if (!last || now-last.t>=AI_CFG.BAR){ bot.eqi.push({ t:now, v }); if (bot.eqi.length>600) bot.eqi.shift(); } else last.v=v; aiDiary(bot, v, now); } }
// one line a day for each bot: its value, how well it guessed, what it learned, its threshold, its trades
function aiDiary(bot, v, now){ const d=Math.floor(now/864e5), D=bot.diary||(bot.diary=[]), M=bot.model, e={ d, v, acc:M && M.hits ? aiAcc(M) : null, n:M && M.n!=null ? M.n : null, minP:bot.tune ? bot.tune.minP : null, tr:bot.log.filter(x=>x.act==='s').length };
  if (D.length && D[D.length-1].d===d) D[D.length-1]=e; else { D.push(e); if (D.length>30) D.shift(); } }
// ---- candles: Binance 5-minute klines (Coinbase 5-minute candles as the backup)
async function aiLoad(sym, limit){ const d=liveDef(sym); if (!d) return; let bars;
  try{ if (LIVE.src==='coinbase' && d.cb) throw new Error('use coinbase'); bars=(await liveJSON(`${LIVE.BN_REST}/klines?symbol=${d.bn}&interval=5m&limit=${limit||500}`)).map(bnBar); }
  catch(e){ if (!d.cb) throw e; bars=(await liveJSON(`${LIVE.CB_REST}/products/${d.cb}/candles?granularity=300`)).map(cbBar).reverse(); }
  const old=AI.bars[sym]||[], m=new Map(old.map(b=>[b.t, b])); for (const b of bars) m.set(b.t, b); AI.bars[sym]=[...m.values()].sort((a,b)=>a.t-b.t).slice(-AI_CFG.WIN); }
const AI_SB='tdl-sbars';
function aiSbarsLoad(){ try{ const x=JSON.parse(localStorage.getItem(AI_SB)||'{}'); for (const s of AI_STOCKS) if (Array.isArray(x[s]) && !AI.bars[s]) AI.bars[s]=x[s]; }catch(e){} }
function aiSbarsSave(){ try{ const o={}; for (const s of AI_STOCKS) if (AI.bars[s]) o[s]=AI.bars[s].slice(-300); localStorage.setItem(AI_SB, JSON.stringify(o)); }catch(e){} }
async function aiLoadStock(sym, limit){ if (typeof US!=='undefined' && US.src==='alpaca'){ const x=await apGet(`/v2/stocks/${encodeURIComponent(sym)}/bars?feed=iex&timeframe=5Min&limit=${limit||1000}&start=${new Date(Date.now()-10*864e5).toISOString()}`);
    const m=new Map((AI.bars[sym]||[]).map(b=>[b.t,b])); for (const b of (x.bars||[]).map(apBar)) m.set(b.t, b); AI.bars[sym]=[...m.values()].sort((a,b)=>a.t-b.t).slice(-600); return; }
  const d=typeof MKT!=='undefined' && MKT.all[sym]; if (!d || !d.intra || !d.intra.length) return; const m=new Map((AI.bars[sym]||[]).map(b=>[b.t,b]));
  for (const b of d.intra){ const k=Math.floor(b.t/AI_CFG.BAR)*AI_CFG.BAR, a=m.get(k); if (!a) m.set(k, { t:k, o:b.o, h:b.h, l:b.l, c:b.c, v:b.v||0 }); else if (b.t>=a.t){ a.h=Math.max(a.h,b.h); a.l=Math.min(a.l,b.l); a.c=b.c; } }
  AI.bars[sym]=[...m.values()].sort((a,b)=>a.t-b.t).slice(-600); }
async function aiStart(getBots, quoteOf, onTrade){ if (AI.timer) return; AI.status='loading'; aiEmit('status');
  const res=await Promise.allSettled(AI_COINS.map(s=>aiLoad(s, AI_CFG.WIN))); if (!res.some(r=>r.status==='fulfilled')){ AI.status='offline'; AI.err=String(res[0].reason); aiEmit('status'); }
  else { AI.status='live'; AI.t=Date.now(); }
  aiSbarsLoad(); await Promise.allSettled(AI_STOCKS.map(s=>aiLoadStock(s, 1000)));
  // v5: hourly candles (Binance) and futures data (OKX); the bots work without the futures data if it cannot be reached (those signals read 0)
  // (loaded in the background: the 5-minute bots start at once, the hourly ones as soon as their data is in)
  if (AI_CFG.V>=5) (async()=>{ await Promise.allSettled(AI_COINS.map(s=>aiLoadH(s, 1000))); await Promise.allSettled(AI_COINS.map(s=>aiLoadDer(s, 2, 6))); AI.hT=Math.floor(Date.now()/3600e3); AI.derReady=true;
    while (AI.busy) await new Promise(r=>setTimeout(r, 200)); AI.busy=true; try{ await run(); } finally { AI.busy=false; } })();
  const open=()=>typeof usMarketOpen==='function' ? usMarketOpen() : false;
  const run=async()=>{ const bots=getBots(), now=Date.now(); let acts=[];
    for (const s of AI_COINS.concat(AI_STOCKS)) if (AI.bars[s]) acts=acts.concat(aiStep(bots, s, AI.bars[s], quoteOf, now, { open:open() }));
    if (open() && typeof mktPost==='function' && now-STK.t>=300000 && !STK.busy){ STK.busy=true; try{ await stkLoad(); acts=acts.concat(stkStep(bots, quoteOf, now)); }catch(e){ STK.status='offline'; STK.err=String(e.message||e); } finally { STK.busy=false; } }
    else if (!open()) for (const b of bots) if (b.id==='rank' || b.id==='sector') b.think.US={ code:'mkt_closed', vals:{}, t:now };
    if (acts.length && onTrade) onTrade(acts); aiEmit('step'); };
  await run();
  AI.timer=setInterval(async()=>{ if (AI.busy) return; AI.busy=true; try{ const r=await Promise.allSettled(AI_COINS.map(s=>aiLoad(s, 3))); await Promise.allSettled(AI_STOCKS.map(s=>aiLoadStock(s, 3))); aiSbarsSave();
    if (AI_CFG.V>=5 && Math.floor(Date.now()/3600e3)!==AI.hT){ AI.hT=Math.floor(Date.now()/3600e3); await Promise.allSettled(AI_COINS.map(s=>aiLoadH(s, 3))); await Promise.allSettled(AI_COINS.map(s=>aiLoadDer(s, 1, 1))); }
    if (r.some(x=>x.status==='fulfilled')){ AI.status='live'; AI.t=Date.now(); } else AI.status='stale'; await run(); } finally { AI.busy=false; } }, 60000); }
// when the next 5-minute candle closes
const aiNext = now => (Math.floor(now/AI_CFG.BAR)+1)*AI_CFG.BAR;

// ---- the market regime, read from Bitcoin (it gates new trades, and the Arena scores every bot in each regime)
function aiRegime(I, i){ const c=I.c[i]; if (i<224) return 'range'; const slope=I.e50[i]/I.e50[i-24]-1, a=I.atr[i]/c; let am=0; for (let k=i-199;k<=i;k++) am+=I.atr[k]/I.c[k]; am/=200;
  if (a>am*1.6) return 'storm'; if (slope>.004) return 'up'; if (slope<-.004) return 'down'; return 'range'; }

// ---- v5: hourly candles and futures data
const aiIsHourly = id => AI_PROB.includes(id);
// run a step on hourly candles: one candle is an hour, the target is 4 hours ahead, and Bitcoin's hourly closes stand in for the 5-minute ones
function aiTF(fn){ const sv=[AI_CFG.BAR, AI_CFG.H, AI.btc]; AI_CFG.BAR=3600e3; AI_CFG.H=AI_CFG.HH; AI.btc=AI.btcH; try{ return fn(); } finally { AI_CFG.BAR=sv[0]; AI_CFG.H=sv[1]; AI.btc=sv[2]; } }
function aiHBars(sym, now, ctx){ const src=(ctx && ctx.hb) ? ctx.hb[sym] : AI.hb[sym]; if (!src || !src.length) return null; let k=src.length; while (k>0 && src[k-1].t+3600e3>now) k--; return k===src.length ? src : src.slice(0, k); }
async function aiLoadH(sym, limit){ const d=liveDef(sym); if (!d || !d.bn) return; const x=(await liveJSON(`${LIVE.BN_REST}/klines?symbol=${d.bn}&interval=1h&limit=${limit||1000}`)).map(bnBar);
  const m=new Map((AI.hb[sym]||[]).map(b=>[b.t, b])); for (const b of x) m.set(b.t, b); AI.hb[sym]=[...m.values()].sort((a,b)=>a.t-b.t).slice(-1000); }
// the funding rate in force when a candle closed (the last one paid at or before then), and the hour's futures-spot gap; 0 when unknown
function aiFund(sym, t){ const a=AI.der.fund[sym]; if (!a || !a.length || a[0][0]>t) return 0; let lo=0, hi=a.length-1; while (lo<hi){ const m=(lo+hi+1)>>1; if (a[m][0]<=t) lo=m; else hi=m-1; } return a[lo][1]; }
function aiBasis(sym, t){ const m=AI.der.basis[sym]; const v=m && m.get(t); return v!=null ? v : 0; }
// OKX public data (free, no key): funding history, and hourly mark and index candles (their gap is the basis)
const AI_OKX='https://www.okx.com/api/v5'; let aiOkxNext=0;
async function aiOkx(path){ const w=aiOkxNext-Date.now(); aiOkxNext=Math.max(Date.now(), aiOkxNext)+100; if (w>0) await new Promise(r=>setTimeout(r, w));
  const c=new AbortController(), tm=setTimeout(()=>c.abort(), 10000); let r; try{ r=await fetch(AI_OKX+path, { signal:c.signal }); } finally { clearTimeout(tm); } if (!r.ok) throw new Error('OKX '+r.status); const j=await r.json(); if (j.code!=='0') throw new Error('OKX '+j.code+' '+(j.msg||'')); return j.data||[]; }
async function aiLoadDer(sym, pf, pb, until){ pf=pf||1; pb=pb||1; const sw=sym+'-USDT-SWAP';
  const F=new Map((AI.der.fund[sym]||[]).map(e=>[e[0], e[1]])); let after='';
  for (let k=0;k<pf;k++){ const d=await aiOkx(`/public/funding-rate-history?instId=${sw}&limit=100${after}`); if (!d.length) break; for (const e of d) F.set(+e.fundingTime, +e.realizedRate || +e.fundingRate); const old=+d[d.length-1].fundingTime; after='&after='+old; if (until && old<until) break; }
  AI.der.fund[sym]=[...F.entries()].sort((a,b)=>a[0]-b[0]);
  const B=AI.der.basis[sym] || (AI.der.basis[sym]=new Map()), mk={}, ix={}; let am='', ai='';
  for (let k=0;k<pb;k++){ const [m, i]=await Promise.all([aiOkx(`/market/history-mark-price-candles?instId=${sw}&bar=1H&limit=100${am}`), aiOkx(`/market/history-index-candles?instId=${sym}-USDT&bar=1H&limit=100${ai}`)]);
    for (const c of m) mk[+c[0]]=+c[4]; for (const c of i) ix[+c[0]]=+c[4]; if (!m.length || !i.length) break; am='&after='+m[m.length-1][0]; ai='&after='+i[i.length-1][0]; if (until && +m[m.length-1][0]<until) break; }
  for (const t in mk) if (ix[t]>0) B.set(+t, mk[t]/ix[t]-1); if (B.size>3000){ const ks=[...B.keys()].sort((a,b)=>a-b); for (const t of ks.slice(0, B.size-3000)) B.delete(t); } }
// keep and restore the futures data (the server saves it between runs)
function aiDerSave(){ return { fund:AI.der.fund, basis:Object.fromEntries(Object.entries(AI.der.basis).map(([s,m])=>[s, [...m.entries()].slice(-1500)])) }; }
function aiDerLoad(x){ if (!x) return; AI.der.fund=x.fund||{}; AI.der.basis=Object.fromEntries(Object.entries(x.basis||{}).map(([s,a])=>[s, new Map(a)])); }

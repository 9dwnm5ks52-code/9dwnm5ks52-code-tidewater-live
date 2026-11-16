// Tidewater Live: the Bot Arena. Every candle bot is replayed over weeks of real 5-minute candles, as if live:
// each one learns only from the past and is graded on what came next (walk-forward). Costs are paid (fee and spread).
// It is compared with holding Bitcoin, holding all six coins, and 1,000 random bots that trade as often and as long (the luck test),
// and it is measured in each market regime. The last two engine versions run side by side, so an improvement shows as a number.
// Only the bots of the current roster (AI_DEFS) run; the two stock bots need the US market snapshots and are left out.
// Usage: node server/arena.js <data folder> [days]      (writes <data>/arena.json)
const fs = require('fs'), path = require('path'), vm = require('vm');
const DATA = path.resolve(process.argv[2] || 'data'), DAYS = +(process.argv[3] || 30), WARM = +(process.argv[4] || process.env.ARENA_WARM || (DAYS>=60 ? 20 : 3));   // hourly learners need about 12 days of hourly candles before their first forecast fs.mkdirSync(DATA, { recursive:true });
const LIB = fs.existsSync(path.join(__dirname, 'lib')) ? path.join(__dirname, 'lib') : path.join(__dirname, '..');
const FILES = ['sim_live.js','sim_live_us.js','sim_live_tv.js','live_broker.js','ai_bots.js','ai_learn.js','strategy.js'];
const mem = {}; const localStorage = { getItem:k=>mem[k]??null, setItem:(k,v)=>{ mem[k]=String(v); }, removeItem:k=>{ delete mem[k]; } };
const C = { console, Date, Math, JSON, Map, Set, Promise, URL, Infinity, fetch, AbortController, setTimeout, clearTimeout, setInterval:()=>0, clearInterval:()=>{}, localStorage };
vm.createContext(C); vm.runInContext(FILES.map(f=>fs.readFileSync(path.join(LIB, f), 'utf8')).join('\n;\n')+'\n;Object.assign(this,{liveDef,bnBar,LIVE,AI,AI_DEFS,AI_COINS,AI_CFG,BRK,aiAcc});', C, { filename:'tidewater-engine.js' });
const BAR=C.AI_CFG.BAR, log=(...a)=>console.log(new Date().toISOString(), ...a);
const getJSON=async u=>{ for (let k=0;k<4;k++){ try{ const r=await fetch(u); if (r.ok) return r.json(); if (r.status===429) await new Promise(x=>setTimeout(x, 2000*(k+1))); else throw new Error('HTTP '+r.status); }catch(e){ if (k===3) throw e; await new Promise(x=>setTimeout(x, 1000)); } } };
async function candles(bn, from, to){ const out=[]; let t=from; while (t<to){ const x=await getJSON(`${C.LIVE.BN_REST}/klines?symbol=${bn}&interval=5m&startTime=${t}&limit=1000`); if (!x.length) break; for (const k of x) if (+k[0]<to) out.push(C.bnBar(k)); t=+x[x.length-1][0]+BAR; } return out; }
function stats(eq, perYear){ if (eq.length<3) return {}; const lr=eq.slice(1).map((v,i)=>Math.log(v/eq[i])), m=lr.reduce((a,b)=>a+b,0)/lr.length, sd=Math.sqrt(lr.reduce((a,b)=>a+(b-m)**2,0)/(lr.length-1));
  let pk=eq[0], dd=0; for (const v of eq){ pk=Math.max(pk, v); dd=Math.max(dd, 1-v/pk); } return { ret:eq[eq.length-1]/eq[0]-1, sharpe:sd>0 ? m/sd*Math.sqrt(perYear) : null, dd }; }
const down = (xs, n) => { if (xs.length<=n) return xs; const out=[]; for (let k=0;k<n;k++) out.push(xs[Math.round(k*(xs.length-1)/(n-1))]); return out; };
let seed=12345; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
async function run(){ const t0=Date.now(), S={}; let to=Math.floor(Date.now()/BAR)*BAR, from=to-(DAYS+WARM)*864e5;
  // ARENA_CACHE=<file>: reuse the same candles between runs (for experiments); ARENA_V=3,4: run only these engine versions
  const CACHE=process.env.ARENA_CACHE; if (CACHE && fs.existsSync(CACHE)){ Object.assign(S, JSON.parse(fs.readFileSync(CACHE, 'utf8'))); from=S.BTC[0].t; to=S.BTC[S.BTC.length-1].t+BAR; }
  else { for (const s of C.AI_COINS){ S[s]=await candles(C.liveDef(s).bn, from, to); log(`${s}: ${S[s].length} candles`); } if (CACHE) fs.writeFileSync(CACHE, JSON.stringify(S)); }
  // futures data from OKX (funding rates, hourly mark and index candles) for the whole period; missing values read 0
  if (S.__der) C.aiDerLoad(S.__der); else { for (const s of C.AI_COINS){ try{ await C.aiLoadDer(s, 8, Math.ceil((to-from)/36e5/100)+2, from); log(`${s}: futures data, ${(C.AI.der.fund[s]||[]).length} funding rates, ${C.AI.der.basis[s] ? C.AI.der.basis[s].size : 0} hourly gaps`); }catch(e){ log(`${s}: no futures data (${e.message})`); } }
    S.__der=C.aiDerSave(); if (CACHE) fs.writeFileSync(CACHE, JSON.stringify(S)); }
  const HR={}; for (const s of C.AI_COINS) HR[s]=C.aiHourly(S[s]).hb;
  const T=S.BTC.map(b=>b.t), n=T.length, at={}; for (const s of C.AI_COINS){ const m=new Map(S[s].map((b,i)=>[b.t,i])); at[s]=T.map(t=>m.has(t) ? m.get(t) : -1); }
  const e0=T.findIndex(t=>t>=from+WARM*864e5), FEE=C.BRK.FEES.crypto, SPREAD=.0002;   // the gap between buying and selling price: about 0.02% on these coins
  // the regime at each step, from Bitcoin
  const reg=new Array(n).fill('range'); for (let k=300;k<n;k++){ if ((k-300)%12) { reg[k]=reg[k-1]; continue; } const w=S.BTC.slice(Math.max(0,k-999), k+1), I=C.aiInd(w); reg[k]=C.aiRegime(I, w.length-1); }
  const ver={};
  // consistency: the 30 days cut into three 10-day periods
  const segs=xs=>[0,1,2].map(z=>{ const a=xs[Math.floor(z*(xs.length-1)/3)], b=xs[Math.floor((z+1)*(xs.length-1)/3)]; return a>0 ? b/a-1 : 0; });
  for (const V of (process.env.ARENA_V || '4,5').split(',').map(Number)){ const tv=Date.now(); C.aiSetV(V); C.AI.btc.clear(); C.AI.btcH.clear(); const hj={}, hbx={}; C.AI_CFG.LOG=1e9; seed=12345;
    const bots=C.aiNew().filter(b=>!['rank','sector'].includes(b.id)), eq=bots.map(()=>[]), regLR=bots.map(()=>({ up:0, down:0, range:0, storm:0 })), inMkt=bots.map(()=>0);
    for (let k=320;k<n;k++){ const now=T[k]+BAR, px=s=>{ const i=at[s][k]; return i>=0 ? S[s][i].c : null; }, quoteOf=s=>{ const c=px(s); return c ? { kind:'crypto', last:c, bid:c*(1-SPREAD/2), ask:c*(1+SPREAD/2), book:null, open:true } : null; };
      // the hourly candles closed by now (the last 1,000)
      for (const s of C.AI_COINS){ let j=hj[s]==null ? -1 : hj[s]; const H=HR[s]; while (j+1<H.length && H[j+1].t+36e5<=now) j++; if (j!==hj[s]){ hj[s]=j; hbx[s]=H.slice(Math.max(0, j-999), j+1); } }
      for (const s of C.AI_COINS){ const i=at[s][k]; if (i<61) continue; C.aiStep(bots, s, S[s].slice(Math.max(0, i-C.AI_CFG.WIN+1), i+1), quoteOf, now, { open:true, hb:hbx }); }
      // within the next candle: highs lift trailing stops, lows trigger stops (fills at the low: on the safe side)
      if (k+1<n) for (const b of bots){ if (!b.on) continue; for (const s of Object.keys(b.meta)){ const i=at[s][k+1], m=b.meta[s]; if (i<0) continue; const nb=S[s][i]; if (nb.h>m.peak) m.peak=nb.h;
        if (m.dir===-1){ if (m.stop>0 && nb.h>=m.stop){ const fill=Math.max(m.stop, nb.o); C.aiCover(b, s, { kind:'crypto', last:fill, bid:fill*(1-SPREAD), ask:fill, open:true }, 'short_stop', { stop:m.stop }, now); } continue; }
        if (m.stop>0 && nb.l<=m.stop){ const fill=Math.min(m.stop, nb.o); C.aiSell(b, s, { kind:'crypto', last:fill, bid:fill, ask:fill*(1+SPREAD), open:true }, 'stop_hit', { stop:m.stop }, now); } } }
      if (k>=e0){ const Q={}; for (const s of C.AI_COINS){ const q=quoteOf(s); if (q) Q[s]=q; } bots.forEach((b,j)=>{ const v=C.brkEquity(b.A, Q), a=eq[j]; if (a.length) regLR[j][reg[k-1]]+=Math.log(v/a[a.length-1]); a.push(v); if (v>0 && Object.keys(b.A.pos).some(s=>Q[s] && Math.abs(b.A.pos[s].q)*Q[s].last>v*.01)) inMkt[j]++; }); }
      if (k%2000===0) log(`v${V}: step ${k}/${n}`); }
    // the luck test: 1,000 random bots, each with the same number of trades, each trade as long as one of the bot's, at a random time on a random coin
    const tIdx=new Map(T.map((t,i)=>[t+BAR, i]));
    const out=bots.map((b,j)=>{ const trades=[], open={}; for (const x of b.log){ const i=tIdx.get(x.t); if (i==null) continue; if (x.act==='b' || x.act==='ss') open[x.sym]={ i, px:x.px, d:x.act==='ss' ? -1 : 1 }; else if ((x.act==='s' || x.act==='bc') && open[x.sym]){ const o=open[x.sym]; if (o.i>=e0) trades.push({ s:x.sym, i:o.i, j:i, d:o.d, r:(o.d===1 ? x.px/o.px : o.px/x.px)-1-2*FEE }); delete open[x.sym]; } }
      const score=xs=>xs.reduce((a,t)=>a+Math.log(1+.25*t.r), 0), mine=score(trades); let beat=0;
      for (let m=0;m<1000;m++){ let sc=0; for (const t of trades){ const d=t.j-t.i, s=C.AI_COINS[Math.floor(rnd()*C.AI_COINS.length)], st=e0+Math.floor(rnd()*Math.max(1, n-1-d-e0)), a=at[s][st], z=at[s][st+d]; if (a<0 || z<0) continue; sc+=Math.log(1+.25*((t.d===-1 ? S[s][a].c/S[s][z].c : S[s][z].c/S[s][a].c)*(1-SPREAD)/(1+SPREAD)-1-2*FEE)); } if (sc>=mine) beat++; }
      const hourly=eq[j].filter((_,k)=>k%12===0), st=stats(hourly, 8760), wins=trades.filter(t=>t.r>0), gw=wins.reduce((a,t)=>a+t.r,0), gl=-trades.filter(t=>t.r<=0).reduce((a,t)=>a+t.r,0), M=b.model;
      return { id:b.id, name:(C.AI_DEFS.find(d=>d.id===b.id)||{}).name, ...st, trades:trades.length, win:trades.length ? wins.length/trades.length : null, pf:gl>0 ? gw/gl : (gw>0 ? 99 : null),
        expo:eq[j].length ? inMkt[j]/eq[j].length : 0, luck:trades.length>=5 ? (beat+1)/1001 : null, reg:regLR[j], acc:M && M.hits ? C.aiAcc(M) : null, minP:b.tune ? b.tune.minP : null, minPs:b.tune && b.tune.minPs!=null ? b.tune.minPs : null, shorts:trades.filter(t=>t.d===-1).length, rec:b.tune && b.tune.rule ? { nL:b.tune.nL, netL:b.tune.netL, nS:b.tune.nS, netS:b.tune.netS, okL:b.tune.okL, okS:b.tune.okS } : null, val:M && M.val!=null ? M.val : null, gen:M && M.gen!=null ? M.gen : null,
        seg:segs(hourly), eq:down(hourly.map(v=>Math.round(v/hourly[0]*10000)/10000), 240) }; });
    ver[V]={ bots:out, ms:Date.now()-tv }; log(`v${V} done in ${((Date.now()-tv)/1000).toFixed(0)} s`); }
  // baselines and the regimes' share of time
  const px=(s,k)=>{ const i=at[s][k]; return i>=0 ? S[s][i].c : null; }, hk=[]; for (let k=e0;k<n;k+=12) hk.push(k);
  const btcEq=hk.map(k=>px('BTC',k)/px('BTC',e0)), btcSeg=segs(btcEq), basEq=hk.map(k=>C.AI_COINS.reduce((a,s)=>a+(px(s,k)&&px(s,e0) ? px(s,k)/px(s,e0) : 1),0)/C.AI_COINS.length);
  const share={ up:0, down:0, range:0, storm:0 }, btcReg={ up:0, down:0, range:0, storm:0 }; for (let k=e0+1;k<n;k++){ share[reg[k-1]]++; btcReg[reg[k-1]]+=Math.log(px('BTC',k)/px('BTC',k-1)); } for (const r in share) share[r]/=Math.max(1, n-1-e0);
  const res={ v:1, t:Date.now(), from:T[e0], to:T[n-1]+BAR, days:DAYS, warm:WARM, coins:C.AI_COINS, candles:n, versions:ver, base:{ btc:{ ...stats(btcEq, 8760), seg:btcSeg, eq:down(btcEq, 240), reg:btcReg }, basket:{ ...stats(basEq, 8760), eq:down(basEq, 240) } }, share, ms:Date.now()-t0 };
  fs.writeFileSync(path.join(DATA, 'arena.json'), JSON.stringify(res)); log(`arena: ${DAYS} days, ${n} candles a coin, ${((Date.now()-t0)/1000).toFixed(0)} s`); }
run().catch(e=>{ console.error(e); process.exit(1); });

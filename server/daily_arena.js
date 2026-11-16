// Tidewater Live: the multi-year test of the Strategy Desk. Every daily strategy is replayed on daily candles of 30 coins from mid-2018 to yesterday,
// paying standard fees (and, as a second scenario, limit orders with the BNB discount), against holding Bitcoin and holding every coin equally.
// It also reports every variant tried, so the deflated Sharpe ratio can allow for luck. Funding rates come from Binance's public archive (2020 on).
// Usage: node server/daily_arena.js <data folder>      (writes <data>/daily.json, keeps <data>/daily_cache.json between runs)
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const DATA = path.resolve(process.argv[2] || 'data'); fs.mkdirSync(DATA, { recursive:true });
const LIB = fs.existsSync(path.join(__dirname, 'lib')) ? path.join(__dirname, 'lib') : path.join(__dirname, '..');
const C = { console, Date, Math, JSON, Map, Set, Promise, Float64Array, Int32Array, Infinity, NaN, isFinite, fetch };
vm.createContext(C); vm.runInContext(fs.readFileSync(path.join(LIB, 'ai_daily.js'), 'utf8')+'\n;Object.assign(this,{DLY,DLY_U,DLY_DAY,DLY_START,DLY_COST,DLY_STRATS,DLY_VARIANTS,DLY_TRIED});', C, { filename:'ai_daily.js' });
const log=(...a)=>console.log(new Date().toISOString(), ...a), CACHE=process.env.DAILY_CACHE ? path.resolve(process.env.DAILY_CACHE) : path.join(DATA, 'daily_cache.json'), DAY=C.DLY_DAY, TEST_FROM=Date.UTC(2018, 5, 1);
const sleep=ms=>new Promise(r=>setTimeout(r, ms));
async function get(url, bin){ for (let k=0;k<4;k++){ try{ const r=await fetch(url); if (r.status===404) return null; if (r.ok) return bin ? Buffer.from(await r.arrayBuffer()) : r.json(); if (r.status===429) await sleep(3000*(k+1)); else throw new Error('HTTP '+r.status); }catch(e){ if (k===3) throw e; await sleep(1000*(k+1)); } } }
// one month of funding rates from Binance's archive: a zip holding one CSV (calc_time, interval, rate)
function unzipCsv(b){ if (b.readUInt32LE(0)!==0x04034b50) return ''; const csz=b.readUInt32LE(18), nl=b.readUInt16LE(26), el=b.readUInt16LE(28), at=30+nl+el; return zlib.inflateRawSync(b.subarray(at, csz ? at+csz : undefined)).toString(); }
async function pool(items, n, fn){ let k=0; await Promise.all(Array.from({ length:n }, async()=>{ while (k<items.length){ const x=items[k++]; await fn(x); } })); }
// the order-book record: the data branch keeps 30 days; the long record is merged here into an archive (in the Actions cache on the hosted site)
function obiArchive(){ const A=process.env.OBI_ARCHIVE, src=path.join(DATA, 'obi.json'); if (!A || !fs.existsSync(src)) return; try{
    const o=JSON.parse(fs.readFileSync(src, 'utf8')), a=fs.existsSync(A) ? JSON.parse(fs.readFileSync(A, 'utf8')) : { coins:o.coins, rows:[] }, seen=new Set(a.rows.map(r=>r[0]));
    for (const r of o.rows) if (!seen.has(r[0])) a.rows.push(r); a.rows.sort((x,y)=>x[0]-y[0]); fs.mkdirSync(path.dirname(path.resolve(A)), { recursive:true }); fs.writeFileSync(A, JSON.stringify(a));
    log(`order book archive: ${a.rows.length} readings since ${new Date(a.rows[0][0]).toISOString().slice(0,10)}`); }catch(e){ log('order book archive:', e.message); } }
(async()=>{ obiArchive(); const t0=Date.now(), cache=fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { raw:{}, fund:{}, months:{} };
  // daily candles: new days only
  for (const s of C.DLY_U){ const have=cache.raw[s]||[], from=have.length ? have[have.length-1][0]+DAY : C.DLY_START;
    try{ const x=await C.dlyFetch(s, from); const m=new Map(have.map(b=>[b[0], b])); for (const b of x) m.set(b[0], b); cache.raw[s]=[...m.values()].sort((a,b)=>a[0]-b[0]); }
    catch(e){ log(`${s}: ${e.message}`); } }
  { const have=cache.fx||[], from=have.length ? have[have.length-1][0]+DAY : Date.UTC(2019, 11, 1); let t=from;
    try{ for (let k=0;k<6;k++){ const x=await get(`https://data-api.binance.vision/api/v3/klines?symbol=USDTTRY&interval=1d&startTime=${t}&limit=1000`); if (!x || !x.length) break; for (const b of x) have.push([+b[0], +b[4]]); t=+x[x.length-1][0]+DAY; if (x.length<1000) break; } }catch(e){ log('USDT/TRY:', e.message); }
    const m=new Map(have.map(r=>[r[0], r[1]])); cache.fx=[...m.entries()].sort((a,b)=>a[0]-b[0]); }
  log(`daily candles: ${C.DLY_U.map(s=>s+' '+(cache.raw[s]||[]).length).join(', ')}`);
  // funding rates, month by month (a month that does not exist yet for a coin is remembered once it is in the past)
  const now=new Date(), months=[]; for (let y=2020;y<=now.getUTCFullYear();y++) for (let m=1;m<=12;m++){ if (Date.UTC(y, m, 1)>Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) break; months.push(`${y}-${String(m).padStart(2,'0')}`); }
  const jobs=[]; for (const s of C.DLY_U){ const done=new Set(cache.months[s]||[]); for (const m of months) if (!done.has(m)) jobs.push([s, m]); }
  let got=0; await pool(jobs, 8, async([s, m])=>{ try{ const b=await get(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${s}USDT/${s}USDT-fundingRate-${m}.zip`, true);
      const recent=m===months[months.length-1]; if (!b){ if (!recent) (cache.months[s]=cache.months[s]||[]).push(m); return; }
      const rows=unzipCsv(b).trim().split('\n').slice(1).map(l=>l.split(',')).filter(r=>r.length>=3).map(r=>[+r[0], +r[2]]); const a=cache.fund[s]||(cache.fund[s]=[]); for (const r of rows) a.push(r);
      (cache.months[s]=cache.months[s]||[]).push(m); got++; }catch(e){ log(`funding ${s} ${m}: ${e.message}`); } });
  for (const s in cache.fund){ const m=new Map(cache.fund[s].map(r=>[r[0], r[1]])); cache.fund[s]=[...m.entries()].sort((a,b)=>a[0]-b[0]); }
  fs.writeFileSync(CACHE, JSON.stringify(cache)); log(`funding: ${got} new months; ${Object.keys(cache.fund).length} coins with history`);
  // the test
  const raw={}; for (const s of C.DLY_U) if ((cache.raw[s]||[]).length>60) raw[s]=cache.raw[s]; const D=C.dlyBuild(raw, Date.now()); C.DLY.fund=cache.fund;
  const from=D.days.findIndex(t=>t>=TEST_FROM), to=D.days.length-1, days=D.days.slice(from, to+1);
  const run=(S, p, cost)=>{ const A=C.dlyRun(D, S, p, cost, from, to); const st=C.dlyStats(A.eq, A.rets, days, A.gross); st.turn=A.turn/(A.rets.length/365); st.trades=A.trades; st.costPaid=A.cost; return { A, st }; };
  const hold={ w:()=>({ BTC:1 }) }, ew={ w(D, i, p, st){ if (st.w && st.next>i){ const w={}; for (const s in st.w) if (isFinite(D.px[s].c[i])) w[s]=st.w[s]; return w; } const xs=D.syms.filter(s=>isFinite(D.px[s].c[i]) && D.ind[s].age[i]>=30); st.w=Object.fromEntries(xs.map(s=>[s, 1/xs.length])); st.next=i+30; return st.w; } };
  const btc=run(hold, {}, C.DLY_COST.taker), all=run(ew, {}, C.DLY_COST.taker); log(`Bitcoin: ${(btc.st.cagr*100).toFixed(1)}% a year, deepest fall ${(btc.st.dd*100).toFixed(0)}%`);
  const res=[], trials=[];
  for (const S of C.DLY_STRATS){ const tk=run(S, S.p, C.DLY_COST.taker), mk=run(S, S.p, C.DLY_COST.maker); res.push({ S, tk, mk }); trials.push(tk.st.srd); log(`${S.id}: ${(tk.st.cagr*100).toFixed(1)}% a year (limit+BNB ${(mk.st.cagr*100).toFixed(1)}%), Sharpe ${tk.st.sharpe.toFixed(2)}, deepest fall ${(tk.st.dd*100).toFixed(0)}%`); }
  // robustness: every trade a full day late, costs doubled, and the two halves of the period on their own
  const lag=S=>({ w(D, i, p, st){ const t=S.w(D, i, p, st.s||(st.s={})), out={}, prev=st.prev||{}; for (const k in prev) if (isFinite(D.px[k].c[i])) out[k]=prev[k]; st.prev=t; return out; } });
  const mid=Math.floor((from+to)/2), part=(S, p, a, b)=>{ const A=C.dlyRun(D, S, p, C.DLY_COST.taker, a, b), st=C.dlyStats(A.eq, A.rets, D.days.slice(a, b+1), A.gross); return { cagr:st.cagr, sharpe:st.sharpe, dd:st.dd }; };
  // weekly strategies: the same rule started on each of the 7 days of the week (results should not hinge on the weekday)
  const phases=S=>{ if (!(S.id==='mom' || S.id==='mombull')) return null; const xs=[0,1,2,3,4,5,6].map(k=>part(S, { ...S.p, phase:k }, from, to)).sort((a,b)=>a.cagr-b.cagr); return { lo:xs[0], mid:xs[3], hi:xs[6] }; };
  const robust=S=>({ wd:phases(S), late:part(lag(S), S.p, from, to), dbl:(()=>{ const A=C.dlyRun(D, S, S.p, { fee:.002, slip:.001 }, from, to), st=C.dlyStats(A.eq, A.rets, days, A.gross); return { cagr:st.cagr, sharpe:st.sharpe, dd:st.dd }; })(), h1:part(S, S.p, from, mid), h2:part(S, S.p, mid, to) });
  const holdS={ w:()=>({ BTC:1 }), p:{} }, robBase={ late:part(holdS, {}, from, to), h1:part(holdS, {}, from, mid), h2:part(holdS, {}, mid, to) };
  // round 2: ideas that were tried and failed the exam — every setting run, all counted against luck
  const tried=C.DLY_TRIED.map(S=>{ for (const p of S.vars){ const r=run(S, p, C.DLY_COST.taker); trials.push(r.st.srd); } const r=run(S, S.p, C.DLY_COST.taker); trials.push(r.st.srd);
    return { id:S.id, name:S.name, why:S.why, vs:S.vs, full:{ cagr:r.st.cagr, sharpe:r.st.sharpe, dd:r.st.dd }, h1:part(S, S.p, from, mid), h2:part(S, S.p, mid, to) }; });
  const vars=C.DLY_VARIANTS.map(v=>{ const S=C.DLY_STRATS.find(x=>x.id===v.of), r=run(S, v.p, C.DLY_COST.taker); trials.push(r.st.srd); return { of:v.of, p:v.p, cagr:r.st.cagr, sharpe:r.st.sharpe, dd:r.st.dd }; });
  // ---- extras for the Desk
  let sd0=20261115; const rnd=()=>{ sd0=(sd0*16807)%2147483647; return sd0/2147483647; };
  // what one year can look like: 1,500 years rebuilt from 20-day blocks of the strategy's own daily results (keeps streaks and calm/wild spells together)
  const mc=rets=>{ const N=1500, Y=365, B=20, R=[]; let d30=0, d50=0; for (let k=0;k<N;k++){ let e=1, pk=1, dd=0; for (let d=0; d<Y;){ const st=Math.floor(rnd()*(rets.length-B)); for (let j=0;j<B && d<Y;j++, d++){ e*=1+rets[st+j]; if (e>pk) pk=e; dd=Math.max(dd, 1-e/pk); } } R.push(e-1); if (dd>=.3) d30++; if (dd>=.5) d50++; }
    R.sort((a,b)=>a-b); const q=x=>R[Math.floor(x*(N-1))]; return { p5:q(.05), p25:q(.25), p50:q(.5), p75:q(.75), p95:q(.95), loss:R.filter(v=>v<0).length/N, dd30:d30/N, dd50:d50/N }; };
  // the last 365 days at every point in time (every 2 weeks): return and Sharpe
  const roll=eq=>{ const out=[]; for (let k=365;k<eq.length;k+=14){ let m=0, v=0; for (let j=k-364;j<=k;j++) m+=eq[j]/eq[j-1]-1; m/=365; for (let j=k-364;j<=k;j++) v+=(eq[j]/eq[j-1]-1-m)**2; const sd=Math.sqrt(v/364);
    out.push([days[k], Math.round((eq[k]/eq[k-365]-1)*1e4)/1e4, sd>0 ? Math.round(m/sd*Math.sqrt(365)*100)/100 : 0]); } return out; };
  const corr=(a,b)=>{ const n=Math.min(a.length, b.length); let ma=0, mb=0; for (let k=0;k<n;k++){ ma+=a[k]; mb+=b[k]; } ma/=n; mb/=n; let x=0, ya=0, yb=0; for (let k=0;k<n;k++){ x+=(a[k]-ma)*(b[k]-mb); ya+=(a[k]-ma)**2; yb+=(b[k]-mb)**2; } return ya>0 && yb>0 ? Math.round(x/Math.sqrt(ya*yb)*100)/100 : 0; };
  // in Turkish lira: the dollar result times the change in the dollar-lira rate (from 2020, when the rate is known)
  const fx=new Float64Array(days.length).fill(NaN); { const m=new Map((cache.fx||[]).map(r=>[r[0], r[1]])); let last=NaN; for (let k=0;k<days.length;k++){ const v=m.get(days[k]); if (v>0) last=v; fx[k]=last; } }
  const tl=eq=>{ const years={}, k0=days.findIndex((t,k)=>t>=Date.UTC(2020,0,1) && isFinite(fx[k])); if (k0<1) return null; let prev=k0;
    for (let k=k0+1;k<days.length;k++){ const y=new Date(days[k]).getUTCFullYear(), end=k===days.length-1 || new Date(days[k+1]).getUTCFullYear()!==y; if (end){ if (isFinite(fx[k]) && isFinite(fx[prev])) years[y]=eq[k]*fx[k]/(eq[prev]*fx[prev])-1; prev=k; } }
    const n=days.length-1, yrs=(days[n]-days[k0])/(365*DAY); return { from:days[k0], years, usd:Math.pow(eq[n]/eq[k0], 1/yrs)-1, try:Math.pow(eq[n]*fx[n]/(eq[k0]*fx[k0]), 1/yrs)-1, fx0:fx[k0], fx1:fx[n] }; };
  // the price of Bitcoin on the first day of each month, and whether the Guard was in (for the DCA planner)
  const dca=[]; { let lastM=-1; for (let k=0;k<days.length;k++){ const dt=new Date(days[k]), m=dt.getUTCFullYear()*12+dt.getUTCMonth(); if (m===lastM) continue; lastM=m; const i=from+k, c=D.px.BTC.c[i], sma=D.ind.BTC.sma[50][i];
    dca.push([days[k], Math.round(c*100)/100, isFinite(sma) && c>sma ? 1 : 0, isFinite(fx[k]) ? Math.round(fx[k]*1e4)/1e4 : null]); } }
  const extras=(A)=>({ mc:mc(A.rets), roll:roll(A.eq), tl:tl(A.eq) });
  const wk=(eq, base)=>eq.filter((_,k)=>k%7===0 || k===eq.length-1).map(v=>Math.round(v/base*10000)/10000);
  const strip=st=>{ const { years, srd, skew, kurt, n, ...rest }=st; return rest; };
  const out={ v:1, t:Date.now(), from:days[0], to:days[days.length-1]+DAY, days:days.length, coins:Object.fromEntries(Object.keys(raw).map(s=>[s, raw[s][0][0]])), delisted:Object.keys(raw).filter(s=>raw[s][raw[s].length-1][0]<Date.now()-5*DAY),
    cost:C.DLY_COST, trials:trials.length, trialSr:trials.map(v=>Math.round(v*1e5)/1e5), fundFrom:Date.UTC(2020, 0, 1),
    dca, corr:{ ids:res.map(x=>x.S.id).concat(['btc']), m:res.map(x=>x.tk.A.rets).concat([btc.A.rets]).map((a,_,all)=>all.map(b=>corr(a, b))) },
    base:{ btc:{ ...strip(btc.st), years:btc.st.years, eq:wk(btc.A.eq, btc.A.eq[0]), ...extras(btc.A) }, ew:{ ...strip(all.st), years:all.st.years, eq:wk(all.A.eq, all.A.eq[0]) } },
    strats:res.map(({ S, tk, mk })=>{ const r={ id:S.id, ...strip(tk.st), years:tk.st.years, maker:strip(mk.st), dsr:C.dlyDSR(tk.st, trials), eq:wk(tk.A.eq, tk.A.eq[0]) }; r.ready=C.dlyReady(r, btc.st); r.ready={ ok:r.ready.ok, pass:r.ready.pass, c:r.ready.c.map(x=>[!!x[0], x[1]]) }; r.rob=robust(S); Object.assign(r, extras(tk.A)); { const A=C.dlyRun(D, S, S.p, { ...C.DLY_COST.taker, cash:.03 }, from, to), st=C.dlyStats(A.eq, A.rets, days, A.gross); r.cash={ cagr:st.cagr, sharpe:st.sharpe, dd:st.dd }; } return r; }), robBase, tried, mid:D.days[mid],
    variants:vars, ms:Date.now()-t0,
    // for the welcome page: Bitcoin every week, and whether the Guard held it (and how much Momentum + Bull Filter held)
    vis:(()=>{ const g=res.find(x=>x.S.id==='guard'), m=res.find(x=>x.S.id==='mombull'), out=[]; for (let k=0;k<days.length;k+=7) out.push([days[k], Math.round(D.px.BTC.c[from+k]), g && g.tk.A.gross[k]>.5 ? 1 : 0, m ? Math.round(m.tk.A.gross[k]*100)/100 : 0]); return out; })() };
  fs.writeFileSync(path.join(DATA, 'daily.json'), JSON.stringify(out)); log(`daily test: ${out.days} days, ${out.trials} variants, ${((Date.now()-t0)/1000).toFixed(0)} s`); })().catch(e=>{ console.error(e); process.exit(1); });

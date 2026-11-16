// Tidewater Live: engine v5 (hourly learners, futures signals) — runs in node
const fs=require('fs'), vm=require('vm'); const ctx={ console, Date, Math, JSON, Map, Set, Infinity }; vm.createContext(ctx);
vm.runInContext(['live_broker.js','ai_bots.js','ai_learn.js'].map(f=>fs.readFileSync(__dirname+'/../'+f,'utf8')).join('\n')+';Object.assign(this,{AI,AI_CFG,AI_FEATS_GET:()=>AI_FEATS,BRK});', ctx);
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const B=300000, H=3600e3, T0=Date.UTC(2026,7,1); let seed=9; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
check('v5 is the default: 18 signals, hourly target 4 candles ahead', ctx.AI_CFG.V===5 && ctx.AI_FEATS_GET().length===18 && ctx.AI_CFG.HH===4);
// the timeframe switch is undone even if the step throws
{ const before=[ctx.AI_CFG.BAR, ctx.AI_CFG.H, ctx.AI.btc]; let inside; try{ ctx.aiTF(()=>{ inside=[ctx.AI_CFG.BAR, ctx.AI_CFG.H, ctx.AI.btc===ctx.AI.btcH]; throw new Error('x'); }); }catch(e){}
  check('inside an hourly step one candle is an hour and the target 4 hours; afterwards (even after an error) everything is back', inside[0]===H && inside[1]===4 && inside[2] && ctx.AI_CFG.BAR===before[0] && ctx.AI_CFG.H===before[1] && ctx.AI.btc===before[2]); }
// only closed hours are used
{ const hb=Array.from({ length:5 }, (_,i)=>({ t:T0+i*H, o:1, h:1, l:1, c:1 })), got=ctx.aiHBars('ETH', T0+4*H+30*60000, { hb:{ ETH:hb } });
  check('an hour that is still running is never used', got.length===4 && got[3].t===T0+3*H); }
// futures signals
{ ctx.AI.der.fund.ETH=[[T0, .0001], [T0+8*H, -.0002], [T0+16*H, .0003]]; ctx.AI.der.basis.ETH=new Map([[T0+5*H, -.0012]]);
  check('the funding rate used is the last one paid by the candle’s close, never a later one', ctx.aiFund('ETH', T0+7*H)===.0001 && ctx.aiFund('ETH', T0+8*H)===-.0002 && ctx.aiFund('ETH', T0-1)===0);
  check('the futures-spot gap is the hour’s own value, 0 when unknown', ctx.aiBasis('ETH', T0+5*H)===-.0012 && ctx.aiBasis('ETH', T0+6*H)===0);
  const x=Array.from({ length:18 }, (_,j)=>j+1), y=ctx.aiMirrorX(x);
  check('the mirror (for learning falls) also flips funding, the gap and the lag', y[15]===-16 && y[16]===-17 && y[17]===-18 && y[13]===14); }
// saving and loading the futures data
{ const sv=JSON.parse(JSON.stringify(ctx.aiDerSave())); ctx.AI.der={ fund:{}, basis:{} }; ctx.aiDerLoad(sv);
  check('the futures data survives being saved and loaded (the server keeps it between runs)', ctx.aiFund('ETH', T0+9*H)===-.0002 && ctx.aiBasis('ETH', T0+5*H)===-.0012); }
// a whole hourly learner: decides once an hour, on hourly candles, with all 18 signals
{ ctx.AI.btc.clear(); ctx.AI.btcH.clear(); const cs5=[]; let p=100, d=.004;
  // 50 days of 5-minute candles with real trends that last a few hours
  for (let i=0;i<50*288;i++){ if (i%36===0 && rnd()<.35) d=-d; p*=1+d/12+(rnd()-.5)*.003; cs5.push(p); }
  const bars=cs5.map((c,i)=>{ const o=i ? cs5[i-1] : c; return { t:T0+i*B, o, h:Math.max(o,c)*1.0005, l:Math.min(o,c)*.9995, c, v:100 }; }), HB=ctx.aiHourly(bars).hb;
  const bots=ctx.aiNew().filter(b=>['nb','q'].includes(b.id)), q=c=>({ kind:'crypto', last:c, bid:c, ask:c, open:true }); let decided=0, lastSeen=null, feat=null;
  for (let i=320*12;i<bars.length;i+=1){ const now=bars[i].t+B; ctx.AI.reg='range'; ctx.aiStep(bots, 'BTC', bars.slice(Math.max(0, i-999), i+1), ()=>q(bars[i].c), now, { open:true, hb:{ BTC:HB } });
    const L=bots.find(b=>b.id==='nb'); if (L.seenH && L.seenH.BTC!==lastSeen){ decided++; lastSeen=L.seenH.BTC; } }
  const L=bots.find(b=>b.id==='nb'), hrs=Math.floor((bars.length-320*12)/12);
  check('the Bayesian Classifier decides once per closed hour (not every 5 minutes)', Math.abs(decided-hrs)<=2, `${decided} decisions over ${hrs} hours`);
  check('…it learned from hourly candles, with 18 signals', L.model.dim===18 && L.model.n>500, `${L.model.n} hourly examples`);
  check('…its record is hourly (each entry an hour apart per coin)', L.hist.length>200 && L.hist.every((e,k)=>k===0 || (e.t-L.hist[k-1].t)%H===0), `${L.hist.length} entries`);
  check('…and the Q-Learning Agent, which works on 5-minute candles, still steps every 5 minutes', bots.find(b=>b.id==='q').seen.BTC===bars[bars.length-1].t && !bots.find(b=>b.id==='q').seenH);
  check('…the hourly learner started a fresh record on the new timeframe', L.tf==='1h' && (L.hist||[]).every(e=>e.t%H===0)); }
// stocks are left to the stock bots
{ const bots=ctx.aiNew().filter(b=>b.id==='nb'), bars=Array.from({ length:100 }, (_,i)=>({ t:T0+i*B, o:100, h:101, l:99, c:100, v:10 }));
  ctx.aiStep(bots, 'AAPL', bars, ()=>({ kind:'stock', last:100, open:true }), T0+100*B, { open:true }); check('hourly learners leave US stocks to the stock bots', bots[0].think.AAPL && bots[0].think.AAPL.code==='tf_crypto'); }
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail ? 1 : 0);

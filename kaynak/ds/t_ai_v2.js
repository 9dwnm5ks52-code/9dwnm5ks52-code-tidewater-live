// Tidewater Live: engine v2 and self-improvement, on made-up candles where the answer is known (runs in node)
const fs=require('fs'), vm=require('vm'); const ctx={ console, Date, Math, JSON, Map, Set, Infinity }; vm.createContext(ctx);
vm.runInContext(['live_broker.js','ai_bots.js','ai_learn.js'].map(f=>fs.readFileSync(__dirname+'/../'+f,'utf8')).join('\n')+';Object.assign(this,{AI,AI_CFG,AI_FEATS_GET:()=>AI_FEATS,BRK,AIL,aiAcc});', ctx);
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const B=300000, T0=Date.UTC(2026,9,1); let seed=5; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
const mk=(cs, amp)=>cs.map((c,i)=>{ const o=i ? cs[i-1] : c, w=amp ? amp[i] : .0005; return { t:T0+i*B, o, h:Math.max(o,c)*(1+w), l:Math.min(o,c)*(1-w), c, v:100+(i%7)*9 }; });
function regimes(n, d0){ const cs=[]; let p=100, d=d0||.0015; for (let i=0;i<n;i++){ if (rnd()<.01) d=-d; p*=1+d+(rnd()-.5)*.006; cs.push(p); } return cs; }
check('v5 is on by default (hourly learners with futures signals; 18 of them, a 4-hour target)', ctx.AI_CFG.V===5 && ctx.AI_CFG.SHORT && ctx.AI_FEATS_GET().length===18 && ctx.AI_CFG.HH===4); ctx.aiSetV(2);
check('v2 itself: 15 signals, a 1-hour target', ctx.AI_FEATS_GET().length===15 && ctx.AI_CFG.H===12);
// no peeking: a signal at candle i is the same whether or not later candles exist
{ const bars=mk(regimes(800)), I=ctx.aiInd(bars), Ip=ctx.aiInd(bars.slice(0, 501)); for (const b of bars) ctx.AI.btc.set(b.t, b.c); const a=ctx.aiFeat(I, 500), b=ctx.aiFeat(Ip, 500);
  check('a signal never uses later candles (same value with or without the future)', a.length===15 && a.every((v,j)=>Math.abs(v-b[j])<1e-12), a.map(v=>v.toFixed(4)).join(' ')); }
// the target must beat the costs
{ const bars=Array.from({ length:20 }, (_,i)=>({ t:i*B, c:i<12 ? 100 : 100.2 })), b2=Array.from({ length:20 }, (_,i)=>({ t:i*B, c:i<12 ? 100 : 100.4 }));
  check('the target is “rises more than two fees and a margin within an hour”: +0.2% is a no, +0.4% a yes', ctx.aiLabel(bars, 0, 'BTC')===0 && ctx.aiLabel(b2, 0, 'BTC')===1); }
// size by volatility
{ const calm=mk(regimes(400), Array(400).fill(.0005)), wild=mk(regimes(400), Array.from({ length:400 }, (_,i)=>i>380 ? .02 : .0005));
  const sc=ctx.aiSize(ctx.aiInd(calm), 399), sw=ctx.aiSize(ctx.aiInd(wild), 399);
  check('a coin that suddenly swings more gets a smaller position (sizes stay between 8% and 35%)', sw<sc && sw>=.08 && sc<=.35, `${(sc*100).toFixed(0)}% normal, ${(sw*100).toFixed(0)}% wild`); }
// total risk cap
{ const bot=ctx.aiBot('knn'), q=s=>({ kind:'crypto', last:100, bid:100, ask:100, open:true }); bot.meta={ ETH:{ risk:550 }, SOL:{ risk:20 } };
  const r=ctx.aiBuy(bot, 'BTC', q('BTC'), { act:'b', code:'ml_up', stop:95, size:.3 }, Date.now(), 0); const spent=10000-bot.A.cash;
  check('with 5.7% of the money already at risk, a new trade is cut down so total risk stays under 6%', r && r.code==='ml_up' && spent<700 && spent>500, `spent $${spent.toFixed(0)} (risk $${(spent*.05).toFixed(0)})`);
  bot.meta={ ETH:{ risk:580 }, SOL:{ risk:20 } }; const r2=ctx.aiBuy(bot, 'DOGE', q('DOGE'), { act:'b', code:'ml_up', stop:95, size:.3 }, Date.now(), 0);
  check('…and refused when there is no room left', r2.code==='heat_full'); }
// self-tuning on its own record
{ const bot={ hist:[] }; for (let k=0;k<600;k++){ const p=rnd(); bot.hist.push({ s:'BTC', t:k, p, c:100, r:p>=.6 ? .006 : -.004 }); } const t=ctx.aiTune(bot, 1);
  check('a bot tunes its entry threshold on its own past forecasts: it learns that only its ≥60% calls paid', t && t.minP===.6 && t.net>0, JSON.stringify(t));
  const bad={ hist:Array.from({ length:600 }, (_,k)=>({ s:'BTC', t:k, p:rnd(), c:100, r:-.003 })) }; const t2=ctx.aiTune(bad, 1);
  check('…and when none of its calls paid, it stops opening trades (and keeps learning) until one does', t2.minP>1 && t2.net<=0); }
// v2 learners on a market with real up and down phases
for (const id of ['knn','nb','forest']){ ctx.AI.btc.clear(); const L=ctx.AIL[id], M=L.init(), bars=mk(regimes(3000)); for (const b of bars) ctx.AI.btc.set(b.t, b.c); ctx.aiTrainP(id, M, 'SOL', bars, ctx.aiInd(bars));
  const ys=[]; for (let i=290;i+12<bars.length;i++) ys.push(ctx.aiLabel(bars, i, 'SOL')); const up=ys.reduce((a,b)=>a+b,0)/ys.length, base=Math.max(up, 1-up), acc=ctx.aiAcc(M);
  check(`${id} (v2): guesses “beats the costs within the hour” better than always giving the most common answer`, acc>base+.02, `${(acc*100).toFixed(1)}% vs ${(base*100).toFixed(1)}%`); }
// regimes
{ const I=s=>ctx.aiInd(mk(s)); const up=Array.from({ length:400 }, (_,i)=>100*1.0015**i), dn=Array.from({ length:400 }, (_,i)=>100*.9985**i), fl=Array.from({ length:400 }, (_,i)=>100*(1+.002*Math.sin(i/5)));
  const st=mk(fl, Array.from({ length:400 }, (_,i)=>i>385 ? .03 : .0005));
  const got=[ctx.aiRegime(I(up), 399), ctx.aiRegime(I(dn), 399), ctx.aiRegime(I(fl), 399), ctx.aiRegime(ctx.aiInd(st), 399)];
  check('the market regime is read from Bitcoin: rising, falling, sideways, stormy', got.join()==='up,down,range,storm', got.join()); }
// a model built for 8 signals starts again when the engine has 15
{ const bot=ctx.aiBot('knn'); bot.model.dim=8; const bars=mk(regimes(500)); ctx.aiStep([bot], 'ETH', bars, ()=>({ kind:'crypto', last:bars[499].c, open:true }), bars[499].t+B, { open:true });
  check('a bot whose model was built for another set of signals starts learning again with the new ones', bot.model.dim===15); }
// the diary
{ const bot=ctx.aiBot('knn'); ctx.aiMarkAll([bot], {}, Date.UTC(2026,10,1,10)); ctx.aiMarkAll([bot], {}, Date.UTC(2026,10,1,18)); ctx.aiMarkAll([bot], {}, Date.UTC(2026,10,2,9));
  check('each bot keeps one diary line a day', bot.diary.length===2 && bot.diary[0].v===10000, JSON.stringify(bot.diary[1])); }
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);

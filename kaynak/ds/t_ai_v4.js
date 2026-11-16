// Tidewater Live: engine v4 (the rule bot, the Q-Learning Agent, proves its edge before it trades; hourly candles)
const fs=require('fs'), vm=require('vm'); const ctx={ console, Date, Math, JSON, Map, Set, Infinity }; vm.createContext(ctx);
vm.runInContext(['live_broker.js','ai_bots.js','ai_learn.js'].map(f=>fs.readFileSync(__dirname+'/../'+f,'utf8')).join('\n')+';Object.assign(this,{AI,AI_CFG,AI_RULE,BRK});', ctx);
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const B=300000, H=3600e3, T0=Date.UTC(2026,9,1); let seed=3; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
const mk=cs=>cs.map((c,i)=>{ const o=i ? cs[i-1] : c; return { t:T0+i*B, o, h:Math.max(o,c)*1.0005, l:Math.min(o,c)*.9995, c, v:100 }; });
check('v5 (which includes v4) is the default, with shorts on', ctx.AI_CFG.V===5 && ctx.AI_CFG.SHORT===true); ctx.aiSetV(4);
// hourly candles from 5-minute ones
{ const bars=mk(Array.from({ length:36 }, (_,i)=>100+i)); const a=ctx.aiHourly(bars), b=ctx.aiHourly(bars.slice(0, 30));
  check('hourly candles are built from twelve 5-minute candles; an unfinished hour is left out', a.hb.length===3 && a.fresh && a.hb[0].o===100 && a.hb[0].c===111 && a.hb[0].h>=111 && b.hb.length===2 && !b.fresh, JSON.stringify(a.hb[0])); }
// the record test
{ const bot={ hist:[] }; for (let k=0;k<60;k++) bot.hist.push({ s:'BTC', t:k, p:1, c:100, r:.006+(rnd()-.5)*.004, hz:12 }); const t=ctx.aiTuneRule(bot, 1);
  check('a rule bot whose last signals clearly beat the costs may trade that side', t.okL && !t.okS && t.nL===60, JSON.stringify({ okL:t.okL, netL:t.netL.toFixed(4) }));
  const bad={ hist:Array.from({ length:300 }, (_,k)=>({ s:'BTC', t:k, p:1, c:100, r:(rnd()-.5)*.01, hz:12 })) }, t2=ctx.aiTuneRule(bad, 1);
  check('…one whose signals do not beat the costs is kept out', !t2.okL && t2.nL===300);
  const few={ hist:Array.from({ length:10 }, (_,k)=>({ s:'BTC', t:k, p:1, c:100, r:.02, hz:12 })) }, t3=ctx.aiTuneRule(few, 1);
  check('…and 10 great signals are not enough (it needs 25)', !t3.okL); }
// the gate inside the step: the rule bot with no proven edge records its signal and does not trade
{ ctx.AI.btc.clear(); const cs=[]; let p=100, d=.0015; for (let i=0;i<1400;i++){ if (rnd()<.01) d=-d; p*=1+d+(rnd()-.5)*.006; cs.push(p); } const bars=mk(cs);
  const bots=ctx.aiNew().filter(b=>b.id==='q'), q=c=>({ kind:'crypto', last:c, bid:c, ask:c, open:true }); let buys=0, noedge=0;
  for (let i=320;i<bars.length;i++){ ctx.AI.reg='up'; const out=ctx.aiStep(bots, 'BTC', bars.slice(Math.max(0, i-999), i+1), ()=>q(bars[i].c), bars[i].t+B, { open:true }); buys+=out.filter(o=>o.act==='b').length; if (bots[0].think.BTC.code==='rule_noedge') noedge++; }
  const T=bots[0].tune;
  check('the Q-Learning Agent is the one rule bot; it keeps a record of its signals and, without a proven edge, watches instead of trading', ctx.AI_RULE.join()==='q' && T && T.rule && bots[0].hist.length>0 && (T.okL || buys===0) && (buys===0 ? noedge>0 : true), JSON.stringify({ signals:bots[0].hist.length, buys, okL:T && T.okL })); }
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail ? 1 : 0);

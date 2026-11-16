// Tidewater Live: the strategy backtester and your own bot, on made-up candles (runs in node)
const fs=require('fs'), vm=require('vm'); const ctx={ console, Date, Math, JSON, Map, Set, Infinity }; vm.createContext(ctx);
vm.runInContext(['live_broker.js','ai_bots.js','ai_learn.js','strategy.js'].map(f=>fs.readFileSync(__dirname+'/../'+f,'utf8')).join('\n')+';this.AI_CFG=AI_CFG;this.ST_PRESETS=ST_PRESETS;', ctx);
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const T0=Date.UTC(2026,10,1), B=300000, mk=cs=>cs.map((c,i)=>{ const o=i ? cs[i-1] : c; return { t:T0+i*B, o, h:Math.max(o,c)*1.0005, l:Math.min(o,c)*.9995, c, v:100 }; });
let seed=3; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
// a buy-and-hold-like rule on a steady climb: the result is buy and hold minus two fees
let cs=Array.from({ length:300 }, (_,i)=>100*1.002**i), R=ctx.stTest({ in:[{ k:'rsi_above', a:50 }], out:{} }, mk(cs), .001);
check('in a steady climb, “buy when RSI is over 50 and hold” earns buy-and-hold minus the fees', R.n===1 && Math.abs((1+R.ret)-(1+R.bhRet)*(.999*.999)*(cs[61]/cs[60]) / (cs[61]/cs[60]))<.01 && R.ret>.5, `${(R.ret*100).toFixed(1)}% vs ${(R.bhRet*100).toFixed(1)}%`);
// a stop-loss caps the loss of each trade in a fall
cs=Array.from({ length:300 }, (_,i)=>i<100 ? 100 : 100*.995**(i-100)); R=ctx.stTest({ in:[{ k:'rsi_below', a:45 }], out:{ stop:3 } }, mk(cs), .001);
check('in a long fall, a 3% stop keeps each loss near 3%', R.n>=2 && R.trades.every(t=>t.ret>-.045), R.trades.map(t=>(t.ret*100).toFixed(1)+'% '+t.why).join(', '));
// take-profit and time exits work, and it never buys on the very last candle
cs=Array.from({ length:400 }, (_,i)=>100*(1+.03*Math.sin(i/9))); R=ctx.stTest(ctx.ST_PRESETS.dip, mk(cs), .001);
check('the RSI-dip preset trades a swinging market, exits by its rules, and the stats add up', R.n>=3 && R.trades.every(t=>['rsi','take','stop','time','open'].includes(t.why) && t.j>t.i) && R.win!=null && R.dd>=0 && R.dd<1, `${R.n} trades, win ${(R.win*100).toFixed(0)}%, ${(R.ret*100).toFixed(1)}% vs hold ${(R.bhRet*100).toFixed(1)}%`);
// your bot: the engine runs your rules live on one coin, all-in, and only that coin
{ const bot=ctx.aiBot('my1'); bot.custom={ name:'Test', sym:'BTC', rules:{ in:[{ k:'rsi_above', a:50 }], out:{ stop:3 } } }; const bars=mk(Array.from({ length:120 }, (_,i)=>100*1.002**i)), q={ kind:'crypto', last:bars[119].c, open:true };
  ctx.aiStep([bot], 'ETH', bars, ()=>q, bars[119].t+B, { open:true }); const none=!Object.keys(bot.meta).length;
  ctx.aiStep([bot], 'BTC', bars, ()=>q, bars[119].t+B, { open:true }); const m=bot.meta.BTC;
  check('your own bot trades only its coin, with 95% of its money, and sets your stop', none && m && Math.abs(bot.A.cash/bot.A.start-.05)<.01 && Math.abs(m.stop-q.last*.97)<1e-6, JSON.stringify({ cashLeft:bot.A.cash.toFixed(0), stop:m && m.stop.toFixed(2) })); }
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);

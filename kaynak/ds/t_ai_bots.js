// Tidewater Live: the bot engine (roster, orders, stops, switching off, saving), on made-up candles where the right answer is known (runs in node)
const fs=require('fs'), vm=require('vm');
const ctx={ console, Date, Math, JSON, Map, Set }; vm.createContext(ctx);
vm.runInContext(['live_broker.js','ai_bots.js','ai_learn.js','strategy.js'].map(f=>fs.readFileSync(__dirname+'/../'+f,'utf8')).join('\n')+';aiSetV(1);this.AI_CFG=AI_CFG;this.BRK=BRK;this.aiAcc=aiAcc;this.AI_DEFS=AI_DEFS;', ctx);
const F=n=>ctx[n]; const CFG=ctx.AI_CFG;
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const T0=Date.UTC(2026,10,10,0,0), BAR=CFG.BAR;
const mk=closes=>closes.map((c,i)=>{ const o=i ? closes[i-1] : c; return { t:T0+i*BAR, o, h:Math.max(o,c)*1.0005, l:Math.min(o,c)*.9995, c, v:100+(i%7)*5 }; });
const qOf=bars=>()=>{ const c=bars[bars.length-1].c; return { kind:'crypto', last:c, bid:c*.9999, ask:c*1.0001, open:true }; };
// replay bars one by one, as the live engine sees them
function replay(bots, sym, bars, from){ const acts=[]; for (let n=from;n<=bars.length;n++){ const seen=bars.slice(0,n), now=seen[n-1].t+BAR; const q=qOf(seen); acts.push(...F('aiStep')(bots, sym, seen, q, now)); } return acts; }
let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
// indicators
const ema=F('aiEMA')([5,5,5,5], 3), rsi=F('aiRSI')(Array.from({ length:30 }, (_,i)=>100+i)), sma=F('aiSMA')([1,2,3,4], 2);
check('the indicators are right on simple cases (flat average, RSI of a steady rise, moving average)', ema.every(x=>x===5) && rsi[29]===100 && sma[1]===1.5 && sma[3]===3.5 && sma[0]===null);
// the roster: the six bots that stay after the weak hourly bots were retired
check('the roster is the three forecasters, the Q-Learning Agent and the two stock bots', F('AI_DEFS').map(d=>d.id).join()==='knn,nb,forest,q,rank,sector', F('AI_DEFS').map(d=>d.id).join());
// position limit, stops between candles, switching off, saving
{ const bot=F('aiBot')('knn'), q=p=>({ kind:'crypto', last:p, bid:p*.9999, ask:p*1.0001, open:true }), now=T0+500*BAR;
  const got=['BTC','ETH','SOL','BNB'].map(s=>F('aiBuy')(bot, s, q(100), { act:'b', code:'ml_up', vals:{}, stop:97 }, now, now).code);
  check('a bot holds at most 3 coins at once', Object.keys(bot.meta).length===3 && got.join()==='ml_up,ml_up,ml_up,full' && !bot.meta.BNB, got.join());
  check('it uses about 30% of its money per coin and pays the 0.1% fee', Math.abs(bot.log[0].usd-CFG.CASH*CFG.SIZE)<CFG.CASH*.01 && bot.A.fills.every(f=>f.fee>0), bot.log[0].usd.toFixed(2));
  const sym='ETH', stop=bot.meta[sym].stop, out=F('aiTick')([bot], { [sym]:q(stop*.99) }, now+1000);
  check('a stop is hit the moment the live price falls through it, without waiting for the candle', out.length===1 && !bot.meta[sym] && bot.log[bot.log.length-1].code==='stop_hit', JSON.stringify(out)); }
{ // your own strategy bot buys an oversold dip; switched off, the same bot does nothing
  const cs=[]; let p=100; for (let i=0;i<120;i++){ p*=1+(rnd()-.5)*.002; cs.push(p); } for (let i=0;i<12;i++){ p*=.992; cs.push(p); } for (let i=0;i<20;i++){ p*=1.003; cs.push(p); }
  const mine=()=>{ const b=F('aiBot')('my1'); b.custom={ name:'Dip', sym:'ETH', rules:{ in:[{ k:'rsi_below', a:30 }], out:{ rsi_above:55, stop:3 } } }; return b; };
  const on=[mine()]; replay(on, 'ETH', mk(cs), 100); const off=[mine()]; off[0].on=false; const before=off[0].A.cash; replay(off, 'ETH', mk(cs), 100);
  check('a switched-off bot does not trade (the same bot switched on does)', on[0].log.some(x=>x.act==='b' && x.code==='my_buy') && off[0].A.cash===before && off[0].log.length===0, `on: ${on[0].log.length} trades, off: ${off[0].log.length}`); }
{ const s=JSON.parse(JSON.stringify(F('aiNew')())); check('the bots and their models survive being saved and loaded', s.length===F('AI_DEFS').length && Array.isArray(s[0].model.mem) && s[0].A.cash===CFG.CASH && s.every(b=>b.model)); }
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);

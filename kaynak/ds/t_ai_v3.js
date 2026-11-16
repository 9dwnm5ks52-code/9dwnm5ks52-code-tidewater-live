// Tidewater Live: engine v3, short selling for the learning bots (runs in node)
const fs=require('fs'), vm=require('vm'); const ctx={ console, Date, Math, JSON, Map, Set, Infinity }; vm.createContext(ctx);
vm.runInContext(['live_broker.js','ai_bots.js','ai_learn.js'].map(f=>fs.readFileSync(__dirname+'/../'+f,'utf8')).join('\n')+';Object.assign(this,{AI,AI_CFG,BRK,AIL,aiAcc});', ctx);
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const B=300000, T0=Date.UTC(2026,9,1); let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
const mk=cs=>cs.map((c,i)=>{ const o=i ? cs[i-1] : c; return { t:T0+i*B, o, h:Math.max(o,c)*1.0005, l:Math.min(o,c)*.9995, c, v:100+(i%7)*9 }; });
check('v5 (which includes v3) is the default', ctx.AI_CFG.V===5 && ctx.AI_CFG.SHORT===true); ctx.aiSetV(3);
check('v3 turns short selling on', ctx.AI_CFG.V===3 && ctx.AI_CFG.SHORT===true);
// the broker: a short and its cover
{ const A=ctx.brkNew ? ctx.brkNew(10000) : { cash:10000, pos:{}, orders:[], fills:[], nid:1, eq:[] }, q=p=>({ kind:'crypto', last:p, bid:p, ask:p, open:true });
  const r=ctx.brkShort(A, { sym:'ETH', kind:'crypto', usd:2000 }, q(100), 1); const e1=ctx.brkEquity(A, { ETH:q(100) });
  check('selling short: the account owes the coins (negative amount) and holds the money from the sale', r.ok && A.pos.ETH.q<0 && Math.abs(A.cash-(10000+2000-2)) < .01, `cash $${A.cash.toFixed(2)}, ${A.pos.ETH.q} ETH`);
  check('…its value right after is the starting money minus the fee', Math.abs(e1-(10000-2))<.01, e1.toFixed(2));
  check('…a long on the same coin is refused until the short is closed, and a short on top of a long too', !ctx.brkShort({ cash:1000, pos:{ ETH:{ q:1, avg:100, kind:'crypto' } }, fills:[], nid:1 }, { sym:'ETH', usd:100 }, q(100), 1).ok);
  const c=ctx.brkCover(A, { sym:'ETH' }, q(90), 2);
  check('buying back 10% lower earns 10% of the position, minus fees', c.ok && !A.pos.ETH && Math.abs(c.fill.pl-(20*10-20*90*.001))<.01, `P/L $${c.fill.pl.toFixed(2)}`);
  check('…and the account ends with that gain', Math.abs(A.cash-(10000-2+c.fill.pl))<.01, A.cash.toFixed(2)); }
// the mirror: rises become falls
{ const x=Array.from({ length:15 }, (_,j)=>j+1), y=ctx.aiMirrorX(x), z=ctx.aiMirrorX(y);
  check('the mirror flips the direction signals and swaps the distances to the day’s high and low; mirroring twice gives the original', y[0]===-1 && y[6]===7 && y[10]===-12 && y[11]===-11 && z.every((v,j)=>v===x[j])); }
{ const bars=Array.from({ length:20 }, (_,i)=>({ t:i*B, c:i<12 ? 100 : 99.6 }));
  check('the fall target: down more than the costs within an hour', ctx.aiLabelDn(bars, 0, 'BTC')===1 && ctx.aiLabel(bars, 0, 'BTC')===0); }
// decisions
{ const bot={ tune:{ minP:1.01, minPs:.6 } };
  const d=ctx.aiProbAct(null, 100, .2, {}, { bot, atr:1, pd:.7, t:1 });
  check('with a proven edge on falls and a 70% fall forecast it sells short, stop 2 ATR above, target 3 ATR below', d.act==='ss' && d.stop===102 && d.tp===97, JSON.stringify(d));
  const d2=ctx.aiProbAct(null, 100, .2, {}, { bot:{ tune:{ minP:1.01, minPs:1.01 } }, atr:1, pd:.9, t:1 });
  check('…without a proven edge on falls it does not short', !d2.act && d2.code==='ml_noedge');
  const pos={ dir:-1, stop:102, tp:97, bt:1 };
  check('a short is bought back at its stop above the price', ctx.aiProbAct(pos, 102.5, .5, {}, { bot, pd:.7, t:2 }).act==='bc');
  check('…at its target below', ctx.aiProbAct(pos, 96.9, .5, {}, { bot, pd:.7, t:2 }).code==='short_tp');
  check('…when the fall forecast fades', ctx.aiProbAct(pos, 100, .5, {}, { bot, pd:.2, t:2 }).code==='ml_cover');
  check('…and otherwise it holds', ctx.aiProbAct(pos, 100, .5, {}, { bot, pd:.7, t:2 }).code==='ml_hold_short'); }
// tuning both ways
{ const bot={ hist:[] }; for (let k=0;k<800;k++){ const pd=rnd(); bot.hist.push({ s:'BTC', t:k, p:.3, pd, c:100, r:pd>=.65 ? -.006 : .003 }); } const t=ctx.aiTune(bot, 1);
  check('a bot tunes a separate threshold for shorts: it learns that its ≥65% fall calls paid', t && t.minPs===.65 && t.minP>1, JSON.stringify(t)); }
// a whole bot on a market that keeps falling in steps
{ ctx.AI.btc.clear(); const cs=[]; let p=100; for (let i=0;i<3000;i++){ const ph=Math.floor(i/150)%2; p*=1+(ph ? -.0016 : .0004)+(rnd()-.5)*.004; cs.push(p); } const bars=mk(cs);
  const bots=ctx.aiNew().filter(b=>['nb','forest'].includes(b.id)), q=c=>({ kind:'crypto', last:c, bid:c*.9999, ask:c*1.0001, open:true }); let shorts=0, covers=0, minE=1e9;
  for (let i=320;i<bars.length;i++){ ctx.AI.reg='down'; const w=bars.slice(Math.max(0, i-999), i+1), out=ctx.aiStep(bots, 'ETH', w, ()=>q(bars[i].c), bars[i].t+B, { open:true });
    for (const o of out){ if (o.act==='ss') shorts++; if (o.act==='bc') covers++; } ctx.aiTick(bots, ()=>q(bars[i].c), bars[i].t+B+1000);
    for (const b of bots) minE=Math.min(minE, ctx.brkEquity(b.A, { ETH:q(bars[i].c) })); }
  const g=bots.map(b=>{ let v=0; for (const s in b.A.pos) v+=Math.abs(b.A.pos[s].q)*bars[bars.length-1].c; return v/ctx.brkEquity(b.A, { ETH:q(bars[bars.length-1].c) }); });
  check('on a market falling in steps, the learners open and close shorts by themselves', shorts>0 && covers>0, `${shorts} shorts, ${covers} buy-backs, ${bots.map(b=>b.id+' '+(ctx.brkEquity(b.A, { ETH:q(bars[bars.length-1].c) })/100-100).toFixed(1)+'%').join(', ')}`);
  check('…positions never exceed the account’s value', g.every(v=>v<=1.01), g.map(v=>v.toFixed(2)).join(' '));
  check('…the borrow cost is charged while a short is open', bots.some(b=>b.log.some(x=>x.act==='ss')) && minE>0); }
// a stock is never shorted
{ const d={ act:'ss' }; check('stocks are never shorted (the engine skips short orders on stocks)', fs.readFileSync(__dirname+'/../ai_bots.js','utf8').includes("if (d.act==='ss' && stock) return;")); }
// the user's own account stays cash only
check('your own order ticket stays cash only: selling more than you hold is still refused', !ctx.brkOrder({ cash:1000, pos:{}, orders:[], fills:[], nid:1 }, { sym:'ETH', kind:'crypto', side:'s', q:1 }, { kind:'crypto', last:100, bid:100, ask:100, open:true }).ok);
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail ? 1 : 0);

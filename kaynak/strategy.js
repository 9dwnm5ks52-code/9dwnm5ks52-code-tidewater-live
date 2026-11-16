/* ---------- Tidewater Live: your own strategy (rules, a backtest, and a live bot) ----------
   A strategy is: one or two entry conditions (all must hold) and any number of exits (the first that holds closes the trade).
   The backtest goes candle by candle over real candles, one position at a time, all-in, paying the fee on the way in and out,
   and compares itself with simply buying and holding over the same candles. */
const ST_IN = { rsi_below:{ a:30 }, rsi_above:{ a:55 }, cross_up:{ a:12, b:26 }, above_ema:{ a:50 }, breakout:{ a:20 }, drop:{ a:3, b:12 } };
const ST_PRESETS = {
  golden:{ in:[{ k:'cross_up', a:12, b:26 }, { k:'above_ema', a:50 }], out:{ cross_down:true, stop:3, take:null, bars:null, rsi_above:null } },
  dip:{ in:[{ k:'rsi_below', a:30 }], out:{ rsi_above:55, stop:3, take:4, bars:72, cross_down:false } },
  breakout:{ in:[{ k:'breakout', a:20 }, { k:'rsi_above', a:55 }], out:{ stop:2, take:5, bars:48, cross_down:false, rsi_above:null } },
};
function stCtx(bars, r){ const c=bars.map(b=>b.c), ins=r.in||[], cu=ins.find(x=>x.k==='cross_up'), ae=ins.find(x=>x.k==='above_ema'), f=cu ? cu.a : 12, s=cu ? cu.b : 26;
  return { c, h:bars.map(b=>b.h), rsi:aiRSI(c, 14), ef:aiEMA(c, f), es:aiEMA(c, s), ea:ae ? aiEMA(c, ae.a) : null }; }
function stEnter(r, X, i){ for (const x of r.in||[]){ let ok=false;
    if (x.k==='rsi_below') ok=X.rsi[i]!=null && X.rsi[i]<x.a; else if (x.k==='rsi_above') ok=X.rsi[i]!=null && X.rsi[i]>x.a;
    else if (x.k==='cross_up') ok=X.ef[i-1]<=X.es[i-1] && X.ef[i]>X.es[i]; else if (x.k==='above_ema') ok=X.c[i]>X.ea[i];
    else if (x.k==='breakout'){ let hi=-Infinity; for (let k=Math.max(0, i-x.a);k<i;k++) hi=Math.max(hi, X.h[k]); ok=X.c[i]>hi; }
    else if (x.k==='drop') ok=i>=x.b && X.c[i]/X.c[i-x.b]-1<=-x.a/100;
    if (!ok) return false; } return (r.in||[]).length>0; }
function stExit(r, X, i, e, held){ const o=r.out||{}; if (o.stop && X.c[i]<=e*(1-o.stop/100)) return 'stop'; if (o.take && X.c[i]>=e*(1+o.take/100)) return 'take';
  if (o.rsi_above && X.rsi[i]>o.rsi_above) return 'rsi'; if (o.cross_down && X.ef[i]<X.es[i]) return 'cross'; if (o.bars && held>=o.bars) return 'time'; return null; }
// the backtest: returns the result, the trades and both value lines
function stTest(r, bars, fee, per){ const X=stCtx(bars, r), n=bars.length, s0=Math.min(60, Math.max(2, n-2)); let cash=1, units=0, e=0, ei=0; const tr=[], eq=[], bh=[];
  for (let i=s0;i<n;i++){ const c=X.c[i];
    if (units){ const why=stExit(r, X, i, e, i-ei); if (why){ cash=units*c*(1-fee); tr.push({ i:ei, j:i, ret:c/e*(1-fee)*(1-fee)-1, why }); units=0; } }
    else if (i<n-1 && stEnter(r, X, i)){ units=cash*(1-fee)/c; cash=0; e=c; ei=i; }
    eq.push({ t:bars[i].t, v:units ? units*c : cash }); bh.push({ t:bars[i].t, v:c/X.c[s0] }); }
  if (units){ tr.push({ i:ei, j:n-1, ret:X.c[n-1]/e*(1-fee)*(1-fee)-1, why:'open' }); }
  const last=eq[eq.length-1], wins=tr.filter(t=>t.ret>0), gw=wins.reduce((a,t)=>a+t.ret,0), gl=-tr.filter(t=>t.ret<=0).reduce((a,t)=>a+t.ret,0);
  let peak=1, dd=0; for (const p of eq){ peak=Math.max(peak, p.v); dd=Math.max(dd, 1-p.v/peak); }
  const lr=eq.slice(1).map((p,k)=>Math.log(p.v/eq[k].v)), m=lr.reduce((a,b)=>a+b,0)/(lr.length||1), sd=Math.sqrt(lr.reduce((a,b)=>a+(b-m)**2,0)/Math.max(1, lr.length-1));
  return { ret:last ? last.v-1 : 0, trades:tr, n:tr.length, win:tr.length ? wins.length/tr.length : null, pf:gl>0 ? gw/gl : (gw>0 ? Infinity : null), dd, sharpe:sd>0 ? m/sd*Math.sqrt(per||105120) : null, eq, bh:bh, bhRet:bh.length ? bh[bh.length-1].v-1 : 0, bars:n-s0 }; }
// the same rules, live, one candle at a time (used by the engine for your bot)
function stDecide(r, bars, pos){ const i=bars.length-1, X=stCtx(bars, r), c=X.c[i];
  if (!pos){ if (stEnter(r, X, i)) return { act:'b', code:'my_buy', vals:{}, stop:(r.out && r.out.stop) ? c*(1-r.out.stop/100) : 0, size:.95 }; return { code:'my_wait', vals:{} }; }
  const held=Math.round((bars[i].t-(pos.bt||bars[i].t))/AI_CFG.BAR), why=stExit(r, X, i, pos.entry, held); if (why) return { act:'s', code:'my_'+why, vals:{} }; return { code:'my_hold', vals:{} }; }

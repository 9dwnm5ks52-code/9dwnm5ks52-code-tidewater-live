/* ---------- Tidewater Live: the paper broker ----------
   Play money only. Fills use the real prices of the moment: the real order book when there is one, otherwise the real bid and ask.
   Cash account: you can sell only what you hold (no shorts, no margin). Fractional quantities are allowed. */
const BRK = {
  START_CASH: 100000,
  FEES: { crypto: .001, stock: 0 },          // crypto: 0.1% a trade, like a large exchange's base fee; US stocks: no commission, like most brokers today
  DEC: { crypto: 6, stock: 4 },              // how finely a quantity can be split
  MIN_ORDER: 1,                              // smallest order, in dollars
};
function brkNew(cash){ return { v:1, cash: cash==null ? BRK.START_CASH : cash, start: cash==null ? BRK.START_CASH : cash, pos:{}, orders:[], fills:[], nid:1, eq:[], created:Date.now() }; }
const brkRound = (q, kind) => { const f=10**BRK.DEC[kind]; return Math.floor(q*f+1e-9)/f; };
// a quote is { kind:'crypto'|'stock', last, bid, ask, book:{bids:[[px,q]],asks:[[px,q]]}, open:true|false }
function brkPrice(q, side){ if (!q || !(q.last>0)) return null; if (side==='b') return q.ask>0 ? q.ask : q.last*1.0005; return q.bid>0 ? q.bid : q.last*.9995; }
// walk the real book for a market order; whatever the visible book cannot fill is filled at the last level seen
function brkWalk(q, side, qty){ const lv=side==='b' ? (q.book && q.book.asks) : (q.book && q.book.bids); const out=[]; let left=qty;
  if (lv && lv.length){ for (const [px, sz] of lv){ if (left<=1e-12) break; const t=Math.min(left, sz); out.push({ px, q:t, book:true }); left-=t; }
    if (left>1e-12) out.push({ px:lv[lv.length-1][0], q:left, book:false }); }
  else out.push({ px:brkPrice(q, side), q:qty, book:false });
  return out; }
function brkHeld(A, sym){ const p=A.pos[sym]; return p ? p.q : 0; }
function brkReserved(A, sym){ const seen=new Set(); let v=0; for (const o of A.orders){ if (o.status!=='open' || o.side!=='s' || o.sym!==sym) continue; if (o.g){ if (seen.has(o.g)) continue; seen.add(o.g); } v+=o.q; } return v; }
function brkCashReserved(A){ return A.orders.filter(o=>o.status==='open' && o.side==='b' && o.type==='lmt').reduce((v,o)=>v+o.q*o.px*(1+BRK.FEES[o.kind]), 0); }
function brkFree(A){ return A.cash-brkCashReserved(A); }
// apply one fill to the account
function brkApply(A, o, parts, now){ const fee=BRK.FEES[o.kind]; let qty=0, val=0; for (const p of parts){ qty+=p.q; val+=p.q*p.px; } if (!(qty>0)) return null;
  const avg=val/qty, cost=val*fee, p=A.pos[o.sym] || (A.pos[o.sym]={ q:0, avg:0, kind:o.kind });
  if (o.side==='b'){ A.cash-=val+cost; p.avg=(p.avg*p.q+val)/(p.q+qty); p.q+=qty; }
  else { const pl=(avg-p.avg)*qty; A.cash+=val-cost; p.q-=qty; o.pl=(o.pl||0)+pl-cost; if (p.q<=1e-9) delete A.pos[o.sym]; }
  const f={ id:A.nid++, oid:o.id, sym:o.sym, kind:o.kind, side:o.side, q:qty, px:avg, fee:cost, t:now||Date.now(), parts, pl:o.side==='s' ? o.pl : null };
  A.fills.push(f); if (A.fills.length>500) A.fills.shift(); o.filled=(o.filled||0)+qty; o.avg=avg; o.status='filled'; o.ft=f.t; return f; }
// place an order; returns { ok, msg, order, fill }
function brkOrder(A, o, q, now){ now=now||Date.now();
  const kind=o.kind==='stock' ? 'stock' : 'crypto'; let qty;
  if (o.usd>0){ const px=brkPrice(q, o.side); if (!px) return { ok:false, msg:'No price yet for '+o.sym+'.' }; qty=o.usd/px; } else qty=+o.q;
  qty=brkRound(qty, kind); if (!(qty>0)) return { ok:false, msg:'Enter an amount above zero.' };
  const type=o.type||'mkt', side=o.side; if (!['b','s'].includes(side) || !['mkt','lmt','stp','trl'].includes(type)) return { ok:false, msg:'Unknown order.' };
  if (type==='trl' && side!=='s') return { ok:false, msg:'A trailing stop protects something you hold, so it sells.' };
  if (type==='trl' && !(o.trail>=.005 && o.trail<=.5)) return { ok:false, msg:'Enter a trail between 0.5% and 50%.' };
  if (!q || !(q.last>0)) return { ok:false, msg:'No price yet for '+o.sym+'.' };
  if ((type==='lmt' || type==='stp') && !(o.px>0)) return { ok:false, msg: type==='lmt' ? 'Enter a limit price.' : 'Enter a stop price.' };
  if (type==='stp' && side==='s' && o.px>=q.last) return { ok:false, msg:'A stop-loss must sit below the current price.' };
  if (type==='stp' && side==='b' && o.px<=q.last) return { ok:false, msg:'A buy stop must sit above the current price.' };
  const ref = type==='mkt' || type==='trl' ? brkPrice(q, side) : o.px;
  if (qty*ref < BRK.MIN_ORDER) return { ok:false, msg:`The smallest order is $${BRK.MIN_ORDER}.` };
  if (side==='s' && qty > brkHeld(A, o.sym)-brkReserved(A, o.sym)+1e-9) return { ok:false, msg:`You hold ${brkRound(brkHeld(A, o.sym)-brkReserved(A, o.sym), kind)} ${o.sym} that is free to sell. This account does not short.` };
  if (side==='b' && qty*ref*(1+BRK.FEES[kind]) > brkFree(A)+1e-6) return { ok:false, msg:'Not enough cash for this order.' };
  if (kind==='stock' && type==='mkt' && !q.open) return { ok:false, msg:'The US market is closed. Use a limit order; it fills when the market opens and the price allows.' };
  const ord={ id:A.nid++, sym:o.sym, kind, side, type, q:qty, px:type==='trl' ? q.last*(1-o.trail) : (o.px||null), status:'open', t:now };
  if (type==='trl'){ ord.trail=o.trail; ord.peak=q.last; }
  A.orders.push(ord); if (A.orders.length>300) A.orders.splice(0, A.orders.length-300);
  if (type==='mkt'){ const f=brkApply(A, ord, brkWalk(q, side, qty), now); return { ok:true, order:ord, fill:f, msg:`${side==='b'?'Bought':'Sold'} ${qty} ${o.sym} at an average of $${f.px.toFixed(f.px<1?6:2)}.` }; }
  const hit=brkCheck(A, ord, q, now); if (hit) return { ok:true, order:ord, fill:hit, msg:`Filled at once: ${side==='b'?'bought':'sold'} ${qty} ${o.sym} at $${hit.px.toFixed(hit.px<1?6:2)}.` };
  if (type==='trl') return { ok:true, order:ord, msg:`Trailing stop placed: sell ${qty} ${o.sym} if it falls ${+(o.trail*100).toFixed(2)}% from its high.` };
  return { ok:true, order:ord, msg: type==='lmt' ? `Limit order placed: ${side==='b'?'buy':'sell'} ${qty} ${o.sym} at $${o.px}.` : `Stop placed: ${side==='b'?'buy':'sell'} ${qty} ${o.sym} if it trades at $${o.px}.` }; }
// does a resting order fill at this quote?
function brkCheck(A, o, q, now){ if (o.status!=='open' || !q || !(q.last>0)) return null; if (o.kind==='stock' && !q.open) return null;
  const bid=q.bid>0 ? q.bid : q.last, ask=q.ask>0 ? q.ask : q.last;
  if (o.type==='lmt'){ if (o.side==='b' && ask<=o.px) return brkApply(A, o, [{ px:Math.min(ask, o.px), q:o.q }], now); if (o.side==='s' && bid>=o.px) return brkApply(A, o, [{ px:Math.max(bid, o.px), q:o.q }], now); return null; }
  if (o.type==='trl'){ if (q.last>o.peak){ o.peak=q.last; o.px=o.peak*(1-o.trail); } }
  if (o.type==='stp' || o.type==='trl'){ const trig = o.side==='s' ? q.last<=o.px : q.last>=o.px; if (!trig) return null;
    if (o.side==='s' && brkHeld(A, o.sym)+1e-9<o.q){ o.status='cancelled'; o.why='not enough held'; return null; }
    if (o.side==='b' && o.q*ask*(1+BRK.FEES[o.kind])>A.cash+1e-6){ o.status='cancelled'; o.why='not enough cash'; return null; }
    o.trig=now||Date.now(); return brkApply(A, o, brkWalk(q, o.side, o.q), now); }
  return null; }
// check every open order against the latest quotes: quotes is sym -> quote
function brkTick(A, quotes, now){ const out=[]; for (const o of A.orders) if (o.status==='open'){ const f=brkCheck(A, o, quotes[o.sym], now); if (f){ out.push(f); if (o.g) brkCancelGroup(A, o.g, 'the other side filled'); } } return out; }
function brkCancelGroup(A, g, why){ for (const x of A.orders) if (x.g===g && x.status==='open'){ x.status='cancelled'; x.why=why; } }
// protect a holding with a take-profit above and a stop-loss below; whichever trades first cancels the other
function brkOCO(A, o, q, now){ now=now||Date.now(); const kind=o.kind==='stock' ? 'stock' : 'crypto', qty=brkRound(+o.q, kind);
  if (!q || !(q.last>0)) return { ok:false, msg:'No price yet for '+o.sym+'.' }; if (!(qty>0)) return { ok:false, msg:'Enter an amount above zero.' };
  if (!(o.tp>q.last) || !(o.sl>0 && o.sl<q.last)) return { ok:false, msg:'The take-profit must be above the current price and the stop below it.' };
  if (qty > brkHeld(A, o.sym)-brkReserved(A, o.sym)+1e-9) return { ok:false, msg:`You hold ${brkRound(brkHeld(A, o.sym)-brkReserved(A, o.sym), kind)} ${o.sym} that is free to sell. This account does not short.` };
  const g='g'+A.nid; const a={ id:A.nid++, sym:o.sym, kind, side:'s', type:'lmt', q:qty, px:o.tp, status:'open', t:now, g }, b={ id:A.nid++, sym:o.sym, kind, side:'s', type:'stp', q:qty, px:o.sl, status:'open', t:now, g };
  A.orders.push(a, b); return { ok:true, orders:[a, b], msg:`Protection placed on ${qty} ${o.sym}: take profit at $${o.tp}, stop at $${o.sl}.` }; }
function brkCancel(A, id){ const o=A.orders.find(x=>x.id===id && x.status==='open'); if (!o) return false; if (o.g) brkCancelGroup(A, o.g, 'by you'); else { o.status='cancelled'; o.why='by you'; } return true; }
function brkEquity(A, quotes){ let v=A.cash; for (const s in A.pos){ const q=quotes[s], p=A.pos[s]; v+=p.q*(q && q.last>0 ? q.last : p.avg); } return v; }
// one equity point a day (UTC), for the sessions calendar and the league
function brkMark(A, quotes, now){ now=now||Date.now(); const d=Math.floor(now/864e5), e=brkEquity(A, quotes), last=A.eq[A.eq.length-1];
  if (last && last.d===d) last.v=e; else { A.eq.push({ d, v:e }); if (A.eq.length>400) A.eq.shift(); } return e; }

// margin for the bots only (your own account stays a cash account): open a short by selling what you do not hold, and buy it back later.
// The sale's money stays in the account as cover; the engine keeps total positions within the account's value and charges a daily borrow cost.
function brkShort(A, o, q, now){ now=now||Date.now(); const kind=o.kind==='stock' ? 'stock' : 'crypto', fee=BRK.FEES[kind], px=brkPrice(q, 's'); if (!px) return { ok:false, msg:'No price yet for '+o.sym+'.' };
  const qty=brkRound(o.usd/px, kind); if (!(qty>0)) return { ok:false, msg:'Enter an amount above zero.' }; const p=A.pos[o.sym]; if (p && p.q>0) return { ok:false, msg:'Close the long first.' };
  const val=qty*px, cost=val*fee, pp=p || (A.pos[o.sym]={ q:0, avg:0, kind }); A.cash+=val-cost; pp.avg=(pp.avg*(-pp.q)+val)/(-pp.q+qty); pp.q-=qty;
  const f={ id:A.nid++, sym:o.sym, kind, side:'s', short:true, q:qty, px, fee:cost, t:now, parts:[{ px, q:qty }], pl:null }; A.fills.push(f); if (A.fills.length>500) A.fills.shift(); return { ok:true, fill:f }; }
function brkCover(A, o, q, now){ now=now||Date.now(); const p=A.pos[o.sym]; if (!p || p.q>=0) return { ok:false, msg:'No short to cover.' }; const fee=BRK.FEES[p.kind], px=brkPrice(q, 'b'); if (!px) return { ok:false, msg:'No price yet for '+o.sym+'.' };
  const qty=Math.min(-p.q, o.q>0 ? o.q : -p.q), val=qty*px, cost=val*fee, pl=(p.avg-px)*qty-cost; A.cash-=val+cost; p.q+=qty; if (p.q>-1e-9) delete A.pos[o.sym];
  const f={ id:A.nid++, sym:o.sym, kind:p.kind, side:'b', cover:true, q:qty, px, fee:cost, t:now, parts:[{ px, q:qty }], pl }; A.fills.push(f); if (A.fills.length>500) A.fills.shift(); return { ok:true, fill:f }; }

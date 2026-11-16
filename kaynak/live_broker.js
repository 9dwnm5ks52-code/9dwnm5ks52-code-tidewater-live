/* ---------- Phoenix Finance Club: the paper broker ----------
   Play money only. Fills use the real prices of the moment: the real order book when there is one, otherwise the real bid and ask.
   One shared account (the club fund). It runs on the server (server/club.js, in GitHub Actions); the browser only shows it.
   Long positions: buy, then sell what you hold. Short positions: "short" sells what you do not hold (from no position),
   a buy on a short position covers it. Fractional quantities are allowed. No margin rules: this is a classroom fund. */
const BRK = {
  START_CASH: 100000,
  FEES: { crypto: .001, stock: 0 },          // crypto: 0.1% a trade, like a large exchange's base fee; US stocks: no commission, like most brokers today
  DEC: { crypto: 6, stock: 4 },              // how finely a quantity can be split
  MIN_ORDER: 1,                              // smallest order, in dollars
  MAX_FILLS: 500, MAX_ORDERS: 300,           // how much history an account keeps (the club fund raises these)
};
function brkNew(cash){ return { v:1, cash: cash==null ? BRK.START_CASH : cash, start: cash==null ? BRK.START_CASH : cash, pos:{}, orders:[], fills:[], nid:1, eq:[], created:Date.now() }; }
const brkRound = (q, kind) => { const f=10**BRK.DEC[kind]; return Math.floor(q*f+1e-9)/f; };
const brkUsd = v => '$'+v.toFixed(v<1 ? 6 : 2);
// a quote is { kind:'crypto'|'stock', last, bid, ask, book:{bids:[[px,q]],asks:[[px,q]]}, open:true|false }
function brkPrice(q, side){ if (!q || !(q.last>0)) return null; if (side==='b') return q.ask>0 ? q.ask : q.last*1.0005; return q.bid>0 ? q.bid : q.last*.9995; }
// walk the real book for a market order; whatever the visible book cannot fill is filled at the last level seen
function brkWalk(q, side, qty){ const lv=side==='b' ? (q.book && q.book.asks) : (q.book && q.book.bids); const out=[]; let left=qty;
  if (lv && lv.length){ for (const [px, sz] of lv){ if (left<=1e-12) break; const t=Math.min(left, sz); out.push({ px, q:t, book:true }); left-=t; }
    if (left>1e-12) out.push({ px:lv[lv.length-1][0], q:left, book:false }); }
  else out.push({ px:brkPrice(q, side), q:qty, book:false });
  return out; }
function brkHeld(A, sym){ const p=A.pos[sym]; return p ? p.q : 0; }
// what open sell orders (not short sales) already promise of a holding
function brkReserved(A, sym){ let v=0; for (const o of A.orders) if (o.status==='open' && o.side==='s' && !o.short && o.sym===sym) v+=o.q; return v; }
function brkCashReserved(A){ return A.orders.filter(o=>o.status==='open' && o.side==='b' && o.type==='lmt').reduce((v,o)=>v+o.q*o.px*(1+BRK.FEES[o.kind]), 0); }
function brkFree(A){ return A.cash-brkCashReserved(A); }
// apply one fill to the account: a buy (or a cover of a short), a sell (or a short sale)
function brkApply(A, o, parts, now){ const fee=BRK.FEES[o.kind]; let qty=0, val=0; for (const p of parts){ qty+=p.q; val+=p.q*p.px; } if (!(qty>0)) return null;
  const avg=val/qty, cost=val*fee, p=A.pos[o.sym] || (A.pos[o.sym]={ q:0, avg:0, kind:o.kind }); let short=false, cover=false;
  if (o.side==='b' && p.q<-1e-12){ cover=true; const pl=(p.avg-avg)*qty-cost; A.cash-=val+cost; p.q+=qty; o.pl=(o.pl||0)+pl; if (Math.abs(p.q)<=1e-9) delete A.pos[o.sym]; }
  else if (o.side==='b'){ A.cash-=val+cost; p.avg=(p.avg*p.q+val)/(p.q+qty); p.q+=qty; }
  else if (p.q<=1e-12){ short=true; A.cash+=val-cost; p.avg=(p.avg*(-p.q)+val)/(-p.q+qty); p.q-=qty; }
  else { const pl=(avg-p.avg)*qty; A.cash+=val-cost; p.q-=qty; o.pl=(o.pl||0)+pl-cost; if (p.q<=1e-9) delete A.pos[o.sym]; }
  const f={ id:A.nid++, oid:o.id, sym:o.sym, kind:o.kind, side:o.side, type:o.type, q:qty, px:avg, fee:cost, t:now||Date.now(), parts, pl:(o.side==='s' && !short) || cover ? o.pl : null };
  if (short) f.short=true; if (cover) f.cover=true; if (o.note) f.note=o.note;
  A.fills.push(f); if (A.fills.length>BRK.MAX_FILLS) A.fills.splice(0, A.fills.length-BRK.MAX_FILLS); o.filled=(o.filled||0)+qty; o.avg=avg; o.status='filled'; o.ft=f.t; return f; }
const brkVerb = (side, short, cover, past) => short ? (past ? 'Sold short' : 'short') : cover ? (past ? 'Covered' : 'cover') : side==='b' ? (past ? 'Bought' : 'buy') : (past ? 'Sold' : 'sell');
// place an order; o = { sym, kind, side:'b'|'s', type:'mkt'|'lmt'|'stp', q or usd, px, short, note }; returns { ok, msg, order, fill }
function brkOrder(A, o, q, now){ now=now||Date.now();
  const kind=o.kind==='stock' ? 'stock' : 'crypto', type=o.type||'mkt', side=o.side; let qty;
  if (!['b','s'].includes(side) || !['mkt','lmt','stp'].includes(type)) return { ok:false, msg:'Unknown order.' };
  if (!q || !(q.last>0)) return { ok:false, msg:'No price yet for '+o.sym+'.' };
  if (o.usd>0) qty=o.usd/(type==='mkt' ? brkPrice(q, side) : (o.px>0 ? o.px : brkPrice(q, side))); else qty=+o.q;
  qty=brkRound(qty, kind); if (!(qty>0)) return { ok:false, msg:'Enter an amount above zero.' };
  if ((type==='lmt' || type==='stp') && !(o.px>0)) return { ok:false, msg: type==='lmt' ? 'Enter a limit price.' : 'Enter a stop price.' };
  if (type==='stp' && side==='s' && o.px>=q.last) return { ok:false, msg:'A sell stop must sit below the current price.' };
  if (type==='stp' && side==='b' && o.px<=q.last) return { ok:false, msg:'A buy stop must sit above the current price.' };
  const ref = type==='mkt' ? brkPrice(q, side) : o.px, held=brkHeld(A, o.sym), short=side==='s' && !!o.short, cover=side==='b' && held<-1e-12;
  if (qty*ref < BRK.MIN_ORDER) return { ok:false, msg:`The smallest order is $${BRK.MIN_ORDER}.` };
  if (short && held>1e-12) return { ok:false, msg:`The fund holds ${o.sym}. Sell the holding first; a short starts from no position.` };
  if (side==='s' && !short && qty > held-brkReserved(A, o.sym)+1e-9) return { ok:false, msg:`The fund holds ${brkRound(Math.max(0, held-brkReserved(A, o.sym)), kind)} ${o.sym} that is free to sell. To sell what it does not hold, use Short.` };
  if (cover && qty > -held+1e-9) return { ok:false, msg:`The fund is short ${brkRound(-held, kind)} ${o.sym}. Buy at most that much to cover.` };
  if (side==='b' && qty*ref*(1+BRK.FEES[kind]) > brkFree(A)+1e-6) return { ok:false, msg:'Not enough cash for this order.' };
  if (kind==='stock' && type==='mkt' && !q.open) return { ok:false, msg:'The US market is closed. Use a limit order; it fills when the market opens and the price allows.' };
  const ord={ id:A.nid++, sym:o.sym, kind, side, type, q:qty, px:o.px>0 && type!=='mkt' ? o.px : null, status:'open', t:now };
  if (short) ord.short=true; if (cover) ord.cover=true; if (o.note) ord.note=String(o.note);
  A.orders.push(ord); if (A.orders.length>BRK.MAX_ORDERS) A.orders.splice(0, A.orders.length-BRK.MAX_ORDERS);
  const v=brkVerb(side, short, cover, true);
  if (type==='mkt'){ const f=brkApply(A, ord, brkWalk(q, side, qty), now); return { ok:true, order:ord, fill:f, msg:`${v} ${qty} ${o.sym} at an average of ${brkUsd(f.px)}.` }; }
  const hit=brkCheck(A, ord, q, now); if (hit) return { ok:true, order:ord, fill:hit, msg:`Filled at once: ${v.toLowerCase()} ${qty} ${o.sym} at ${brkUsd(hit.px)}.` };
  const w=brkVerb(side, short, cover, false);
  return { ok:true, order:ord, msg: type==='lmt' ? `Limit order placed: ${w} ${qty} ${o.sym} at $${o.px}.` : `Stop placed: ${w} ${qty} ${o.sym} if it trades at $${o.px}.` }; }
// does a resting order fill at this quote?
function brkCheck(A, o, q, now){ if (o.status!=='open' || !q || !(q.last>0)) return null; if (o.kind==='stock' && !q.open) return null;
  const bid=q.bid>0 ? q.bid : q.last, ask=q.ask>0 ? q.ask : q.last, held=brkHeld(A, o.sym);
  const trig = o.type==='lmt' ? (o.side==='b' ? ask<=o.px : bid>=o.px) : o.type==='stp' ? (o.side==='s' ? q.last<=o.px : q.last>=o.px) : false; if (!trig) return null;
  const stop = why => { o.status='cancelled'; o.why=why; return null; };
  if (o.short && held>1e-12) return stop('the fund holds it now');
  if (o.cover){ if (held>=-1e-12) return stop('no short left to cover'); if (o.q>-held) o.q=brkRound(-held, o.kind); }
  if (o.side==='s' && !o.short && held+1e-9<o.q) return stop('not enough held');
  if (o.side==='b' && o.type==='stp' && o.q*ask*(1+BRK.FEES[o.kind])>A.cash+1e-6) return stop('not enough cash');
  if (o.type==='lmt') return brkApply(A, o, [{ px:o.side==='b' ? Math.min(ask, o.px) : Math.max(bid, o.px), q:o.q }], now);
  o.trig=now||Date.now(); return brkApply(A, o, brkWalk(q, o.side, o.q), now); }
// check every open order against the latest quotes: quotes is sym -> quote
function brkTick(A, quotes, now){ const out=[]; for (const o of A.orders) if (o.status==='open'){ const f=brkCheck(A, o, quotes[o.sym], now); if (f) out.push(f); } return out; }
function brkCancel(A, id){ const o=A.orders.find(x=>x.id===id && x.status==='open'); if (!o) return false; o.status='cancelled'; o.why='by a member'; return true; }
// cash plus every position at the latest price (a short counts as a negative holding)
function brkEquity(A, quotes){ let v=A.cash; for (const s in A.pos){ const q=quotes[s], p=A.pos[s]; v+=p.q*(q && q.last>0 ? q.last : p.avg); } return v; }
// the broker's messages in Turkish (the server stores both languages with each order result; the browser uses the same table)
const BRK_VERB_TR={ 'Bought':'alındı', 'Sold':'satıldı', 'Sold short':'açığa satıldı', 'Covered':'geri alındı (açık kapandı)', 'bought':'alındı', 'sold':'satıldı', 'sold short':'açığa satıldı', 'covered':'geri alındı (açık kapandı)' };
const BRK_WORD_TR={ buy:'al', sell:'sat', short:'açığa sat', cover:'geri al (açığı kapat)' };
const BRK_WHY_TR={ 'the fund holds it now':'fon artık bunu tutuyor', 'no short left to cover':'kapatılacak açık kalmadı', 'not enough held':'elde yeterli miktar yok', 'not enough cash':'yeterli nakit yok', 'by a member':'bir üye iptal etti' };
const BRK_TR=[
  [/^(Bought|Sold short|Sold|Covered) (\S+) (\S+) at an average of \$(\S+)\.$/, m=>`${m[3]} ${BRK_VERB_TR[m[1]]}: ${m[2]} adet, ortalama $${m[4]}.`],
  [/^Filled at once: (bought|sold short|sold|covered) (\S+) (\S+) at \$(\S+)\.$/, m=>`Hemen doldu: ${m[3]} ${BRK_VERB_TR[m[1]]}, ${m[2]} adet, $${m[4]}.`],
  [/^Limit order placed: (buy|sell|short|cover) (\S+) (\S+) at \$(\S+)\.$/, m=>`Limit emri verildi: ${m[2]} ${m[3]} ${BRK_WORD_TR[m[1]]}, fiyat $${m[4]}.`],
  [/^Stop placed: (buy|sell|short|cover) (\S+) (\S+) if it trades at \$(\S+)\.$/, m=>`Stop verildi: ${m[3]} $${m[4]} fiyatına gelirse ${m[2]} adet ${BRK_WORD_TR[m[1]]}.`],
  [/^Unknown order\.$/, ()=>'Bilinmeyen emir.'], [/^No price yet for (\S+)\.$/, m=>`${m[1]} için henüz fiyat yok.`], [/^Enter an amount above zero\.$/, ()=>'Sıfırdan büyük bir miktar gir.'],
  [/^Enter a limit price\.$/, ()=>'Bir limit fiyatı gir.'], [/^Enter a stop price\.$/, ()=>'Bir stop fiyatı gir.'],
  [/^A sell stop must sit below the current price\.$/, ()=>'Satış stopu şu anki fiyatın altında olmalı.'], [/^A buy stop must sit above the current price\.$/, ()=>'Alış stopu şu anki fiyatın üstünde olmalı.'],
  [/^The smallest order is \$(\S+)\.$/, m=>`En küçük emir $${m[1]}.`],
  [/^The fund holds (\S+)\. Sell the holding first; a short starts from no position\.$/, m=>`Fon ${m[1]} tutuyor. Önce eldekini sat; açığa satış ancak pozisyon yokken başlar.`],
  [/^The fund holds (\S+) (\S+) that is free to sell\. To sell what it does not hold, use Short\.$/, m=>`Fonun satılabilir ${m[2]} miktarı: ${m[1]}. Elde olmayanı satmak için Açığa sat’ı kullan.`],
  [/^The fund is short (\S+) (\S+)\. Buy at most that much to cover\.$/, m=>`Fon ${m[2]} için ${m[1]} adet açıkta. Kapatmak için en fazla bu kadar al.`],
  [/^Not enough cash for this order\.$/, ()=>'Bu emir için yeterli nakit yok.'],
  [/^The US market is closed\. Use a limit order; it fills when the market opens and the price allows\.$/, ()=>'ABD piyasası kapalı. Limit emri ver; piyasa açılınca ve fiyat uygunsa dolar.'],
];
function brkTr(msg){ const s=String(msg==null ? '' : msg); for (const [re, f] of BRK_TR){ const m=s.match(re); if (m) return f(m); } return s; }

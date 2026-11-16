// Phoenix Finance Club: the paper broker (pure logic, runs in node)
const fs=require('fs'), vm=require('vm');
const ctx={ console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname+'/../live_broker.js','utf8')+';this.BRK=BRK;', ctx);
const F=n=>ctx[n];
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const near=(a,b,e)=>Math.abs(a-b)<=(e||1e-6);
const btc=()=>({ kind:'crypto', last:70000, bid:69990, ask:70010, open:true, book:{ bids:[[69990,.5],[69980,1],[69950,2]], asks:[[70010,.3],[70020,.2],[70100,1]] } });
// market buy walks the real book
let A=F('brkNew')(), r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', q:.6 }, btc());
const want=(.3*70010+.2*70020+.1*70100)/.6;
check('a market buy walks the real order book level by level', r.ok && near(r.fill.px, want) && r.fill.parts.length===3 && near(A.pos.BTC.q,.6), JSON.stringify({ px:r.fill.px, want }));
check('the crypto fee is 0.1% of the value and comes out of cash', near(A.cash, 100000-.6*want*1.001, 1e-6), A.cash.toFixed(2));
// fractional and dollar orders
A=F('brkNew')(); r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', usd:1000 }, btc());
check('a $1,000 order buys a fraction of a coin, rounded down to 6 decimals', r.ok && near(A.pos.BTC.q, Math.floor(1000/70010*1e6)/1e6), A.pos.BTC && A.pos.BTC.q);
// selling what you do not hold
r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'s', q:1 }, btc());
check('a plain sell cannot sell more than the fund holds (shorting is its own order)', !r.ok && /use Short/.test(r.msg), r.msg);
// selling realises profit
const up={ ...btc(), last:77000, bid:76990, ask:77010, book:{ bids:[[76990,5]], asks:[[77010,5]] } };
const held=A.pos.BTC.q; r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'s', q:held }, up);
check('selling everything closes the position and records the profit after fees', r.ok && !A.pos.BTC && r.fill.pl>0 && near(r.fill.pl, (76990-70010)*held-76990*held*.001, 1e-6), r.fill && r.fill.pl.toFixed(4));
// not enough cash
A=F('brkNew')(1000); r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', q:1 }, btc());
check('an order bigger than your cash is refused', !r.ok && /Not enough cash/.test(r.msg), r.msg);
r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', q:.00001 }, btc());
check('an order under $1 is refused', !r.ok && /smallest order/.test(r.msg), r.msg);
// limit orders
A=F('brkNew')(); r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', type:'lmt', q:.1, px:69000 }, btc());
check('a buy limit below the price waits in the order list', r.ok && !r.fill && A.orders[0].status==='open', r.msg);
check('the cash it may need is set aside', near(F('brkFree')(A), 100000-.1*69000*1.001), F('brkFree')(A).toFixed(2));
let fs1=F('brkTick')(A, { BTC:{ kind:'crypto', last:69200, bid:69190, ask:69210 } });
check('it does not fill while the ask stays above the limit', fs1.length===0 && A.orders[0].status==='open');
fs1=F('brkTick')(A, { BTC:{ kind:'crypto', last:68900, bid:68890, ask:68910 } });
check('it fills at the better of the ask and the limit once the price comes down', fs1.length===1 && near(fs1[0].px, 68910) && near(A.pos.BTC.q, .1), fs1[0] && fs1[0].px);
// stop-loss
r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'s', type:'stp', q:.1, px:70000 }, { kind:'crypto', last:68900, bid:68890, ask:68910 });
check('a stop-loss above the price is refused', !r.ok && /sell stop must sit below/.test(r.msg), r.msg);
r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'s', type:'stp', q:.1, px:67000 }, { kind:'crypto', last:68900, bid:68890, ask:68910 });
check('a stop-loss below the price is placed and reserves the coins', r.ok && !r.fill && F('brkReserved')(A, 'BTC')===.1);
const r2=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'s', q:.1 }, { kind:'crypto', last:68900, bid:68890, ask:68910 });
check('coins held for a stop cannot be sold twice', !r2.ok, r2.msg);
fs1=F('brkTick')(A, { BTC:{ kind:'crypto', last:66900, bid:66890, ask:66910, book:{ bids:[[66890,1]], asks:[[66910,1]] } } });
check('the stop triggers when the price falls through it and sells at the real bid', fs1.length===1 && near(fs1[0].px, 66890) && !A.pos.BTC, fs1[0] && fs1[0].px);
// cancel
r=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', type:'lmt', q:.01, px:60000 }, btc()); const id=r.order.id;
check('an open order can be cancelled and its cash is freed', F('brkCancel')(A, id) && A.orders.find(o=>o.id===id).status==='cancelled' && near(F('brkFree')(A), A.cash));
// stocks: market hours and no commission
A=F('brkNew')(); const aapl={ kind:'stock', last:200, bid:199.98, ask:200.02, open:false };
r=F('brkOrder')(A, { sym:'AAPL', kind:'stock', side:'b', q:2 }, aapl);
check('a market order for a US stock is refused while the market is closed', !r.ok && /closed/.test(r.msg), r.msg);
r=F('brkOrder')(A, { sym:'AAPL', kind:'stock', side:'b', type:'lmt', q:2, px:201 }, aapl);
check('a limit order is accepted while closed and waits for the open', r.ok && !r.fill);
fs1=F('brkTick')(A, { AAPL:{ ...aapl, open:true } });
check('it fills at the open at the ask, with no commission', fs1.length===1 && near(fs1[0].px, 200.02) && fs1[0].fee===0 && near(A.cash, 100000-400.04), A.cash.toFixed(2));
r=F('brkOrder')(A, { sym:'AAPL', kind:'stock', side:'b', q:.5 }, { ...aapl, open:true });
check('fractional shares are allowed', r.ok && near(A.pos.AAPL.q, 2.5), A.pos.AAPL.q);
// equity
const e=F('brkEquity')(A, { AAPL:{ last:210 } });
check('equity is cash plus holdings at the latest price', near(e, A.cash+2.5*210), e.toFixed(2));
// short selling: from no position, a sell with short:true; a buy on the short covers it
A=F('brkNew')(); r=F('brkOrder')(A, { sym:'ETH', kind:'crypto', side:'s', short:true, usd:2000, note:'too hot' }, { kind:'crypto', last:100, bid:99.9, ask:100.1 });
check('a short sale opens a negative position at the bid; the proceeds (less the fee) go to cash; the note rides on the fill', r.ok && r.fill.short && near(A.pos.ETH.q, -brkQ(2000/99.9)) && near(A.cash, 100000+brkQ(2000/99.9)*99.9*.999) && r.fill.note==='too hot' && /^Sold short/.test(r.msg), JSON.stringify({ q:A.pos.ETH && A.pos.ETH.q, cash:A.cash, msg:r.msg }));
function brkQ(x){ return Math.floor(x*1e6+1e-9)/1e6; }
const sq=-A.pos.ETH.q, eShort=F('brkEquity')(A, { ETH:{ last:90 } });
check('a short gains when the price falls', eShort>100000+sq*9, eShort.toFixed(2));
check('a second short on a long is refused, and a plain sell of what is not held too', !F('brkOrder')({ ...F('brkNew')(), pos:{ ETH:{ q:1, avg:100, kind:'crypto' } } }, { sym:'ETH', kind:'crypto', side:'s', short:true, q:.5 }, { kind:'crypto', last:100 }).ok && !F('brkOrder')(F('brkNew')(), { sym:'ETH', kind:'crypto', side:'s', q:.5 }, { kind:'crypto', last:100 }).ok);
r=F('brkOrder')(A, { sym:'ETH', kind:'crypto', side:'b', q:sq+1 }, { kind:'crypto', last:90, bid:89.9, ask:90.1 });
check('covering more than the short is refused', !r.ok && /short .* Buy at most/.test(r.msg), r.msg);
r=F('brkOrder')(A, { sym:'ETH', kind:'crypto', side:'b', type:'stp', q:sq, px:95 }, { kind:'crypto', last:90, bid:89.9, ask:90.1 });
check('a buy stop above the price protects the short and waits', r.ok && !r.fill && r.order.cover);
fs1=F('brkTick')(A, { ETH:{ kind:'crypto', last:85, bid:84.9, ask:85.1 } });
check('…it does not trigger while the price stays under it', fs1.length===0);
r=F('brkOrder')(A, { sym:'ETH', kind:'crypto', side:'b', q:sq/2 }, { kind:'crypto', last:85, bid:84.9, ask:85.1 });
check('a market buy covers half the short and books the profit after fees', r.ok && r.fill.cover && near(r.fill.pl, (A.fills[0].px-85.1)*sq/2-85.1*sq/2*.001, 1e-6) && near(A.pos.ETH.q, -sq/2, 1e-6), r.fill && r.fill.pl.toFixed(4));
fs1=F('brkTick')(A, { ETH:{ kind:'crypto', last:96, bid:95.9, ask:96.1 } });
check('…the stop then covers only what is left and closes the position', fs1.length===1 && fs1[0].cover && near(fs1[0].q, sq/2, 1e-6) && !A.pos.ETH, JSON.stringify(fs1[0]&&{ q:fs1[0].q }));
// limit short and caps
A=F('brkNew')(); r=F('brkOrder')(A, { sym:'SOL', kind:'crypto', side:'s', type:'lmt', short:true, q:10, px:110 }, { kind:'crypto', last:100, bid:99.9, ask:100.1 });
check('a limit short above the price waits and reserves nothing of a holding', r.ok && !r.fill && F('brkReserved')(A, 'SOL')===0);
fs1=F('brkTick')(A, { SOL:{ kind:'crypto', last:111, bid:110.5, ask:111.1 } });
check('…and fills as a short once the bid reaches it', fs1.length===1 && fs1[0].short && near(A.pos.SOL.q, -10) && near(fs1[0].px, 110.5));
BRK_CAP: { const B=F('BRK'); B.MAX_FILLS=3; A=F('brkNew')(); for (let k=0;k<5;k++) F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', usd:100 }, btc()); check('the fill history keeps the newest MAX_FILLS', A.fills.length===3 && A.fills[2].id>A.fills[0].id); B.MAX_FILLS=500; }
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);

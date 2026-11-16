// Tidewater Live: the paper broker (pure logic, runs in node)
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
check('you cannot sell more than you hold (no shorts)', !r.ok && /does not short/.test(r.msg), r.msg);
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
check('a stop-loss above the price is refused', !r.ok && /below the current price/.test(r.msg), r.msg);
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
// equity and the daily mark
const e=F('brkEquity')(A, { AAPL:{ last:210 } });
check('equity is cash plus holdings at the latest price', near(e, A.cash+2.5*210), e.toFixed(2));
F('brkMark')(A, { AAPL:{ last:210 } }, Date.UTC(2026,10,12,10)); F('brkMark')(A, { AAPL:{ last:211 } }, Date.UTC(2026,10,12,20)); F('brkMark')(A, { AAPL:{ last:212 } }, Date.UTC(2026,10,13,10));
check('one equity point is kept per day, updated during the day', A.eq.length===2 && near(A.eq[0].v, A.cash+2.5*211), JSON.stringify(A.eq.map(x=>Math.round(x.v))));
// trailing stop: follows the high, sells when the price falls back by the trail
A=F('brkNew')(); F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', q:1 }, btc());
let rt=F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'s', type:'trl', q:1, trail:.05 }, { kind:'crypto', last:70000, bid:69990, ask:70010 });
check('a 5% trailing stop starts 5% under the price and reserves the coin', rt.ok && Math.abs(rt.order.px-66500)<1e-6 && F('brkReserved')(A,'BTC')===1, rt.msg);
F('brkTick')(A, { BTC:{ kind:'crypto', last:80000, bid:79990, ask:80010 } });
check('it moves up with the high (80,000 → stop at 76,000) and never down', Math.abs(rt.order.px-76000)<1e-6 && F('brkTick')(A, { BTC:{ kind:'crypto', last:77000, bid:76990, ask:77010 } }).length===0 && Math.abs(rt.order.px-76000)<1e-6, rt.order.px);
fs1=F('brkTick')(A, { BTC:{ kind:'crypto', last:75900, bid:75890, ask:75910 } });
check('it sells once the price falls 5% from the high, locking in most of the rise', fs1.length===1 && !A.pos.BTC && fs1[0].pl>4000, fs1[0] && fs1[0].pl.toFixed(0));
check('a trailing stop needs a sensible trail and only sells', !F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'s', type:'trl', q:1, trail:.9 }, btc()).ok && !F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', type:'trl', q:1, trail:.05 }, btc()).ok);
// OCO: take-profit and stop-loss on the same coins; one fills, the other is cancelled
A=F('brkNew')(); F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', q:1 }, btc());
r=F('brkOCO')(A, { sym:'BTC', kind:'crypto', q:1, tp:75000, sl:66000 }, btc());
check('a take-profit and a stop-loss guard one coin together (reserved once, not twice)', r.ok && r.orders.length===2 && F('brkReserved')(A,'BTC')===1, r.msg);
check('the take-profit must sit above the price and the stop below', !F('brkOCO')(A, { sym:'BTC', kind:'crypto', q:1, tp:69000, sl:66000 }, btc()).ok);
fs1=F('brkTick')(A, { BTC:{ kind:'crypto', last:75100, bid:75100, ask:75110 } });
check('when the take-profit fills, the stop is cancelled automatically', fs1.length===1 && r.orders[1].status==='cancelled' && r.orders[1].why==='the other side filled' && !A.pos.BTC);
A=F('brkNew')(); F('brkOrder')(A, { sym:'BTC', kind:'crypto', side:'b', q:1 }, btc()); r=F('brkOCO')(A, { sym:'BTC', kind:'crypto', q:1, tp:75000, sl:66000 }, btc());
check('cancelling one side cancels the pair', F('brkCancel')(A, r.orders[0].id) && r.orders.every(o=>o.status==='cancelled'));
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);

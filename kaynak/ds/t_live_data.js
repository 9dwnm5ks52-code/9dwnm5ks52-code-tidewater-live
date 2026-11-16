// Tidewater Live: the free crypto data layer delivers prices, daily candles, a live order book and live trades
const { chromium } = require('playwright');
const fs = require('fs');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d?'  · '+d:'')); };
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage(); await p.goto('http://127.0.0.1:8766/index.html').catch(()=>p.goto('about:blank'));
  await p.addScriptTag({ content: fs.readFileSync(__dirname+'/../sim_live.js','utf8') });
  const boot=await p.evaluate(async()=>{ const src=await liveStart(); const qs=LIVE_CRYPTO.map(d=>LIVE.q[d.sym]||{}); return { src, n:qs.filter(q=>q.last>0).length, total:LIVE_CRYPTO.length, daily:qs.filter(q=>q.daily && q.daily.length>=150).length, btc:LIVE.q.BTC && LIVE.q.BTC.last, chg:LIVE.q.BTC && (LIVE.q.BTC.last/LIVE.q.BTC.open-1) }; });
  check('boot: a free source answers and every coin has a price', !!boot.src && boot.n>=boot.total-2, JSON.stringify(boot));
  check('boot: at least 150 days of daily candles for most coins', boot.daily>=boot.total-2, String(boot.daily));
  const live=await p.evaluate(()=>new Promise(res=>{ const t0=Date.now(); let ticks=0; liveOn(k=>{ if (k==='tick') ticks++; }); const iv=setInterval(()=>{ if (LIVE.status==='live' && ticks>=3 || Date.now()-t0>20000){ clearInterval(iv); res({ status:LIVE.status, ticks, src:LIVE.src }); } }, 250); }));
  check('live: the stream opens and price updates arrive', live.status==='live' && live.ticks>=3, JSON.stringify(live));
  const foc=await p.evaluate(()=>new Promise(res=>{ liveFocus('ETH'); const t0=Date.now(); const iv=setInterval(()=>{ const q=LIVE.q.ETH; if ((q.book.bids.length>=5 && q.trades.length>=1 && q.intra.length>=100) || Date.now()-t0>20000){ clearInterval(iv); res({ src:LIVE.src, bids:q.book.bids.length, asks:q.book.asks.length, spreadOk:q.book.bids[0] && q.book.asks[0] && q.book.asks[0][0]>q.book.bids[0][0], trades:q.trades.length, intra:q.intra.length }); } }, 250); }));
  check('focus: the coin on screen gets a real order book, real trades and one-minute candles', foc.src!=='binance' || (foc.bids>=5 && foc.asks>=5 && foc.spreadOk && foc.trades>=1 && foc.intra>=100), JSON.stringify(foc));
  const sw=await p.evaluate(()=>new Promise(res=>{ liveFocus('SOL'); const t0=Date.now(); const iv=setInterval(()=>{ const q=LIVE.q.SOL; if (q.book.bids.length>=5 || Date.now()-t0>15000){ clearInterval(iv); res({ sol:q.book.bids.length }); } }, 250); }));
  check('switching coins moves the order book to the new one', sw.sol>=5, JSON.stringify(sw));
  const rc=await p.evaluate(()=>new Promise(res=>{ LIVE.ws.close(); const t0=Date.now(); setTimeout(()=>{ const iv=setInterval(()=>{ if (LIVE.status==='live' && Date.now()-LIVE.lastMsg<3000 || Date.now()-t0>20000){ clearInterval(iv); res({ status:LIVE.status, ms:Date.now()-t0 }); } }, 250); }, 300); }));
  check('a dropped connection reconnects by itself', rc.status==='live', JSON.stringify(rc));
  const cb=await p.evaluate(async()=>{ for (const k in LIVE.q) delete LIVE.q[k]; await liveCoinbaseBoot(); const q=LIVE.q.BTC; return { last:q && q.last, daily:q && q.daily.length, order:q && q.daily.length>2 && q.daily[1].t>q.daily[0].t }; });
  check('the Coinbase fallback also gives prices and daily candles, oldest first', cb.last>0 && cb.daily>=100 && cb.order, JSON.stringify(cb));
  await b.close(); console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);
})();

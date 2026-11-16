// Tidewater Live: the whole-US-market layer against the real screener (15 minutes delayed, no key)
const { chromium } = require('playwright');
const fs = require('fs');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d?'  · '+d:'')); };
(async()=>{ const b=await chromium.launch(); const p=await b.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/index.html');
  for (const f of ['sim_live.js','sim_live_us.js','sim_live_tv.js']) await p.addScriptTag({ content:fs.readFileSync(__dirname+'/../'+f,'utf8') });
  const t0=Date.now(); const st=await p.evaluate(async()=>{ MKT.EVERY_WATCH=1500; const s=await mktStart(); const c={ stock:0, etf:0, adr:0 }; for (const d of MKT.list) c[d.type]++; return { s, n:MKT.list.length, c, aapl:MKT.all.AAPL, spy:MKT.all.SPY, btcus:MKT.all['BTC.US'] && MKT.all['BTC.US'].name, btc:!!MKT.all.BTC }; });
  check('one call lists the whole US market: thousands of stocks, ETFs and ADRs', st.n>8000 && st.c.stock>4000 && st.c.etf>3000 && st.c.adr>50 && ['live','closed'].includes(st.s), JSON.stringify({ s:st.s, n:st.n, c:st.c, ms:Date.now()-t0 }));
  const a=st.aapl; check('each record has price, change, the day range, volume, size and sector', a && a.last>0 && a.prev>0 && Math.abs(a.chg-(a.last/a.prev-1))<1e-3 && a.high>=a.low && a.vol>0 && a.cap>1e11 && a.sector && a.type==='stock' && a.tv==='NASDAQ:AAPL', JSON.stringify({ last:a.last, prev:a.prev, chg:a.chg, cap:a.cap, sector:a.sector }));
  check('ETFs are marked as ETFs', st.spy && st.spy.type==='etf' && st.spy.last>0, st.spy && st.spy.name);
  check('a US ticker that a coin already uses gets a .US suffix, so the two never mix', st.btcus && !st.btc, st.btcus);
  const f=await p.evaluate(()=>({ a:mktFind('aapl',5).map(d=>d.sym), n:mktFind('nvidia',3).map(d=>d.sym), brk:mktFind('BRK',3).map(d=>d.sym) }));
  check('search finds by ticker or name, exact ticker first', f.a[0]==='AAPL' && f.n.includes('NVDA') && f.brk.some(s=>/^BRK\./.test(s)), JSON.stringify(f));
  const w=await p.evaluate(async()=>{ mktSetWatch(['AAPL','MSFT','BRK.B','NOPE']); const n=await mktLoadWatch(); return { n, watch:MKT.watch.length, tw:MKT.tw>0 }; });
  check('the small refresh updates only the watched symbols, ignoring unknown ones', w.n===3 && w.watch===3 && w.tw, JSON.stringify(w));
  await b.close(); check('no script errors', errs.length===0, errs.join(' | ')); console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0); })();

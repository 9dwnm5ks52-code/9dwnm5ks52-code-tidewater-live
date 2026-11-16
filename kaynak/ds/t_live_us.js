// Tidewater Live: the US stock layer against stand-ins for Alpaca's and Finnhub's documented free-plan answers (no real keys)
const { chromium } = require('playwright');
const fs = require('fs');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d?'  · '+d:'')); };
const ID='AKTEST', SEC='secret123', FH='fh-test';
const CORS={ 'access-control-allow-origin':'*' };
const day=i=>new Date(Date.UTC(2026,5,1)+i*864e5).toISOString();
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage(); const seen={ ap:[], fh:[], subs:null, pages:0, auth:null };
  await p.route('https://data.alpaca.markets/**', async r=>{ const u=new URL(r.request().url()), h=r.request().headers(); seen.ap.push(u.pathname);
    if (h['apca-api-key-id']!==ID || h['apca-api-secret-key']!==SEC) return r.fulfill({ status:401, headers:CORS, body:'unauthorized' });
    let body;
    if (u.pathname==='/v2/stocks/snapshots'){ body={}; for (const s of u.searchParams.get('symbols').split(',')) body[s]={ latestTrade:{ p:100+s.length, t:'2026-11-12T15:00:00Z', s:10 }, latestQuote:{ bp:99.9+s.length, ap:100.1+s.length }, dailyBar:{ o:99, h:105, l:98, c:100+s.length }, prevDailyBar:{ c:98+s.length } }; }
    else if (u.pathname==='/v2/stocks/bars'){ const syms=u.searchParams.get('symbols').split(','), tok=u.searchParams.get('page_token'); seen.pages++; const half=tok ? 1 : 0; body={ bars:{}, next_page_token: tok ? null : 'p2' };
      for (const s of syms) body.bars[s]=Array.from({ length:100 }, (_,i)=>({ t:day(i+half*100), o:100, h:101, l:99, c:100+i/10, v:1000 })); }
    else if (/\/v2\/stocks\/[A-Z]+\/bars/.test(u.pathname)) body={ bars:Array.from({ length:390 }, (_,i)=>({ t:new Date(Date.UTC(2026,10,12,14,30)+i*60000).toISOString(), o:1, h:1, l:1, c:1, v:1 })) };
    else if (u.pathname==='/v1beta1/news') body={ news:[{ headline:'Apple ships a thing', summary:'s', source:'benzinga', url:'https://n/1', created_at:'2026-11-12T12:00:00Z' }] };
    else body={};
    r.fulfill({ status:200, contentType:'application/json', headers:CORS, body:JSON.stringify(body) }); });
  await p.route('https://finnhub.io/api/v1/**', async r=>{ const u=new URL(r.request().url()), k=r.request().headers()['x-finnhub-token']; seen.fh.push(u.pathname);
    if (k!==FH) return r.fulfill({ status:401, headers:CORS, body:'{"error":"Invalid API key"}' });
    const s=u.searchParams.get('symbol'); r.fulfill({ status:200, contentType:'application/json', headers:CORS, body:JSON.stringify(u.pathname.endsWith('/quote') ? { c:50+s.length, pc:49+s.length, o:49, h:52, l:48, t:1794500000 } : []) }); });
  await p.routeWebSocket(/wss:\/\/stream\.data\.alpaca\.markets.*/, ws=>{ ws.send(JSON.stringify([{ T:'success', msg:'connected' }]));
    ws.onMessage(m=>{ const x=JSON.parse(m); if (x.action==='auth'){ seen.auth=x; if (x.key===ID && x.secret===SEC) ws.send(JSON.stringify([{ T:'success', msg:'authenticated' }])); else ws.send(JSON.stringify([{ T:'error', code:402, msg:'auth failed' }])); }
      if (x.action==='subscribe'){ seen.subs=x; setTimeout(()=>ws.send(JSON.stringify([{ T:'t', S:'AAPL', p:201.25, s:10, t:new Date().toISOString() },{ T:'q', S:'AAPL', bp:201.2, ap:201.3 },{ T:'t', S:'ZZZ', p:1, s:1, t:new Date().toISOString() }])), 50); } }); });
  await p.routeWebSocket(/wss:\/\/ws\.finnhub\.io.*/, ws=>{ ws.onMessage(()=>{}); });
  await p.goto('http://127.0.0.1:8766/index.html'); await p.evaluate(()=>localStorage.clear());
  await p.addScriptTag({ content: fs.readFileSync(__dirname+'/../sim_live_us.js','utf8') });
  const nk=await p.evaluate(async()=>({ src:await usStart(), status:US.status }));
  check('without keys nothing is called and the status says so', nk.src===null && nk.status==='nokey' && !seen.ap.length && !seen.fh.length, JSON.stringify(nk));
  const bad=await p.evaluate(async()=>{ usSaveKeys({ apId:'AKTEST', apSecret:'nope' }); return { src:await usStart(), status:US.status }; });
  check('wrong Alpaca keys are reported as refused', bad.src===null && bad.status==='badkey', JSON.stringify(bad));
  const ok=await p.evaluate(async()=>{ usSaveKeys({ apSecret:'secret123' }); const src=await usStart(); const q=US.q.AAPL; return { src, n:LIVE_US.filter(d=>US.q[d.sym] && US.q[d.sym].last>0).length, last:q.last, prev:q.prev, bid:q.bid, ask:q.ask, chg:q.chg, daily:q.daily.length, sorted:q.daily.every((x,i,a)=>!i || x.t>a[i-1].t) }; });
  check('with good keys one snapshot call prices all 14 stocks, with bid, ask and the change from yesterday', ok.src==='alpaca' && ok.n===14 && ok.prev>0 && ok.bid<ok.ask && Math.abs(ok.chg-(ok.last/ok.prev-1))<1e-9 && seen.ap.filter(x=>x==='/v2/stocks/snapshots').length>=1, JSON.stringify(ok));
  check('daily bars follow the next-page token, stay in order and are capped at 200', ok.daily===200 && ok.sorted && seen.pages>=2, JSON.stringify({ daily:ok.daily, pages:seen.pages }));
  const st=await p.evaluate(()=>new Promise(res=>{ const t0=Date.now(); const iv=setInterval(()=>{ const q=US.q.AAPL; if (q.trades.length || Date.now()-t0>5000){ clearInterval(iv); res({ status:US.status, last:q.last, bid:q.bid, ask:q.ask, n:q.trades.length, zzz:!!US.q.ZZZ }); } }, 50); }));
  check('the live stream signs in with both keys, subscribes to 14 stocks (under the free 30), and trades and quotes move the price', seen.auth && seen.auth.key==='AKTEST' && seen.subs && seen.subs.trades.length===14 && st.last===201.25 && st.bid===201.2 && st.ask===201.3 && st.n===1 && !st.zzz, JSON.stringify(st));
  const mn=await p.evaluate(async()=>{ await usIntra('MSFT'); const n=await usNews('AAPL'); return { intra:US.q.MSFT.intra.length, news:n.length, head:n[0] && n[0].head, t:n[0] && n[0].t }; });
  check('minute bars and company news come from Alpaca', mn.intra===390 && mn.news===1 && mn.head && mn.t===Date.parse('2026-11-12T12:00:00Z'), JSON.stringify(mn));
  const fb=await p.evaluate(async()=>{ usStop(); usSaveKeys({ apId:'', apSecret:'', fh:'fh-test' }); const src=await usStart(); return { src, n:LIVE_US.filter(d=>US.q[d.sym] && US.q[d.sym].prev===49+d.sym.length).length }; });
  check('with only a Finnhub key the backup source is used', fb.src==='finnhub' && fb.n===14, JSON.stringify(fb));
  const ab=await p.evaluate(async()=>{ usStop(); usSaveKeys({ apId:'AKTEST', apSecret:'wrong', fh:'fh-test' }); return { src:await usStart() }; });
  check('if the Alpaca keys fail but a Finnhub key is there, it falls back to Finnhub', ab.src==='finnhub', JSON.stringify(ab));
  const mh=await p.evaluate(()=>({ sat:usMarketOpen(new Date('2026-11-14T15:00:00Z')), wd:usMarketOpen(new Date('2026-11-12T15:00:00Z')), night:usMarketOpen(new Date('2026-11-12T23:00:00Z')) }));
  check('New York market hours are worked out correctly', !mh.sat && mh.wd && !mh.night, JSON.stringify(mh));
  await b.close(); console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);
})();

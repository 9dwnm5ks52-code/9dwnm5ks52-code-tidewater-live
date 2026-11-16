// Tidewater Live: the whole site. Crypto from the real public feeds; US stocks from stand-ins for Alpaca's free-plan answers (no real keys)
const { chromium } = require('playwright');
const fs = require('fs');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d?'  · '+d:'')); };
const ID='AKTEST', SEC='secret123';
const CORS={ 'access-control-allow-origin':'*' };
const URL0='http://127.0.0.1:8766/live.html';
const OUT=process.argv[2]||'.';
async function mocks(p, seen){
  await p.route('https://data.alpaca.markets/**', async r=>{ const u=new URL(r.request().url()), h=r.request().headers(); seen.ap++;
    if (h['apca-api-key-id']!==ID || h['apca-api-secret-key']!==SEC) return r.fulfill({ status:401, headers:CORS, body:'unauthorized' });
    let body={};
    if (u.pathname==='/v2/stocks/snapshots'){ for (const s of u.searchParams.get('symbols').split(',')) body[s]={ latestTrade:{ p:200, t:new Date().toISOString(), s:10 }, latestQuote:{ bp:199.98, ap:200.02 }, dailyBar:{ o:198, h:202, l:197, c:200 }, prevDailyBar:{ c:196 } }; }
    else if (u.pathname==='/v2/stocks/bars'){ const syms=u.searchParams.get('symbols').split(','); body={ bars:{}, next_page_token:null }; for (const s of syms) body.bars[s]=Array.from({ length:60 }, (_,i)=>({ t:new Date(Date.UTC(2026,7,1)+i*864e5).toISOString(), o:190+i/6, h:192+i/6, l:189+i/6, c:191+i/6, v:1e6 })); }
    else if (/\/v2\/stocks\/[A-Z]+\/bars/.test(u.pathname)) body={ bars:Array.from({ length:120 }, (_,i)=>({ t:new Date(Date.now()-(120-i)*60000).toISOString(), o:199+Math.sin(i/9), h:200.5+Math.sin(i/9), l:198.5+Math.sin(i/9), c:199.4+Math.sin(i/8), v:1e4 })) };
    else if (u.pathname==='/v1beta1/news') body={ news:[] };
    r.fulfill({ status:200, contentType:'application/json', headers:CORS, body:JSON.stringify(body) }); });
  await p.routeWebSocket(/wss:\/\/stream\.data\.alpaca\.markets.*/, ws=>{ ws.send(JSON.stringify([{ T:'success', msg:'connected' }]));
    ws.onMessage(m=>{ const x=JSON.parse(m); if (x.action==='auth') ws.send(JSON.stringify(x.key===ID && x.secret===SEC ? [{ T:'success', msg:'authenticated' }] : [{ T:'error', code:402, msg:'auth failed' }])); }); });
  await p.route('https://api.rss2json.com/**', r=>{ const u=decodeURIComponent(new URL(r.request().url()).searchParams.get('rss_url')||''), sec=/sec\.gov/.test(u), tk=(u.match(/[?&](?:s|CIK)=([A-Z.\-]+)/)||[])[1]||'';
    const items=Array.from({ length:10 }, (_,i)=>({ title:sec ? (i%2 ? '10-Q  - Quarterly report' : '8-K  - Current report') : `Test headline ${i+1} for ${tk||u.split('/')[2]}`, link:`https://example.com/${tk||'x'}/${i}`, pubDate:new Date(Date.now()-i*3.6e6).toISOString().replace('T',' ').slice(0,19), description:'A short summary.' }));
    r.fulfill({ status:200, contentType:'application/json', headers:CORS, body:JSON.stringify({ status:'ok', items }) }); });
  p.on('request', r=>{ const u=r.url(), hs=JSON.stringify(r.headers()); if (!u.startsWith('https://data.alpaca.markets') && (u.includes(SEC) || hs.includes(SEC))) seen.leak.push(u); });
}
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({ viewport:{ width:1400, height:1000 }, colorScheme:'dark' }); const p=await ctx.newPage();
  const errs=[], seen={ ap:0, leak:[] }; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if (m.type()==='error' && !/Failed to load resource/.test(m.text())) console.log('CONSOLE', m.text().slice(0,400)); }); await mocks(p, seen);
  await p.goto(URL0); await p.evaluate(()=>localStorage.clear()); await p.reload();
  await p.waitForTimeout(600); const wc0=await p.evaluate(()=>({ hash:location.hash, hero:!!$('.wc-h'), cards:$$('.wc-card').length }));
  check('a first visit opens the welcome page (what the site is, the evidence, where to start)', wc0.hash==='#welcome' && wc0.hero && wc0.cards===8, JSON.stringify(wc0)); await p.evaluate(()=>location.hash='#board');
  await p.waitForFunction(()=>LIVE.status==='live' && LIVE_CRYPTO.every(d=>LIVE.q[d.sym] && LIVE.q[d.sym].last>0) && MKT.list.length>5000 && CX.list.length>20 && AI.status==='live', null, { timeout:45000 }); await p.waitForTimeout(800);
  const boot=await p.evaluate(()=>({ tiles:$$('#bd .bd-t').length, map:$$('#b-map [data-sym]').length, priced:$$('#b-map [data-sym]').filter(b=>/\$/.test(b.textContent)).length, us:US.status, eq:$('#lv-nw').textContent, apCalls:0 }));
  check('the board opens with live crypto prices and delayed US prices, with no key and no call to Alpaca', boot.tiles===11 && boot.map===26 && boot.priced===26 && boot.us==='nokey' && boot.eq==='$100,000.00' && seen.ap===0, JSON.stringify(boot));
  // quick trade
  await p.click('#b-map [data-sym="ETH"]'); await p.click('#q-amt [data-qa="1000"]'); await p.click('#t-quick [data-q="b"]'); await p.waitForTimeout(400);
  const qb=await p.evaluate(()=>({ pos:ST.A.pos.ETH, cash:ST.A.cash, inbox:ST.inbox.length, oj:!!$('#q-oj .oj'), msg:$('#q-msg').textContent, toast:!$('#toast').hidden }));
  check('Quick trade buys $1,000 of Ethereum at the real price, with the 0.1% fee', qb.pos && qb.pos.q>0 && Math.abs(100000-qb.cash-1000*1.001)<1.5 && qb.inbox>=1 && qb.oj && /Bought/.test(qb.msg) && qb.toast, JSON.stringify(qb));
  await p.click('#t-quick [data-q="s"]'); await p.waitForTimeout(400);
  const qs=await p.evaluate(()=>({ pos:ST.A.pos.ETH||null, fills:ST.A.fills.length, cash:ST.A.cash }));
  check('Sell sells it back; the round trip costs only the spread and two fees', !qs.pos && qs.fills===2 && 100000-qs.cash>0 && 100000-qs.cash<5, JSON.stringify(qs));
  // trade screen: limit, cancel, stop rules
  await p.click('.lv-nav a[data-nav="trade"]'); await p.selectOption('#tr-sym', 'BTC'); await p.waitForTimeout(2500);
  const tv=await p.evaluate(()=>({ chart:!!$('#tr-chart svg.chart'), candles:$$('#tr-chart rect').length, book:$$('#tr-book .book tr.ask').length, pxHidden:getComputedStyle($('#tk-pxw')).display==='none' }));
  check('the trade screen shows minute candles and the live Binance order book; the price field hides for market orders', tv.chart && tv.candles>10 && tv.book===8 && tv.pxHidden, JSON.stringify(tv));
  await p.click('#tk-type [data-type="lmt"]'); const lpx=await p.inputValue('#tk-px'); await p.fill('#tk-amt', '500'); await p.click('#tk-go'); await p.waitForTimeout(300);
  const lo=await p.evaluate(()=>({ open:ST.A.orders.filter(o=>o.status==='open').length, rows:$$('#tr-ord [data-cancel]').length, msg:$('#tk-msg').textContent }));
  check('a buy limit 1% under the price is placed and listed under open orders', lo.open===1 && lo.rows===1 && /Limit order placed/.test(lo.msg) && +lpx>0, JSON.stringify({ ...lo, lpx }));
  await p.click('#tr-ord [data-cancel]'); await p.waitForTimeout(200);
  check('Cancel removes it and frees the cash', await p.evaluate(()=>!ST.A.orders.some(o=>o.status==='open') && brkFree(ST.A)===ST.A.cash));
  await p.click('#tk-side [data-side="s"]'); await p.click('#tk-type [data-type="stp"]'); await p.click('#tk-go'); await p.waitForTimeout(200);
  check('selling what you do not hold is refused with a plain message', /does not short/.test(await p.textContent('#tk-msg')), await p.textContent('#tk-msg'));
  // persistence
  await p.click('#tk-side [data-side="b"]'); await p.click('#tk-type [data-type="mkt"]'); await p.fill('#tk-amt', '2000'); await p.click('#tk-go'); await p.waitForTimeout(800);
  const before=await p.evaluate(()=>ST.A.pos.BTC && ST.A.pos.BTC.q); await p.reload(); await p.waitForFunction(()=>LIVE.status==='live', null, { timeout:20000 });
  const after=await p.evaluate(()=>({ q:ST.A.pos.BTC && ST.A.pos.BTC.q, fills:ST.A.fills.length, view:location.hash }));
  check('your money, holdings and history survive a reload', before>0 && after.q===before && after.fills>=3, JSON.stringify({ before, ...after }));
  await p.click('.lv-nav a[data-nav="portfolio"]'); await p.waitForTimeout(300);
  const pf=await p.evaluate(()=>({ rows:$$('#pf-pos tbody tr').length, fills:$$('#pf-fills tbody tr').length }));
  check('the portfolio lists the holding and the three trades', pf.rows>=1 && pf.fills>=3, JSON.stringify(pf));
  // bots
  const bots=await p.evaluate(()=>ST.bots.map(x=>({ id:x.id, n:Object.keys(x.A.pos).length, cash:Math.round(x.A.cash) })));
  check('the four bots have bought their coins with real prices', bots.length===4 && bots.every(x=>x.n>=2 && x.cash<1000), JSON.stringify(bots));
  // the Crypto screen and the bots
  await p.click('.lv-nav a[data-nav="crypto"]'); await p.waitForTimeout(500);
  const cx=await p.evaluate(()=>({ coins:$$('#cx-tbl tbody tr').length, first:$('#cx-tbl tbody tr a').textContent, tiles:$$('#cx-top .bd-t').length, fng:CX.fng.length, glob:!!(CX.glob && CX.glob.cap), mini:$$('#ai-mini tbody tr').length, stable:CX.list.some(d=>/^(USDT|USDC|DAI|USDE)$/.test(d.sym)) }));
  check('Crypto shows the top coins live (no stablecoins), the market mood and the five best bots', cx.coins>=40 && cx.first==='BTC' && cx.tiles===4 && cx.fng>=7 && cx.glob && cx.mini===5 && !cx.stable, JSON.stringify(cx));
  await p.waitForFunction(()=>AI.derReady && AI_PROB.every(id=>ST.ai.find(b=>b.id===id).model.n>0), null, { timeout:60000 }).catch(()=>{});   // hourly candles and futures data arrive in the background
  const ml=await p.evaluate(()=>AI_PROB.map(id=>{ const M=ST.ai.find(b=>b.id===id).model; return { id, n:M.n, acc:aiAcc(M), seen:Object.keys(M.seen).length }; }));
  check('the three forecasters (Pattern Matcher, Bayesian Classifier, Random Forest) have learned from real hourly candles of all 6 coins and score their own guesses', ml.length===3 && ml.every(x=>x.n>1500 && x.acc!=null && x.acc>.3 && x.acc<.9 && x.seen===6), JSON.stringify(ml));
  await p.click('[data-cxs="up"]'); await p.waitForTimeout(200);
  const ups=await p.evaluate(()=>{ const r=cxRows({}).filter(d=>d.c24!=null); return r.slice(0,20).every((d,i,a)=>!i || a[i-1].c24>=d.c24); }); check('coins sort by today’s rise', ups);
  await p.click('[data-cxs="rank"]'); const extra=await p.evaluate(()=>CX.list.find(d=>!d.core && LIVE.q[d.sym] && LIVE.q[d.sym].last>0).sym);
  await p.click(`#cx-tbl a[data-go="${extra}"]`); await p.waitForTimeout(2500);
  await p.evaluate(()=>{ $('#tk-amt').value='500'; }); await p.click('#tk-side [data-side="b"]'); await p.click('#tk-type [data-type="mkt"]'); await p.click('#tk-go'); await p.waitForTimeout(300);
  const xb=await p.evaluate(s=>({ sel:ST.sel, pos:ST.A.pos[s], kind:IM[s] && IM[s].kind, chart:!!$('#tr-chart svg.chart'), book:$$('#tr-book tr').length }), extra);
  check(`a coin outside the main twelve (${extra}) opens with its chart and live book, and can be bought`, xb.sel===extra && xb.pos && xb.pos.kind==='crypto' && xb.kind==='crypto' && xb.chart && xb.book>=3, JSON.stringify(xb));
  // the Bots screen: the roster, a leaderboard, and cards whose details stay open while prices move
  await p.click('.lv-nav a[data-nav="bots"]'); await p.waitForTimeout(600);
  const bs=await p.evaluate(()=>({ n:AI_DEFS.length, ids:ST.ai.map(b=>b.id).join(), cards:$$('#bots-cards .ai-card').length, lb:$$('#bots-lb tbody tr').length, think:ST.ai.filter(b=>Object.keys(b.think).length).length, metrics:$$('#bots-cards .ai-st').length, intro:$('#bots .bd-sub').textContent.slice(0, 40) }));
  check('the Bots screen shows all 6 bots of the roster, ranked, each with what it has learned, and all of them already thinking', bs.n===6 && bs.ids==='knn,nb,forest,q,rank,sector' && bs.cards===bs.n && bs.lb===bs.n && bs.think>=bs.n-1 && bs.metrics===3*bs.n && /^6 bots/.test(bs.intro), JSON.stringify(bs));
  await p.click('#bot-knn details summary'); await p.waitForTimeout(1500);
  check('a bot’s “how it works” panel stays open while the screen updates', await p.evaluate(()=>$('#bot-knn details').open && $$('#bot-knn .ai-think li').length===14));
  const lrn=await p.evaluate(()=>ST.ai.filter(b=>AI_PROB.includes(b.id)).map(b=>({ id:b.id, n:b.model.n, acc:aiAcc(b.model) })));
  check('the learners score themselves walk-forward', lrn.length===3 && lrn.every(x=>x.n>1500 && x.acc!=null && x.acc>.3 && x.acc<.8), JSON.stringify(lrn));
  const ql=await p.evaluate(()=>{ const M=ST.ai.find(b=>b.id==='q').model; return { n:M.n, vis:M.vis.filter(v=>v>0).length }; });
  check('the Q-Learning Agent has learned from real candles and has seen many of its 60 situations', ql.n>1500 && ql.vis>=10, JSON.stringify(ql));
  await p.evaluate(()=>{ const b=ST.ai.find(x=>x.id==='knn'); b.on=false; save(); render(); }); await p.waitForTimeout(300);
  check('a bot can be paused from its card', await p.evaluate(()=>/Resume/.test($('[data-ai-on="knn"]').textContent) && $('.ai-card.off')!==null));
  await p.click('[data-ai-on="knn"]'); await p.waitForTimeout(100); check('…and resumed', await p.evaluate(()=>ST.ai.find(x=>x.id==='knn').on===true));
  await p.click('.lv-nav a[data-nav="board"]'); await p.waitForTimeout(300);
  check('the league shows the top 8 of you and the bots (and you, wherever you are)', await p.evaluate(()=>{ const n=$$('#b-lg li').length; return (n===8 || n===9) && !!$('#b-lg li.me'); }));
  // News: market headlines read directly from Dow Jones, the rest through rss2json (here a stand-in), the earnings calendar from the screener
  await p.waitForFunction(()=>$$('#b-earn .nw li').length>=3 && $$('#b-news .nw li').length===5, null, { timeout:30000 }).catch(()=>{});
  const bn=await p.evaluate(()=>({ news:$$('#b-news .nw li').length, earn:$$('#b-earn .nw li').length }));
  await p.click('.lv-nav a[data-nav="news"]'); await p.waitForFunction(()=>$$('#nw-body .nw li').length>=10, null, { timeout:30000 }).catch(()=>{});
  const nt=await p.evaluate(()=>({ n:$$('#nw-body .nw li').length, src:[...new Set($$('#nw-body .nw-m').map(x=>x.textContent.split(' · ')[0]))], ext:$$('#nw-body .nw a').every(a=>a.target==='_blank' && /noopener/.test(a.rel)) }));
  check('News: top market headlines come straight from MarketWatch and the WSJ and open in a new tab', nt.n>=10 && nt.src.some(x=>/MarketWatch|WSJ/.test(x)) && nt.ext, JSON.stringify(nt));
  await p.click('[data-nt="crypto"]'); await p.waitForFunction(()=>/Cointelegraph|Decrypt/.test($('#nw-body').textContent) && $$('#nw-body .nw li').length>=10, null, { timeout:20000 }).catch(()=>{});
  check('…crypto news (Cointelegraph and Decrypt)', await p.evaluate(()=>$$('#nw-body .nw li').length>=10 && /Cointelegraph|Decrypt/.test($('#nw-body').textContent)));
  await p.click('[data-nt="earn"]'); await p.waitForFunction(()=>$$('#nw-body tbody tr').length>20, null, { timeout:30000 }).catch(()=>{});
  const er=await p.evaluate(()=>({ up:EARN.up.length, done:EARN.done.length, rows:$$('#nw-body tbody tr').length, sorted:EARN.up.every((r,i,a)=>!i || a[i-1].next<=r.next), surp:EARN.done.filter(r=>r.surp!=null).length }));
  check('…the earnings calendar: coming reports in date order with estimates, and fresh results with their surprise', er.up>20 && er.done>20 && er.rows>40 && er.sorted && er.surp>10, JSON.stringify(er));
  await p.click('[data-nt="filings"]'); await p.waitForFunction(()=>$$('#nw-body .nw li').length>=5 && /SEC EDGAR/.test($('#nw-body').textContent), null, { timeout:40000 }).catch(()=>{});
  check('…and official SEC filings (8-K, 10-Q…) for your stocks', await p.evaluate(()=>/8-K/.test($('#nw-body').textContent) && $$('#nw-body .nw li').length>=5));
  check('the Board shows five headlines and the coming reports', bn.news===5 && bn.earn>=3, JSON.stringify(bn));
  // the whole US market, no key
  await p.click('.lv-nav a[data-nav="markets"]'); await p.waitForTimeout(400);
  const mk=await p.evaluate(()=>({ n:MKT.list.length, rows:$$('#mk-tbl tbody tr').length, first:$('#mk-tbl tbody tr a').textContent, idx:$$('#mk-idx .mk-i').length, more:!$('#mk-more').hidden }));
  check('Markets lists the whole US market, biggest first, 50 at a time, with the four big indexes and breadth', mk.n>9000 && mk.rows===50 && ['AAPL','NVDA','MSFT','GOOGL'].includes(mk.first) && mk.idx===5 && mk.more, JSON.stringify(mk));
  await p.click('#mk-more'); await p.waitForTimeout(200); check('Show 50 more adds rows', await p.evaluate(()=>$$('#mk-tbl tbody tr').length)===100);
  await p.click('[data-mk="mk-type:etf"]'); await p.click('[data-mk="mk-sort:up"]'); await p.waitForTimeout(200);
  const up=await p.evaluate(()=>{ const r=mkRows(); return { n:r.length, etf:r.every(d=>d.type==='etf'), sorted:r.slice(0,50).every((d,i,a)=>!i || a[i-1].chg>=d.chg), big:r.every(d=>d.val>=5e6) }; });
  check('ETFs sorted by today’s rise, ignoring tiny ones', up.n>50 && up.etf && up.sorted && up.big, JSON.stringify(up));
  await p.click('[data-mk="mk-type:all"]'); await p.click('[data-mk="mk-sort:big"]'); await p.fill('#mk-q', 'tesla'); await p.waitForTimeout(300);
  check('search in Markets finds Tesla by name', await p.evaluate(()=>$('#mk-tbl tbody tr a').textContent)==='TSLA');
  await p.fill('#mk-q', ''); await p.waitForTimeout(100);
  await p.click('.lv-nav a[data-nav="trade"]'); await p.fill('#tr-find', 'COST'); await p.waitForTimeout(250); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  const cs=await p.evaluate(()=>({ sel:ST.sel, opt:$('#tr-sym').value, px:$('#tr-px').textContent, det:!!$('#tr-det .tr-det'), src:$('#tr-src').textContent }));
  check('the trade search opens any US stock (Costco) with its delayed price and key numbers', cs.sel==='COST' && cs.opt==='COST' && /\$/.test(cs.px) && cs.det && /TradingView/.test(cs.src), JSON.stringify(cs));
  await p.click('#tr-tf [data-ctf="1d"]'); await p.waitForTimeout(300);
  check('its Days view shows how it did over time and the 52-week range', await p.evaluate(()=>$$('#tr-chart .perf-l li').length>=6 && !!$('#tr-chart .rng')));
  await p.click('#tr-tf [data-ctf="1m"]');
  await p.evaluate(()=>{ window.usMarketOpen=()=>true; }); await p.click('#tk-side [data-side="b"]'); await p.click('#tk-type [data-type="mkt"]'); await p.fill('#tk-amt', '3000'); await p.click('#tk-go'); await p.waitForTimeout(300);
  const co=await p.evaluate(()=>({ pos:ST.A.pos.COST, f:ST.A.fills[ST.A.fills.length-1], last:MKT.all.COST.last }));
  check('buying $3,000 of it fills at the delayed price plus the 0.05% spread, no commission', co.pos && Math.abs(co.f.px-co.last*1.0005)<1e-6 && co.f.fee===0 && Math.abs(co.pos.q*co.f.px-3000)<1, JSON.stringify({ q:co.pos && co.pos.q, px:co.f.px, last:co.last }));
  await p.reload(); await p.waitForFunction(()=>MKT.list.length>5000, null, { timeout:30000 }); await p.waitForTimeout(300);
  check('after a reload the US holding is still there and priced', await p.evaluate(()=>!!ST.A.pos.COST && !!quote('COST') && $('#tr-sym').value==='COST'));
  // US stocks: real time through Settings
  await p.click('.lv-nav a[data-nav="settings"]'); await p.fill('#set-ap-id', ID); await p.fill('#set-ap-sec', 'wrong'); await p.click('#set-save');
  await p.waitForFunction(()=>/refused/.test($('#set-msg').textContent), null, { timeout:8000 });
  check('wrong keys are reported as refused', true, await p.textContent('#set-msg'));
  await p.fill('#set-ap-sec', SEC); await p.click('#set-save'); await p.waitForFunction(()=>/Connected to Alpaca/.test($('#set-msg').textContent), null, { timeout:8000 });
  const us=await p.evaluate(()=>({ n:LIVE_US.filter(d=>quote(d.sym)).length, rt:LIVE_US.every(d=>!quote(d.sym).delayed) && quote('COST').delayed, secField:$('#set-ap-sec').value, stored:!!localStorage.getItem('tdl-ap-secret'), inState:localStorage.getItem('tdl-state').includes('secret123') }));
  check('good Alpaca keys switch the 14 big names to real time; the secret box is cleared and the key is kept only in its own browser slot', us.n===14 && us.rt && us.secField==='' && us.stored && !us.inState, JSON.stringify(us));
  await p.evaluate(()=>{ window.usMarketOpen=()=>true; }); await p.click('.lv-nav a[data-nav="board"]'); await p.click('#b-map [data-sym="AAPL"]'); await p.click('#q-amt [data-qa="5000"]'); await p.click('#t-quick [data-q="b"]'); await p.waitForTimeout(300);
  const st=await p.evaluate(()=>({ pos:ST.A.pos.AAPL, fee:ST.A.fills[ST.A.fills.length-1].fee }));
  check('with the market open, $5,000 of Apple buys fractional shares at the ask with no commission', st.pos && Math.abs(st.pos.q-5000/200.02)<1e-3 && st.fee===0, JSON.stringify(st));
  await p.evaluate(()=>{ window.usMarketOpen=()=>false; render(); }); await p.waitForTimeout(200);
  check('with the market closed, Quick trade for a stock is switched off and says why', await p.evaluate(()=>$('#t-quick [data-q="b"]').disabled && /closed/.test($('#q-msg').textContent)));
  check('the secret key was never sent anywhere but Alpaca', seen.leak.length===0, seen.leak.join(' '));
  await p.screenshot({ path:OUT+'/live_dark.png' });
  // advanced orders, the watchlist and alerts, performance, money handed to a bot, the strategy lab
  await p.evaluate(()=>location.hash='#trade'); await p.selectOption('#tr-sym', 'ETH'); await p.waitForTimeout(800);
  await p.click('#tk-side [data-side="b"]'); await p.click('#tk-type [data-type="mkt"]'); await p.click('#tk-unit [data-unit="usd"]'); await p.fill('#tk-amt', '1000'); await p.click('#tk-go'); await p.waitForTimeout(300);
  await p.click('#tk-type [data-type="trl"]'); await p.waitForTimeout(150); const tl=await p.evaluate(()=>({ side:ST.side, trw:!$('#tk-trw').hidden, pxw:$('#tk-pxw').hidden }));
  await p.fill('#tk-amt', '300'); await p.fill('#tk-tr', '4'); await p.click('#tk-go'); await p.waitForTimeout(250);
  const trl=await p.evaluate(()=>{ const o=ST.A.orders.find(x=>x.type==='trl' && x.status==='open'); return { ok:!!o, trail:o && o.trail, row:/Trailing stop/.test($('#tr-ord').textContent) }; });
  check('a trailing stop can be placed from the ticket (it switches to Sell) and is listed', tl.side==='s' && tl.trw && tl.pxw && trl.ok && Math.abs(trl.trail-.04)<1e-9 && trl.row, JSON.stringify({ ...tl, ...trl }));
  const pv=await p.evaluate(()=>!$('#pt').hidden); await p.click('#pt-go'); await p.waitForTimeout(250);
  const oc=await p.evaluate(()=>({ n:ST.A.orders.filter(o=>o.g && o.status==='open').length, tp:/Take profit/.test($('#tr-ord').textContent), msg:$('#pt-msg').textContent }));
  check('…and “Protect this position” puts a take-profit and a stop-loss on the rest', pv && oc.n===2 && oc.tp, JSON.stringify(oc));
  if (!(await p.evaluate(()=>wlHas('ETH')))) await p.click('#tr-star'); const wl=await p.evaluate(()=>({ has:wlHas('ETH'), star:$('#tr-star').textContent }));
  await p.selectOption('#al-kind', 'below'); await p.evaluate(()=>{ $('#al-v').value=String(+(quote('ETH').last*.9).toFixed(2)); }); await p.click('#al-go'); await p.waitForTimeout(150);
  const al0=await p.evaluate(()=>({ n:ST.alerts.filter(a=>a.sym==='ETH' && a.on).length, mine:$$('#al-mine li').length }));
  await p.evaluate(()=>{ const a=ST.alerts.find(x=>x.sym==='ETH' && x.on); a.v=quote('ETH').last*1.5; alCheck(quotesAll()); });
  const al1=await p.evaluate(()=>({ on:ST.alerts.filter(a=>a.sym==='ETH' && a.on).length, inbox:ST.inbox.some(x=>x.ico==='🔔') }));
  check('the star puts a coin on the watchlist, and an alert can be set on it and fires once its price is reached', wl.has && wl.star==='★' && al0.n===1 && al0.mine===1 && al1.on===0 && al1.inbox, JSON.stringify({ wl, al0, al1 }));
  await p.click('.lv-nav a[data-nav="portfolio"]'); await p.waitForTimeout(400);
  const pf2=await p.evaluate(()=>({ tiles:$$('#pf-perf .pf-t').length, chart:!!$('#pf-perf svg') || /chart fills in/.test($('#pf-perf').textContent), wl:$$('#wl-list tbody tr').length, al:$$('#al-list li').length }));
  check('Portfolio shows performance (return, against Bitcoin and the S&P 500, Sharpe, drawdown, volatility, win rate, profit factor), the watchlist and the alerts', pf2.tiles===9 && pf2.chart && pf2.wl>=1 && pf2.al>=1, JSON.stringify(pf2));
  await p.click('.lv-nav a[data-nav="bots"]'); await p.waitForTimeout(500); const e0=await p.evaluate(()=>({ E:totalEq(quotesAll()), cash:ST.A.cash }));
  await p.selectOption('#mg-bot', 'knn'); await p.fill('#mg-usd', '5000'); await p.click('#mg-go'); await p.waitForTimeout(300);
  const mg=await p.evaluate(()=>({ n:ST.mg.length, cash:ST.A.cash, E:totalEq(quotesAll()), rows:$$('#bots-mg tbody tr').length }));
  check('money handed to a bot leaves your cash but still counts in your total', mg.n===1 && Math.abs(e0.cash-mg.cash-5000)<1e-6 && Math.abs(mg.E-e0.E)<30 && mg.rows===1, JSON.stringify({ e0, mg }));
  await p.click('[data-mg-take="knn"]'); await p.waitForTimeout(300); const mg2=await p.evaluate(()=>({ n:ST.mg.length, cash:ST.A.cash }));
  check('…and withdrawing returns it to your cash', mg2.n===0 && Math.abs(mg2.cash-e0.cash)<30, JSON.stringify(mg2));
  await p.evaluate(()=>location.hash='#lab'); await p.waitForTimeout(400); await p.click('[data-lb-pre="dip"]'); await p.selectOption('#lb-sym', 'BTC'); await p.click('#lb-run'); await p.waitForTimeout(400);
  const lb=await p.evaluate(()=>({ tiles:$$('#lb-res .pf-t').length, chart:!!$('#lb-res svg'), txt:$('#lb-res h2') && $('#lb-res h2').textContent }));
  check('the strategy lab backtests a ready-made strategy on real BTC candles against buy and hold', lb.tiles===8 && lb.chart, JSON.stringify(lb));
  await p.fill('#lb-name', 'Test dip'); await p.click('#lb-live'); await p.waitForTimeout(300);
  const lv=await p.evaluate(()=>({ bot:ST.ai.find(b=>b.custom), mine:$$('#lb-mine li').length }));
  await p.click('.lv-nav a[data-nav="bots"]'); await p.waitForTimeout(500); const lc=await p.evaluate(()=>({ cards:$$('#bots-cards .ai-card').length, name:/Test dip/.test($('#bots-lb').textContent) }));
  check('…and runs it live as your own bot, which joins the Bots screen', lv.bot && lv.bot.custom.sym==='BTC' && lv.mine===1 && lc.cards===7 && lc.name, JSON.stringify({ sym:lv.bot && lv.bot.custom.sym, ...lc }));
  // the Bot Arena
  await p.evaluate(()=>location.hash='#arena'); await p.waitForTimeout(500);
  const ar=await p.evaluate(()=>({ gone:/Trend Follower|Mean Reversion|Logistic Model|Neural Network|Gradient Booster|Genetic Optimizer|Adaptive Bandit|Ensemble Council|Regime Allocator/.test($('#arena').textContent), rows:$$('#arena .mk-tbl tbody tr').length, chart:!!$('#ar-chart svg'), reg:$$('#arena .tbl')[2] && $$('#arena .tbl')[2].querySelectorAll('tbody tr').length, luck:/random bots|rastgele/.test($('#arena').textContent), btc:/Bitcoin/.test($('#arena .ar-top').textContent) }));
  const arv=await p.evaluate(()=>$$('[data-arv]').map(b=>b.dataset.arv)); await p.click(`[data-arv="${arv[1]}"]`); await p.waitForTimeout(200);
  const ar1=await p.evaluate(v=>$(`[data-arv="${v}"]`).getAttribute('aria-pressed')==='true' && $$('#arena .mk-tbl tbody tr').length>=4, arv[1]); await p.click(`[data-arv="${arv[0]}"]`); await p.waitForTimeout(200);
  check('the Bot Arena shows the walk-forward results: leaderboard with the luck test, the chart against Bitcoin, one engine against the one before, and regimes (only bots of the roster)', ar.rows===4 && !ar.gone && ar.chart && ar.luck && ar.btc && ar1, JSON.stringify({ ...ar, versions:arv }));
  const rd=await p.evaluate(()=>({ col:/Real money\?/.test($('#arena .mk-tbl thead').textContent), cells:$$('#arena .mk-tbl tbody tr').filter(r=>/ready|paper only/.test(r.textContent)).length, warn:!!$('#arena .ar-warn') }));
  check('every bot gets a real-money verdict (ready only if all five checks pass), with the warning above', rd.col && rd.cells>=4 && rd.warn, JSON.stringify(rd));
  // trade replay: a trade in a bot's log opens a chart with where it went in and out
  await p.evaluate(()=>{ const b=ST.ai.find(x=>x.id==='knn'), h=AI.hb.BTC, n=h.length; b.log.push({ t:h[n-30].t, sym:'BTC', act:'b', code:'ml_up', vals:{ p:.7 }, px:h[n-30].c, q:.01, usd:h[n-30].c*.01 }, { t:h[n-20].t, sym:'BTC', act:'s', code:'take_profit', vals:{}, px:h[n-20].c, q:.01, pl:12.3, ret:h[n-20].c/h[n-30].c-1 }); location.hash='#bots'; });
  await p.waitForTimeout(600); await p.click('.ai-log tbody tr[data-rp]'); await p.waitForTimeout(300);
  const rp=await p.evaluate(()=>({ open:!!$('#replay') && !$('#replay').hidden, candles:$$('#replay svg rect').length, marks:$$('#replay svg circle').length, why:$$('#replay .rp-why li').length }));
  await p.keyboard.press('Escape'); const rpc=await p.evaluate(()=>$('#replay').hidden);
  check('clicking a trade shows it on a chart: the candles, where it went in and out, and why; Escape closes it', rp.open && rp.candles>=10 && rp.marks===2 && rp.why===2 && rpc, JSON.stringify(rp));
  // edge notification: when a bot passes its proven-edge test, the inbox says so
  const ed=await p.evaluate(()=>{ const b=ST.ai.find(x=>x.id==='nb'); ST.edge=ST.edge||{}; ST.edge.nb=false; b.tune={ ...(b.tune||{}), minP:.6, minPs:1.01, at:Date.now() }; edgeWatch(); const last=ST.inbox[ST.inbox.length-1]; ST.lang='tr'; const tr=T(last.msg); ST.lang='en'; return { msg:last.msg, tr }; });
  check('when a bot proves an edge, the inbox (and the browser, if allowed) says so — in Turkish too', /Bayesian Classifier proved an edge/.test(ed.msg) && /avantajını kanıtladı/.test(ed.tr), JSON.stringify(ed));
  // the Strategy Desk
  await p.evaluate(()=>location.hash='#desk'); await p.waitForFunction(()=>DLY.status==='live' || DLY.status==='offline', null, { timeout:60000 }).catch(()=>{}); await p.waitForTimeout(800);
  const dk0=await p.evaluate(()=>({ st:DLY.status, coins:DLY.D ? DLY.D.syms.length : 0, strat:$$('#desk .dk-tbl')[0] ? $$('#desk .dk-tbl')[0].querySelectorAll('tbody tr').length : 0 })); await p.click('[data-dk-tab="results"]'); await p.waitForTimeout(300);
  const dk={ ...dk0, ...(await p.evaluate(()=>({ hist:!!$('#dk-chart svg'), years:/2019/.test($('#desk').textContent), dsr:/Deflated Sharpe/.test($('#desk').textContent), robust:/a day late/.test($('#desk').textContent) }))) }; await p.click('[data-dk-tab="today"]');
  check('the Strategy Desk loads daily candles of the coins and shows what each strategy holds from today, with the record since 2018 (chart, years, deflated Sharpe, robustness)', dk.st==='live' && dk.coins>=20 && dk.strat>=8 && dk.hist && dk.years && dk.dsr && dk.robust, JSON.stringify(dk));
  const rep=await p.evaluate(()=>dkReport()); check('the daily report can be copied as text: Bitcoin against its averages, every strategy’s holdings, trends, momentum, funding, and the real-money verdict', /BTC \$/.test(rep) && /BTC Trend Guard/.test(rep) && /Extreme funding/.test(rep) && /real-money/.test(rep), rep.split('\n').slice(0,3).join(' / '));
  await p.click('[data-dk-tab="track"]'); await p.waitForTimeout(300); await p.click('[data-dk-start="guard"]'); await p.waitForTimeout(300); const pa=await p.evaluate(()=>({ acc:!!(ST.desk && ST.desk.acc && ST.desk.acc.guard), row:!!$('[data-dk-stop="guard"]') }));
  check('a strategy can be followed with a $10,000 paper account', pa.acc && pa.row, JSON.stringify(pa)); await p.click('[data-dk-stop="guard"]');
  await p.evaluate(()=>location.hash='#settings'); await p.waitForTimeout(300); await p.click('#set-fee [data-fee="maker"]'); const fee=await p.evaluate(()=>({ fee:BRK.FEES.crypto, st:ST.fee, pressed:$('#set-fee [data-fee="maker"]').getAttribute('aria-checked') }));
  await p.click('#set-fee [data-fee="taker"]'); const fee2=await p.evaluate(()=>BRK.FEES.crypto);
  check('trading costs can be set to limit orders with the BNB discount (0.075%) and back to standard (0.10%)', fee.fee===.00075 && fee.st==='maker' && fee.pressed==='true' && fee2===.001, JSON.stringify(fee));
  // the Desk's tabs: forward test, a year's range, rolling years, correlations, lira, DCA, own tester, event risk, agreement
  await p.evaluate(()=>location.hash='#desk'); await p.waitForTimeout(400);
  const tabs={}; for (const k of ['today','results','tools','track']){ await p.click(`[data-dk-tab="${k}"]`); await p.waitForTimeout(300); tabs[k]=await p.evaluate(()=>$('#desk').innerText); }
  check('Desk, Today: event risk and whether strategies and bots agree', /48 hours|Event risk/.test(tabs.today) && /Do strategies and bots agree/.test(tabs.today), '');
  check('Desk, Results: a year’s range (1 in 20), rolling 12 months, correlations, Turkish lira, weekday check and the ideas that failed', /What one year can look like/.test(tabs.results) && /12 months, at every point/.test(tabs.results) && /move together/.test(tabs.results) && /In Turkish lira/.test(tabs.results) && /Trading weekday/.test(tabs.results) && /Tried and failed/.test(tabs.results), '');
  check('Desk, Tools: the DCA planner (three plans) and the own-rule tester', /Every month, always/.test(tabs.tools) && /Everything at the start/.test(tabs.tools) && /Test your own daily rule/.test(tabs.tools), '');
  check('Desk, Tracking: the forward test is recorded from today', /Forward test/.test(tabs.track) && await p.evaluate(()=>!!(ST.fwd && ST.fwd.rows.length)), '');
  await p.click('[data-dk-tab="today"]');
  // the Journal
  await p.evaluate(()=>location.hash='#journal'); await p.waitForTimeout(500);
  await p.fill('#jr-r-cap', '5000'); await p.dispatchEvent('#jr-r-cap', 'change'); await p.fill('#jr-c-entry', '100'); await p.dispatchEvent('#jr-c-entry', 'change'); await p.fill('#jr-c-stop', '95'); await p.dispatchEvent('#jr-c-stop', 'change'); await p.waitForTimeout(200);
  const ps=await p.evaluate(()=>$('#journal').innerText.match(/Loss if the stop is hit[^\n]*\n?[^\n]*/)?.[0]||'');
  check('position size: hitting the stop costs exactly the risk per trade (1% of $5,000 = $50, fees included)', /−\$50\.00 \(1%\)/.test(ps), ps.replace(/\s+/g,' '));
  const csv='"Date(UTC)","Pair","Side","Price","Executed","Amount","Fee"\n"2026-10-01 10:00:00","BTCUSDT","BUY","60000","0.01BTC","600USDT","0.00001BTC"\n"2026-10-02 10:00:00","BTCUSDT","SELL","63000","0.01BTC","630USDT","0.63USDT"\n"2026-10-03 09:00:00","ETHUSDT","BUY","2500","0.4ETH","1000USDT","0.75USDT"\n"2026-10-20 09:00:00","ETHUSDT","SELL","2200","0.4ETH","880USDT","0.88USDT"\n';
  const jr2=await p.evaluate(c=>{ const r=jrParseCSV(c); ST.jr.trades.push(...r.rows); save(); render(); const B=jrBook(), s=jrStats(B.closed); return { rows:r.rows.length, closed:B.closed.length, pl:+s.pl.toFixed(2), win:s.win }; }, csv); await p.waitForTimeout(300);
  check('a Binance trade-history CSV is read (fees in the coin or in USDT) and the journal matches sells to buys first-in first-out', jr2.rows===4 && jr2.closed===2 && Math.abs(jr2.pl-(30-.6-.63+(-120-.75-.88)))<.01 && jr2.win===.5, JSON.stringify(jr2));
  check('…and it warns about the disposition effect (losers held far longer than winners)', await p.evaluate(()=>/disposition effect/.test($('#journal').innerText)));
  await p.evaluate(()=>{ ST.jr.rules.maxMonth=1; const d=new Date(); ST.jr.trades.push({ id:'x1', t:Date.now()-60000, sym:'SOL', cur:'USDT', side:'b', px:100, qty:10, fee:0 }, { id:'x2', t:Date.now(), sym:'SOL', cur:'USDT', side:'s', px:80, qty:10, fee:0 }); save(); render(); }); await p.waitForTimeout(300);
  check('your own monthly loss rule stops you: a banner once the month’s realised loss passes it', await p.evaluate(()=>/monthly loss limit is reached/.test($('#journal').innerText)));
  await p.selectOption('#jr-h-add', 'BTC'); await p.waitForTimeout(400); await p.fill('#jr-h-BTC', '0.05'); await p.dispatchEvent('#jr-h-BTC', 'change'); await p.waitForTimeout(300);
  check('the rebalance helper turns a strategy’s targets and your holdings into orders', await p.evaluate(()=>/Target:/.test($('#journal').innerText) && ($$('#journal .tbl tbody tr').some(r=>/^(Buy|Sell) /.test(r.cells[0].innerText)) || /already matches/.test($('#journal').innerText))));
  // settings: notifications, backup, privacy, data health; the Academy
  await p.evaluate(()=>location.hash='#settings'); await p.waitForTimeout(300); await p.click('#nt-new'); await p.waitForTimeout(200);
  const st2=await p.evaluate(()=>({ topic:ST.ntfy, health:$$('#set-extra .tbl tbody tr').length, test:!$('#nt-test').disabled }));
  check('phone notifications: a long random ntfy topic can be made (and tested), and the data-health table lists every source', /^tidewater-[a-z0-9]{12,}$/.test(st2.topic) && st2.test && st2.health>=6, JSON.stringify(st2));
  const bk=await p.evaluate(()=>{ const b=bkCollect(false); return { keys:Object.keys(b.data), app:b.app }; });
  check('the backup holds this site’s data and leaves out API keys unless asked', bk.app==='tidewater-live' && bk.keys.includes('tdl-state') && !bk.keys.some(k=>/alpaca|finnhub|key|secret/i.test(k)), bk.keys.join(','));
  await p.click('#lv-priv'); await p.waitForTimeout(200); const pvx=await p.evaluate(()=>({ nw:$('#lv-nw').textContent, pressed:$('#lv-priv').getAttribute('aria-pressed') })); await p.click('#lv-priv');
  check('privacy mode hides money amounts (and the button says so)', /•/.test(pvx.nw) && pvx.pressed==='true', JSON.stringify(pvx));
  await p.evaluate(()=>location.hash='#learn'); await p.waitForTimeout(300);
  const lr=await p.evaluate(()=>({ n:$$('#learn details').length, calc:/needs \+100% to get back/.test((()=>{ ST.learnLoss=50; render(); return ''; })() || '') }));
  await p.waitForTimeout(300); const lr2=await p.evaluate(()=>{ $$('#learn details')[1].open=true; return /needs \+100% to get back/.test($('#learn').innerText); });
  check('the Academy has ten lessons, with the loss-recovery calculator (−50% needs +100%)', lr.n===10 && lr2, JSON.stringify(lr));
  await p.evaluate(()=>{ ST.wk=0; ST.wkSnap={ t:Date.now()-7*864e5, eq:90000, bots:{ knn:9000, nb:11000 } }; wkDigest(); });
  check('a weekly summary goes to the inbox once a week', await p.evaluate(()=>/Weekly summary/.test(ST.inbox[ST.inbox.length-1].msg)));
  { // the pro chart: timeframes, indicators, settings, templates, zoom, crosshair, drawings, chart types, PNG export
  await p.evaluate(()=>{ location.hash='#trade'; }); await p.waitForTimeout(500); await p.selectOption('#tr-sym', 'BTC'); await p.waitForTimeout(800);
  // real 1-second candles: Binance 1s klines, then every trade from the websocket
  await p.click('#tr-tf [data-ctf="1s"]');
  await p.waitForFunction(()=>typeof CHM==='object' && CHM && CHM.tf==='1s' && CHM.bars && CHM.bars.length>5, null, { timeout:20000 }).catch(()=>{});
  const s1a=await p.evaluate(()=>{ const B=cdBars('BTC','1s')||[]; return { n:B.length, t:B.length ? B[B.length-1].t : 0, contig:B.every((x,i)=>!i || x.t-B[i-1].t===1000), tf:CHM && CHM.tf, src:$('#tr-src').textContent, stf:ST.tf }; });
  await p.waitForTimeout(3200);
  const s1b=await p.evaluate(()=>{ const B=cdBars('BTC','1s')||[], L=B[B.length-1]; return { t:L ? L.t : 0, close:L && L.c, last:quote('BTC').last }; });
  check('chart: 1-second candles load from Binance (1000 contiguous seconds) and move on live, second by second', s1a.n>=1000 && s1a.contig && s1a.tf==='1s' && s1a.stf==='intra' && /1-second/.test(s1a.src) && s1b.t-s1a.t>=2000 && Math.abs(s1b.close/s1b.last-1)<.002, JSON.stringify({ ...s1a, ...s1b }));
  await p.click('#tr-tf [data-ctf="1h"]');
  await p.waitForFunction(()=>typeof CHM==='object' && CHM && CHM.tf==='1h' && CHM.bars && CHM.bars.length>5, null, { timeout:20000 }).catch(()=>{});
  const h1=await p.evaluate(()=>({ tf:ST.chart.tf, stf:ST.tf, dt:CHM && CHM.bars[1].t-CHM.bars[0].t, n:(cdBars('BTC','1h')||[]).length, rects:$$('#tr-chart rect').length, pressed:$('#tr-tf [data-ctf="1h"]').getAttribute('aria-pressed'), src:$('#tr-src').textContent }));
  check('chart: the 1h button loads hourly candles from Binance (and keeps the old ST.tf in sync)', h1.tf==='1h' && h1.stf==='intra' && h1.dt===36e5 && h1.n>=500 && h1.rects>10 && h1.pressed==='true' && /hourly/.test(h1.src), JSON.stringify(h1));
  const sub0=await p.evaluate(()=>CHM.panes.length);
  await p.click('#tr-tf [data-cu="ind"]'); await p.waitForSelector('#cu-layer [role="dialog"]');
  await p.fill('#cu-q', 'rsi'); await p.click('#cu-layer [data-cu-add="rsi"]'); await p.fill('#cu-q', 'macd'); await p.click('#cu-layer [data-cu-add="macd"]'); await p.waitForTimeout(400);
  const sub1=await p.evaluate(()=>({ panes:CHM.panes.map(x=>x.id), ids:ST.chart.inds.map(x=>x.id), svgH:+$('#tr-chart svg.chart').getAttribute('height')||$('#tr-chart svg.chart').getBoundingClientRect().height }));
  check('chart: adding RSI and MACD from the indicator picker creates two new sub-panes', sub1.panes.length===sub0+2 && sub1.ids.includes('rsi') && sub1.ids.includes('macd'), JSON.stringify({ sub0, ...sub1 }));
  await p.fill('#cu-q', 'bollinger'); await p.click('#cu-layer [data-cu-add="bb"]'); await p.waitForTimeout(400);
  const bb=await p.evaluate(()=>({ ids:ST.chart.inds.map(x=>x.id), band:$$('#tr-chart svg.chart path[fill-opacity]').filter(x=>x.getAttribute('fill')!=='none' && x.getAttribute('d').length>100).length }));
  check('chart: Bollinger Bands draw a shaded band on the price pane', bb.ids.includes('bb') && bb.band>=1, JSON.stringify(bb));
  await p.addScriptTag({ content:fs.readFileSync(__dirname+'/../axe/node_modules/axe-core/axe.min.js','utf8') });
  const axPick=async()=>p.evaluate(async()=>(await axe.run(document, { resultTypes:['violations'] })).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id+':'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')).join(', ')));
  const ax1=await axPick(); check('accessibility: no serious problems with the indicator picker open (dark)', ax1.length===0, ax1.join(' '));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('#lv-theme'); await p.waitForTimeout(200); await p.click('#tr-tf [data-cu="ind"]'); await p.waitForSelector('#cu-layer [role="dialog"]');
  const ax2=await axPick(); check('accessibility: no serious problems with the indicator picker open (light)', ax2.length===0, ax2.join(' '));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const pk=await p.evaluate(()=>({ open:!!$('#cu-layer [role="dialog"]'), focus:document.activeElement && document.activeElement.getAttribute('data-cu') }));
  check('Esc closes the picker and gives the focus back to the Indicators button', !pk.open && pk.focus==='ind', JSON.stringify(pk));
  await p.click('#lv-theme'); await p.waitForTimeout(200);
  // settings: EMA 20 -> 50 moves the line
  const emaK=await p.evaluate(()=>{ const x=ST.chart.inds.find(i=>i.id==='ema'); return x && x.k; });
  const emaD=()=>p.evaluate(k=>{ const x=ST.chart.inds.find(i=>i.k===k), col=chCol(x, IND_DEFS.ema, 'line').toLowerCase(); return $$('#tr-chart svg.chart path').filter(e=>(e.getAttribute('stroke')||'').toLowerCase()===col).map(e=>e.getAttribute('d')).join('|'); }, emaK);
  const d0=await emaD(); await p.click(`#tr-chart [data-cu-ind="${emaK}"]`); await p.waitForSelector('#cu-layer [data-cu-p="n"]');
  await p.fill('#cu-layer [data-cu-p="n"]', '50'); await p.waitForTimeout(400); const d1=await emaD();
  const st=await p.evaluate(k=>({ n:ST.chart.inds.find(i=>i.k===k).p.n, leg:$(`#tr-chart [data-cu-ind="${k}"]`).textContent, dlg:!!$('#cu-layer [role="dialog"]') }), emaK);
  check('chart: the settings dialog changes the EMA length to 50 and the line is redrawn', st.dlg && st.n===50 && /50/.test(st.leg) && d0 && d1 && d0!==d1, JSON.stringify({ ...st, same:d0===d1, d0:d0.length, d1:d1.length }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // wheel zoom and crosshair
  const box=await p.evaluate(()=>{ const r=$('#tr-chart svg.chart').getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, mainH:CHM.mainH, plotW:CHM.plotW }; });
  const n0=await p.evaluate(()=>CHM.bars.length); await p.mouse.move(box.x+box.plotW*0.6, box.y+box.mainH*0.5); for (let i=0; i<3; i++){ await p.mouse.wheel(0, -240); await p.waitForTimeout(80); } await p.waitForTimeout(300);
  const n1=await p.evaluate(()=>CHM.bars.length);
  check('chart: the mouse wheel zooms in (fewer bars on screen)', n1<n0 && n1>=10, JSON.stringify({ n0, n1 }));
  await p.dblclick('#tr-chart svg.chart', { position:{ x:box.plotW*0.3, y:box.mainH*0.5 } }); await p.waitForTimeout(300);
  await p.mouse.move(box.x+box.plotW*0.4, box.y+box.mainH*0.4); await p.waitForTimeout(150); await p.mouse.move(box.x+box.plotW*0.4+3, box.y+box.mainH*0.4+2); await p.waitForTimeout(300);
  const cx=await p.evaluate(()=>{ const lg=$('#tr-chart .ch-lg .ch-lr'), t=lg ? lg.innerText.replace(/\s+/g,' ') : '', last=CHM.bars[CHM.bars.length-1]; return { t, cross:$$('#tr-chart svg.chart .ch-x *').length, lastC:chFmtP(last.c, CH.L.dec) }; });
  check('chart: the crosshair follows the pointer and the legend shows that bar’s O H L C', cx.cross>0 && /O\s*[\d.,]+\s*H\s*[\d.,]+\s*L\s*[\d.,]+\s*C\s*[\d.,]+/.test(cx.t), JSON.stringify(cx));
  await p.mouse.move(box.x+box.w+40, box.y-40); await p.waitForTimeout(200);
  // chart types
  await p.click('#tr-tf [data-cu="type"]'); await p.click('#cu-layer [data-ctype="heikin"]'); await p.waitForTimeout(400);
  const ha=await p.evaluate(()=>({ type:ST.chart.type, rects:$$('#tr-chart svg.chart rect').length, lbl:$('#tr-tf [data-cu="type"]').getAttribute('aria-label') }));
  await p.click('#tr-tf [data-cu="type"]'); await p.click('#cu-layer [data-ctype="line"]'); await p.waitForTimeout(400);
  const ln0=await p.evaluate(()=>({ type:ST.chart.type, rects:$$('#tr-chart svg.chart rect').length, line:($('#tr-chart svg.chart path.ch-ln')||{ getAttribute:()=>'' }).getAttribute('d').length }));
  check('chart: Heikin-Ashi candles and the line chart both render', ha.type==='heikin' && ha.rects>10 && ln0.type==='line' && ln0.rects===0 && ln0.line>100, JSON.stringify({ ha, ln0 }));
  await p.click('#tr-tf [data-cu="type"]'); await p.click('#cu-layer [data-ctype="candle"]'); await p.waitForTimeout(300);
  // templates
  await p.click('#tr-tf [data-cu="tpl"]'); await p.click('#cu-layer [data-cu-tpl-apply="b:momentum"]'); await p.waitForTimeout(400);
  const tp=await p.evaluate(()=>({ ids:ST.chart.inds.map(x=>x.id).join(','), panes:CHM.panes.length, dlg:!!$('#cu-layer [role="dialog"]') }));
  check('chart: the built-in Momentum template replaces the indicators with RSI, MACD and Volume', tp.ids==='rsi,macd,vol' && tp.panes===4 && !tp.dlg, JSON.stringify(tp));
  check('chart: the toolbar has a working "save as PNG" button', await p.evaluate(()=>{ const b=$('#tr-tf [data-cu="shot"]'); return !!b && !b.disabled && /PNG/.test(b.getAttribute('aria-label')) && typeof cuShot==='function'; }));
  // a horizontal line drawing is kept per symbol and survives a reload
  await p.evaluate(()=>{ ST.chart.draw.BTC=[]; save(); }); await p.click('#tr-tf [data-cu="draw"]'); await p.waitForTimeout(200);
  await p.evaluate(()=>drTool('hline')); await p.waitForTimeout(100);
  const bx2=await p.evaluate(()=>{ const r=$('#tr-chart svg.chart').getBoundingClientRect(); return { x:r.left, y:r.top }; }), hy=box.mainH*0.35, hpx=await p.evaluate(y=>CHM.px(y), hy); await p.mouse.click(bx2.x+box.plotW*0.5, bx2.y+hy);   // the palette above the chart moved it down await p.waitForTimeout(300);
  const hl=await p.evaluate(()=>(ST.chart.draw.BTC||[]).map(d=>({ tool:d.tool, px:d.a && d.a.px })));
  await p.evaluate(()=>{ drOpen(false); DR.sel=null; render(); }); await p.reload(); await p.waitForFunction(()=>LIVE.status==='live', null, { timeout:20000 }); await p.waitForTimeout(400);
  await p.evaluate(()=>{ location.hash='#trade'; }); await p.waitForFunction(()=>!!$('#tr-chart svg.chart') && typeof CHM==='object' && CHM && CHM.y, null, { timeout:20000 }).catch(()=>{}); await p.waitForTimeout(500);
  const hl2=await p.evaluate(()=>({ saved:(ST.chart.draw.BTC||[]).map(d=>d.tool), drawn:!!$('#tr-chart .ch-dr') && $('#tr-chart .ch-dr').innerHTML.length>50 }));
  check('drawing: a horizontal line is saved in ST.chart.draw.BTC at the clicked price and is still drawn after a reload', hl.length===1 && hl[0].tool==='hline' && Math.abs(hl[0].px/hpx-1)<0.01 && hl2.saved.join()==='hline' && hl2.drawn, JSON.stringify({ hl, hpx, hl2 }));
  await p.evaluate(()=>{ ST.chart.draw.BTC=[]; ST.chart.inds=[{ k:'i1', id:'ema', p:{ n:20 }, c:{}, hide:false }, { k:'i2', id:'vol', p:{}, c:{}, hide:false }]; save(); render(); });
  await p.click('#tr-tf [data-ctf="1m"]'); await p.waitForTimeout(300);
  }
  // the professional pieces
  await p.evaluate(()=>{ ST.tf='intra'; location.hash='#trade'; }); await p.waitForTimeout(500); await p.selectOption('#tr-sym', 'BTC'); await p.waitForTimeout(800); await p.click('#tm-tog'); await p.waitForTimeout(800);
  const tm=await p.evaluate(()=>({ term:document.documentElement.classList.contains('term'), tape:$$('#tm-tape tr').length, blot:$$('#tm-blot [data-blot]').length, acct:/buying power/i.test($('#acct').innerText), tapeOk:!!$('#tm-tape') && ($$('#tm-tape tr').length>0 || !((LIVE.q.BTC||{}).trades||[]).length) }));
  check('terminal mode: chart, book, the live tape and a blotter; the account bar shows equity, today, buying power and open risk', tm.term && tm.tapeOk && tm.blot===4 && tm.acct, JSON.stringify(tm));
  await p.waitForFunction(()=>!!$('#tr-chart svg.chart'), null, { timeout:15000 }).catch(()=>{});
  await p.evaluate(()=>{ const q=quote('BTC'); brkOrder(ST.A, { sym:'BTC', kind:'crypto', side:'b', type:'lmt', q:.01, px:+(q.last*.98).toFixed(2) }, q); save(); render(); }); await p.waitForTimeout(600);
  const ln=await p.evaluate(()=>{ const g=$('#tm-ol [data-ln]'); return g ? g.dataset.ln : null; }), px0=await p.evaluate(k=>{ const o=ST.A.orders.find(x=>'o'+x.id===k); return o && o.px; }, ln);
  if (ln){ const box=await p.evaluate(k=>{ const r=$(`#tm-ol [data-ln="${k}"] .hit`).getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; }, ln); await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x, box.y+30, { steps:5 }); await p.mouse.up(); await p.waitForTimeout(400); }
  const dr=await p.evaluate(k=>{ const o=ST.A.orders.find(x=>'o'+x.id===k); return { px:o && o.px, q:quote('BTC').last, ln:k, svg:!!$('#tr-chart svg.chart'), chm:CHM, term:ST.term, ol:!!$('#tm-ol'), ord:ST.A.orders.filter(x=>x.status==='open').map(x=>x.type+':'+x.px), sel:ST.sel, chartTxt:($('#tr-chart')||{}).textContent, hash:location.hash }; }, ln);
  check('an order is a line on the chart; dragging it down moves its price down', !!ln && dr.px<px0, JSON.stringify({ px0, ...dr }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); check('Esc cancels the newest open order on the coin', await p.evaluate(()=>!ST.A.orders.some(o=>o.status==='open' && o.sym==='BTC')));
  await p.evaluate(()=>{ const q=quote('BTC'); brkOrder(ST.A, { sym:'BTC', kind:'crypto', side:'b', usd:2000 }, q); save(); render(); }); await p.click('[data-blot="fil"]'); await p.waitForTimeout(300);
  check('each market fill shows its slippage against the best price in the book', await p.evaluate(()=>/bps/.test($('#tm-blot').innerText)));
  await p.click('[data-mkt="fut"]'); await p.waitForTimeout(300); await p.fill('#fut-m', '1000'); await p.dispatchEvent('#fut-m', 'change'); await p.waitForTimeout(200); await p.click('#fut-go'); await p.waitForTimeout(300);
  const fu=await p.evaluate(()=>{ const P=ST.fut.pos.BTC; return P ? { lev:P.lev, m:P.margin, liqOk:Math.abs(P.liq/(P.entry*(1-1/P.lev+.005))-1)<1e-9, wallet:ST.fut.cash } : null; });
  check('paper futures: a 5x long with $1,000 margin; liquidation at entry × (1 − 1/5 + 0.5%); fee taken from the wallet', fu && fu.lev===5 && fu.m===1000 && fu.liqOk && Math.abs(fu.wallet-(10000-1000-5000*.0005))<.01, JSON.stringify(fu));
  const lq=await p.evaluate(()=>{ const P=ST.fut.pos.BTC; futTick({ BTC:{ last:P.liq*.999, bid:P.liq*.998, ask:P.liq } }); return { gone:!ST.fut.pos.BTC, act:ST.fut.fills[ST.fut.fills.length-1].act }; });
  check('…and when the price reaches the liquidation price the position is closed and its margin lost', lq.gone && lq.act==='liq', JSON.stringify(lq)); await p.click('[data-mkt="spot"]');
  await p.evaluate(()=>location.hash='#bots'); await p.waitForTimeout(800);
  const bo=await p.evaluate(()=>({ cards:$$('.bo-card').length, lim:$$('[data-bo-lim]').length, n:ST.ai.length }));
  await p.selectOption('[data-bo-lim="nb"]', '5'); await p.evaluate(()=>{ const b=ST.ai.find(x=>x.id==='nb'); ST.botPeak.nb=b.A.start*1.2; boGuard(quotesAll()); }); const off=await p.evaluate(()=>!ST.ai.find(x=>x.id==='nb').on);
  check('bot control centre: a card and a loss limit per bot; a bot that falls past its limit stops itself', bo.cards===bo.n && bo.lim===bo.n && off, JSON.stringify({ ...bo, off })); await p.evaluate(()=>{ ST.ai.find(x=>x.id==='nb').on=true; ST.botLim={}; save(); });
  await p.evaluate(()=>{ const t=Date.now(); ST.eqi=Array.from({ length:70 }, (_,k)=>({ t:t-(69-k)*864e5, v:100000*(1+.002*k+.01*Math.sin(k/5)) })); location.hash='#report'; render(); }); await p.waitForTimeout(800);
  const rpx=await p.evaluate(()=>({ svgs:$$('.rp-sheet svg').length, heat:$$('.rp-heat td').length, sharpe:/Sharpe/.test($('.rp-sheet').innerText) }));
  check('the performance report draws equity, drawdown, monthly returns and rolling Sharpe from the account’s history', rpx.svgs>=3 && rpx.heat>10 && rpx.sharpe, JSON.stringify(rpx));
  await p.evaluate(()=>location.hash='#challenge'); await p.waitForTimeout(300); await p.click('[data-ch-start="standard"]'); await p.waitForTimeout(400);
  const ch=await p.evaluate(()=>({ acct:ST.acct, cash:ST.A.cash, main:ST.accts.main.cash!==10000 }));
  const ch2=await p.evaluate(()=>{ ST.accts.ch.cash=9400; chGuard(quotesAll()); return { status:ST.ch.status, acct:ST.acct }; });
  check('the challenge trades a separate $10,000 account and ends the moment a loss limit is broken (back to the main account)', ch.acct==='ch' && ch.cash===10000 && ch.main && ch2.status==='failed' && ch2.acct==='main', JSON.stringify({ ...ch, ...ch2 }));
  await p.keyboard.press('Control+k'); await p.waitForTimeout(150); await p.keyboard.type('journal'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  check('the command palette (Ctrl+K) finds a screen and opens it', await p.evaluate(()=>location.hash==='#journal'));
  // Turkish
  await p.evaluate(()=>location.hash='#board'); await p.waitForTimeout(400);
  await p.click('#lv-lang'); await p.waitForTimeout(300);
  const tr=await p.evaluate(()=>({ nav:$$('.lv-nav a span').map(x=>x.textContent).join(','), lang:document.documentElement.lang, tile:$('#t-money-h').textContent, ib:ST.inbox.map(x=>T(x.msg)).join(' '), foot:$('#foot').textContent }));
  check('Türkçe: the menu, tiles, inbox messages and footer switch language', tr.lang==='tr' && tr.nav==='Pano,Piyasalar,Kripto,Botlar,Masa,Defter,Haberler,İşlem,Portföy,Ayarlar' && tr.tile==='Paran' && /aldın|botuna verildi|korumaya/.test(tr.ib) && !/handed to|Bought |Withdrew/.test(tr.ib) && /oyun parası/.test(tr.foot), JSON.stringify(tr));
  const leftEn=await p.evaluate(()=>{ const out=[]; const w=document.createTreeWalker($('#main'), NodeFilter.SHOW_TEXT); let n; while ((n=w.nextNode())){ const s=n.textContent.trim(); if (s.length>3 && /\b(the|your|and|with|order|price|cash|open)\b/i.test(s) && n.parentElement.closest(':not([hidden])') && !n.parentElement.closest('[hidden],.nw')) out.push(s); } return out; });
  check('no English sentences left on the Turkish board', leftEn.length===0, leftEn.slice(0,6).join(' | '));
  await p.screenshot({ path:OUT+'/live_tr.png' });
  for (const v of ['markets','crypto','bots','news','lab','arena','desk','journal','learn','welcome','report','challenge','trade','portfolio','settings']){ await p.evaluate(v=>location.hash='#'+v, v); await p.waitForTimeout(300);
    const le=await p.evaluate(()=>{ const out=[]; const w=document.createTreeWalker($('#main'), NodeFilter.SHOW_TEXT); let n; while ((n=w.nextNode())){ const s=n.textContent.trim(); if (s.length>3 && /\b(the|your|and|with|order|price|cash|open|amount|buy|sell|limit price)\b/i.test(s) && !n.parentElement.closest('[hidden],option,optgroup,.mk-nm,.tr-hits,#tr-det,#cx-tbl .muted,#tr-sym,.nw,.chip,#nw-body .mk-nm,#lb-mine')) out.push(s); } return out; });
    check(`no English left on the Turkish ${v} screen`, le.length===0, le.slice(0,6).join(' | ')); }
  await p.click('#lv-lang');
  // accessibility
  await p.addScriptTag({ content:fs.readFileSync(__dirname+'/../axe/node_modules/axe-core/axe.min.js','utf8') });
  for (const v of ['board','markets','crypto','bots','news','lab','arena','desk','journal','learn','welcome','report','challenge','trade','portfolio','settings']){ await p.evaluate(v=>location.hash='#'+v, v); await p.waitForTimeout(400);
    const ax=await p.evaluate(async()=>(await axe.run(document, { resultTypes:['violations'] })).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id+':'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')).join(', ')));
    check(`accessibility: no serious problems on ${v} (dark)`, ax.length===0, ax.join(' ')); }
  await p.click('#lv-theme'); await p.waitForTimeout(200);
  for (const v of ['board','markets','crypto','bots','news','trade']){ await p.evaluate(v=>location.hash='#'+v, v); await p.waitForTimeout(400);
    const ax=await p.evaluate(async()=>(await axe.run(document, { resultTypes:['violations'] })).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id+':'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')).join(', ')));
    check(`accessibility: no serious problems on ${v} (light)`, ax.length===0, ax.join(' ')); }
  // phone
  const ph=await b.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:1, isMobile:true, hasTouch:true }); const q=await ph.newPage(); q.on('pageerror', e=>errs.push(e.message)); await mocks(q, seen);
  for (const v of ['board','markets','crypto','bots','news','lab','arena','desk','journal','learn','welcome','report','challenge','trade','portfolio','settings']){ await q.goto(URL0+'#'+v); await q.waitForTimeout(['board','markets','crypto','bots','news'].includes(v) ? 5000 : 1500);
    const w=await q.evaluate(()=>({ sw:document.documentElement.scrollWidth, nav:getComputedStyle($('.lv-nav')).position })); check(`phone: no sideways scroll on ${v}`, w.sw<=390, JSON.stringify(w));
    if (['board','trade','markets','crypto','bots','news'].includes(v)) await q.screenshot({ path:OUT+'/live_phone_'+v+'.png', fullPage:false }); }
  await q.goto(URL0+'#trade'); await q.waitForTimeout(1500); await q.evaluate(()=>{ ST.sel='BTC'; ST.chart.inds=[{ k:'i1', id:'ema', p:{ n:20 }, c:{}, hide:false }, { k:'i2', id:'vol', p:{}, c:{}, hide:false }, { k:'i3', id:'rsi', p:{}, c:{}, hide:false }, { k:'i4', id:'macd', p:{}, c:{}, hide:false }]; save(); render(); });
  await q.waitForFunction(()=>!!$('#tr-chart svg.chart') && typeof CHM==='object' && CHM && CHM.panes && CHM.panes.length===4, null, { timeout:20000 }).catch(()=>{}); await q.waitForTimeout(400);
  const p3=await q.evaluate(()=>({ sw:document.documentElement.scrollWidth, panes:CHM && CHM.panes.length, svgW:Math.round($('#tr-chart svg.chart').getBoundingClientRect().right), tb:Math.round($('#tr-tf').getBoundingClientRect().right) }));
  check('phone: the chart with three sub-panes (volume, RSI, MACD) and its toolbar fit 390px with no sideways scroll', p3.sw<=390 && p3.panes===4 && p3.svgW<=390 && p3.tb<=390, JSON.stringify(p3));
  { // an old saved state (all 15 bots, loss limits and money handed to the Ensemble Council): the retired bots go, the money comes back
    const OLD=['trend','band','learn','knn','nb','mlp','forest','gbm','q','ga','bandit','rank','sector','council','regime'];
    const seed=await p.evaluate(OLD=>{ const S=JSON.parse(JSON.stringify(ST, (k,v)=>k==='buf' || k==='rb' ? undefined : v)); S.acct='main'; delete S.ch; if (S.accts){ S.accts={ main:S.accts.main }; } S.A=S.accts ? S.accts.main : S.A;
      S.ai=OLD.map(id=>AI_DEFS.some(d=>d.id===id) ? aiBot(id) : { id, on:true, A:brkNew(10000), meta:{}, log:[], think:{}, seen:{}, eqi:[], pnow:{}, model:id==='trend' || id==='band' ? null : { n:5, hits:[], seen:{} } });
      const m=brkNew(5000), q=quote('BTC'); brkOrder(m, { sym:'BTC', kind:'crypto', side:'b', usd:3000 }, q); S.mg=[{ bot:'council', A:m, in:5000, t:Date.now() }]; S.A.cash-=5000; if (S.accts) S.accts.main=S.A;
      S.botLim={ council:10, knn:5 }; S.botPeak={ council:12000, regime:1, knn:10000 }; S.edge={ ga:true, council:false, knn:false }; S.inbox=[]; S.trMsg={}; S.welcomed=true;
      return { json:JSON.stringify(S), cash:S.A.cash, mgE:brkEquity(m, quotesAll()), n:S.ai.length }; }, OLD);
    const mc=await b.newContext({ viewport:{ width:1280, height:900 } }); const mp=await mc.newPage(); mp.on('pageerror', e=>errs.push(e.message)); await mocks(mp, seen);
    await mp.addInitScript(j=>{ if (!sessionStorage.getItem('seeded')){ localStorage.setItem('tdl-state', j); sessionStorage.setItem('seeded', '1'); } }, seed.json);
    await mp.goto(URL0+'#bots'); await mp.waitForFunction(()=>!(ST.mg||[]).length, null, { timeout:90000 }).catch(()=>{});
    const mg3=await mp.evaluate(()=>{ const last=ST.inbox.filter(x=>/retired/.test(x.msg)).pop(), sv=ST.lang; ST.lang='tr'; const tr=last ? T(last.msg) : ''; ST.lang=sv; const main=(ST.accts && ST.accts.main) || ST.A;
      return { ids:ST.ai.map(b=>b.id).join(), mg:(ST.mg||[]).length, cash:main.cash, lim:Object.keys(ST.botLim||{}).join(), peak:Object.keys(ST.botPeak||{}).join(), edge:Object.keys(ST.edge||{}).join(), en:last ? last.msg : '', tr,
        saved:JSON.parse(localStorage.getItem('tdl-state')).ai.map(b=>b.id).join(), again:stRetireBots() }; });
    const back=mg3.cash-seed.cash;
    check('an old saved state with all 15 bots loads with only the 6 of the roster; their loss limits, peaks and edge flags go too (and running it again changes nothing)', seed.n===15 && mg3.ids==='knn,nb,forest,q,rank,sector' && mg3.saved===mg3.ids && !/council|regime|ga/.test(mg3.lim+mg3.peak+mg3.edge) && /knn/.test(mg3.lim) && mg3.again===false, JSON.stringify(mg3));
    check('…money handed to a retired bot (the Ensemble Council) comes back to the main cash at live prices, with an inbox note in English and Turkish', mg3.mg===0 && Math.abs(back-seed.mgE)<seed.mgE*.01 && /^Ensemble Council was retired/.test(mg3.en) && /^Ensemble Council kaldırıldı: .*nakdine döndü/.test(mg3.tr), JSON.stringify({ back:back.toFixed(2), was:seed.mgE.toFixed(2), en:mg3.en, tr:mg3.tr }));
    await mc.close(); }
  check('no script errors anywhere', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close(); console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);
})();

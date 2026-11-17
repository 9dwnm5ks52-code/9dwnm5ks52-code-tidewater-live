// Phoenix Finance Club: the whole site (Playwright). Crypto and US prices from the real public feeds; the club fund from a fixture
// (ds/srvdata/fund.json, served locally with ?srv=); GitHub's API, Alpaca and rss2json from stand-ins. No real token is ever used.
const { chromium } = require('playwright');
const fs = require('fs');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d?'  · '+d:'')); };
const ID='AKTEST', SEC='secret123', TOK='github_pat_TESTTOKEN0123456789abcdefABCDEF';
const CORS={ 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'GET,POST,OPTIONS' };
const SRVD='http://127.0.0.1:8766/srvdata/', URL0='http://127.0.0.1:8766/live.html?srv='+SRVD;
const OUT=process.argv[2]||'.';
// the club fund: the fixture, moved so that its last run was 2 minutes ago; the test changes FUND.f to play the club's job
const FIX0=JSON.parse(fs.readFileSync(__dirname+'/srvdata/fund.json','utf8'));
function fixNow(){ const f=JSON.parse(JSON.stringify(FIX0)), d=Date.now()-120e3-f.t; f.t+=d; f.created+=d; for (const x of f.fills) x.t+=d; for (const x of f.orders){ x.t+=d; if (x.ft) x.ft+=d; } for (const x of f.eq) x.t+=d; for (const k in f.done) f.done[k].t+=d; return f; }
const FUND={ f:fixNow(), loads:0 };
const GH={ calls:[], status:204 };
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
  // the club's data branch (the fixture) and GitHub's API (never the real one)
  await p.route(SRVD+'fund.json*', r=>{ FUND.loads++; r.fulfill({ status:200, contentType:'application/json', headers:CORS, body:JSON.stringify(FUND.f) }); });
  await p.route('https://api.github.com/**', async r=>{ const q=r.request(), u=new URL(q.url()); if (q.method()==='OPTIONS') return r.fulfill({ status:204, headers:CORS });
    GH.calls.push({ url:q.url(), method:q.method(), auth:q.headers()['authorization']||'', body:q.postData() });
    if (/\/dispatches$/.test(u.pathname)) return r.fulfill({ status:GH.status, headers:CORS, body:'' });
    if (/\/actions\/workflows\/club\.yml$/.test(u.pathname)) return r.fulfill({ status:200, headers:CORS, contentType:'application/json', body:JSON.stringify({ id:1, path:'.github/workflows/club.yml', state:'active' }) });
    if (/^\/repos\/[^/]+\/[^/]+$/.test(u.pathname)) return r.fulfill({ status:200, headers:CORS, contentType:'application/json', body:JSON.stringify({ full_name:'club-test/fund-test', permissions:{ admin:false, push:true, pull:true } }) });
    r.fulfill({ status:404, headers:CORS, body:'{}' }); });
  p.on('request', r=>{ const u=r.url(), hs=JSON.stringify(r.headers()); if (!u.startsWith('https://data.alpaca.markets') && (u.includes(SEC) || hs.includes(SEC))) seen.leak.push(u);
    if (u.includes(TOK) || (!u.startsWith('https://api.github.com/') && hs.includes(TOK))) seen.tokLeak.push(u); });
}
const dispatches=()=>GH.calls.filter(c=>c.method==='POST' && /\/dispatches$/.test(c.url));
const lastOrder=()=>{ const d=dispatches().pop(); const b=JSON.parse(d.body); return { url:d.url, auth:d.auth, ref:b.ref, cid:b.inputs.cid, order:JSON.parse(b.inputs.order) }; };
// play the club's job: the order of this client id is done
function jobDone(cid, res, fill){ const f=FUND.f; if (fill){ fill.id=f.nid++; fill.t=Date.now(); f.fills.push(fill); res.fid=fill.id; } f.done[cid]={ ...res, t:Date.now() }; f.t=Date.now(); f.seq++; }
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({ viewport:{ width:1400, height:1000 }, colorScheme:'dark' }); const p=await ctx.newPage();
  const errs=[], seen={ ap:0, leak:[], tokLeak:[] }, dialogs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('dialog', d=>{ dialogs.push(d.message()); d.dismiss().catch(()=>{}); });
  p.on('console', m=>{ if (m.type()==='error' && !/Failed to load resource/.test(m.text())) console.log('CONSOLE', m.text().slice(0,400)); }); await mocks(p, seen);
  await p.goto(URL0); await p.evaluate(()=>localStorage.clear()); await p.reload();
  await p.waitForTimeout(600); const lp=await p.evaluate(()=>({ hash:location.hash, board:!$('#v-board').hidden, welcome:!!$('#v-welcome') }));
  check('a first visit lands on the Board (no welcome page)', !lp.welcome && lp.board && (lp.hash==='' || lp.hash==='#board'), JSON.stringify(lp));
  const lk=await p.evaluate(()=>({ theme:document.documentElement.dataset.tdxTheme, bg:getComputedStyle(document.body).backgroundColor, font:getComputedStyle(document.body).fontFamily, navIn:!!$('.lv-top .lv-nav'), navPos:getComputedStyle($('.lv-nav')).position, top:getComputedStyle($('.lv-top')).position, h:Math.round($('.lv-top').getBoundingClientRect().height), icons:getComputedStyle($('.lv-nav a svg')).display, skin:[...document.styleSheets].some(x=>[...x.cssRules].some(r=>/--hero-bg|--card-bg/.test(r.cssText))) }));
  check('the look: light theme by default (even when the system prefers dark), Inter, a sticky ~52px top bar holding the text menu (no icon rail), no navy glass skin left', lk.theme==='light' && lk.bg==='rgb(245, 245, 247)' && /Inter/.test(lk.font) && lk.navIn && lk.navPos==='static' && lk.top==='sticky' && lk.h>=50 && lk.h<=56 && lk.icons==='none' && !lk.skin, JSON.stringify(lk));
  await p.waitForFunction(()=>CLUB.fund && LIVE.status==='live' && LIVE_CRYPTO.every(d=>LIVE.q[d.sym] && LIVE.q[d.sym].last>0) && MKT.list.length>5000 && CX.list.length>20, null, { timeout:45000 }); await p.waitForTimeout(1200);
  // the Board is the fund's home page
  const bd=await p.evaluate(()=>{ const E=fundEq(quotesAll()); return { seq:ST.A.seq, E, eq:$('#b-eq').textContent, nw:$('#lv-nw').textContent, money:money(E), tiles:$$('#bd .bd-t').length, map:$$('#b-map [data-sym]').length, trades:$$('#b-trades li').length, perf:!!$('#b-perf svg'), leg:$('#b-perf .pf-leg') && $('#b-perf .pf-leg').textContent, today:$('#hm-say').textContent, upd:$('#b-upd').textContent, cash:$('#b-cashv').textContent, vs:$('#b-vs').textContent, vsGo:($('#t-vs a[href="#trade"]')||{}).textContent, pills:$$('#bd [data-brange]').map(b=>b.dataset.brange+':'+b.getAttribute('aria-pressed')).join(), dark:getComputedStyle($('#t-today')).backgroundColor, mood:$('#m-v').textContent }; });
  check('the Board shows the club fund from fund.json: its value (live prices), cash, recent trades, the range pills and a chart against the S&P 500 and Bitcoin, the dark “Today in one look”, market mood, the blue “against the S&P 500” card with Trade, the market map and the other tiles', bd.seq===1234 && bd.eq===bd.money && bd.nw===bd.money && bd.E>50000 && bd.trades===3 && bd.perf && /S&P 500/.test(bd.leg) && /Bitcoin/.test(bd.leg) && /run 1234/.test(bd.upd) && bd.map===26 && bd.tiles===11 && /^\$[\d,.]+$/.test(bd.cash) && /points (ahead|behind)/.test(bd.vs) && bd.vsGo==='Trade' && bd.pills==='all:true,1m:false,1w:false,1d:false' && bd.dark==='rgb(29, 29, 31)' && /^\d+$/.test(bd.mood), JSON.stringify({ ...bd, today:undefined }));
  { const d0=await p.evaluate(()=>$('#b-perf path.hf-line').getAttribute('d')); await p.click('#bd [data-brange="1w"]'); await p.waitForTimeout(250);
    const r1=await p.evaluate(()=>({ d:($('#b-perf path.hf-line')||{ getAttribute:()=>'' }).getAttribute('d'), pressed:$('#bd [data-brange="1w"]').getAttribute('aria-pressed'), all:$('#bd [data-brange="all"]').getAttribute('aria-pressed'), st:ST.brange, x0:+(($('#b-perf path.hf-line')||{ getAttribute:()=>'M0,0' }).getAttribute('d').match(/^M([\d.]+)/)||[])[1] }));
    await p.click('#bd [data-brange="1d"]'); await p.waitForTimeout(250); const r2=await p.evaluate(()=>({ d:($('#b-perf path.hf-line')||{ getAttribute:()=>'' }).getAttribute('d'), empty:($('#b-perf .empty')||{}).textContent||'' }));
    await p.click('#bd [data-brange="all"]'); await p.waitForTimeout(250); const d3=await p.evaluate(()=>$('#b-perf path.hf-line').getAttribute('d'));
    check('the Board’s range pills (Start / 1 month / 1 week / Today) really switch the chart’s range over fund.eq', d0 && r1.d && r1.d!==d0 && r1.pressed==='true' && r1.all==='false' && r1.st==='1w' && (r2.d ? r2.d!==r1.d : !!r2.empty) && d3===d0, JSON.stringify({ d0:d0.length, d1:r1.d.length, r1:{ ...r1, d:undefined }, d2:r2.d.length, empty:r2.empty, same:d3===d0 })); }
  check('“Today in one look” is about the fund: its value, today’s change, best and worst holding, the next US release; no strategies', /The fund is worth \$[\d,.]+/.test(bd.today) && /Today: /.test(bd.today) && /Best holding today: .+; worst: /.test(bd.today) && !/strateg|Desk/i.test(bd.today), bd.today);
  const gone=await p.evaluate(()=>({ nav:$$('.lv-nav a').map(a=>a.dataset.nav).join(), views:['bots','desk','journal','lab','arena','learn','welcome','challenge'].filter(v=>$('#v-'+v)).join(), fns:['aiStart','aiTick','renderBots','renderDesk','renderLab','renderArena','renderJournal','renderLearn','renderChallenge','renderWelcome','futTick','mgSync','dlyToday','botBoard','bkDownload','ntfySend','brkOCO','brkMark'].filter(n=>typeof window[n]!=='undefined').join(), arena:typeof ARENA_SNAP!=='undefined' || typeof DAILY_SNAP!=='undefined' }));
  await p.evaluate(()=>location.hash='#bots'); await p.waitForTimeout(200); const toBoard=await p.evaluate(()=>!$('#v-board').hidden);
  check('the bots, Strategy Desk, Arena, Lab, Academy, Challenge, Journal, futures and the welcome page are gone (an old #bots link shows the Board)', gone.nav==='board,portfolio,trade,markets,crypto,news,settings' && !gone.views && !gone.fns && !gone.arena && toBoard, JSON.stringify(gone));
  const ro=await p.evaluate(()=>{ const s=JSON.stringify(ST.A); return new Promise(r=>setTimeout(()=>r({ same:s===JSON.stringify(ST.A), stored:'A' in JSON.parse(localStorage.getItem('tdl-state')||'{}') || /"fills"/.test(localStorage.getItem('tdl-state')||'') }), 4000)); });
  check('the page never changes the fund itself and does not store it in the browser', ro.same && !ro.stored, JSON.stringify(ro));
  // everyone can browse; only members can trade
  await p.click('#b-map [data-sym="ETH"]'); await p.waitForTimeout(400);
  const qk=await p.evaluate(()=>({ hash:location.hash, sel:ST.sel, quick:!!$('#t-quick') }));
  check('a market-map tile opens the Trade screen on that coin (no quick-trade tile on the Board any more)', qk.hash==='#trade' && qk.sel==='ETH' && !qk.quick, JSON.stringify(qk));
  await p.click('.lv-nav a[data-nav="trade"]'); await p.selectOption('#tr-sym', 'BTC'); await p.waitForTimeout(2500);
  const tv=await p.evaluate(()=>({ chart:!!$('#tr-chart svg.chart'), candles:$$('#tr-chart rect').length, book:$$('#tr-book .book tr.ask').length, pxHidden:getComputedStyle($('#tk-pxw')).display==='none', lock:!$('#tk-lock').hidden && /Only club members can trade/.test($('#tk-lock').textContent) && !!$('#tk-lock a[href="#settings"]'), go:$('#tk-go').disabled, cancel:$$('#tr-ord [data-cancel]').length, orders:$$('#tr-ord tbody tr').length, sides:$$('#tk-side [data-side]').map(x=>x.dataset.side).join(), types:$$('#tk-type [data-type]').map(x=>x.dataset.type).join(), note:$('#tk-note').maxLength }));
  check('the trade screen shows minute candles and the live Binance order book; the price field hides for market orders', tv.chart && tv.candles>10 && tv.book===8 && tv.pxHidden, JSON.stringify(tv));
  check('the ticket (buy, sell, short, cover; market, limit, stop; a 280-character note) is locked without a token, with the members-only message and a link to Settings; open orders show without cancel buttons', tv.lock && tv.go && tv.cancel===0 && tv.orders===3 && tv.sides==='buy,sell,short,cover' && tv.types==='mkt,lmt,stp' && tv.note===280, JSON.stringify(tv));
  check('nothing was sent to GitHub without a token', GH.calls.length===0, GH.calls.length);
  // the Crypto screen: a market screen
  await p.click('.lv-nav a[data-nav="crypto"]'); await p.waitForTimeout(500);
  const cx=await p.evaluate(()=>({ coins:$$('#cx-tbl tbody tr').length, first:$('#cx-tbl tbody tr a').textContent, tiles:$$('#cx-top .bd-t').length, fng:CX.fng.length, glob:!!(CX.glob && CX.glob.cap), bots:!!$('#ai-mini'), stable:CX.list.some(d=>/^(USDT|USDC|DAI|USDE)$/.test(d.sym)) }));
  check('Crypto shows the top coins live (no stablecoins) and the market mood, without any bots', cx.coins>=40 && cx.first==='BTC' && cx.tiles===4 && cx.fng>=7 && cx.glob && !cx.bots && !cx.stable, JSON.stringify(cx));
  await p.click('[data-cxs="up"]'); await p.waitForTimeout(200);
  const ups=await p.evaluate(()=>{ const r=cxRows({}).filter(d=>d.c24!=null); return r.slice(0,20).every((d,i,a)=>!i || a[i-1].c24>=d.c24); }); check('coins sort by today’s rise', ups);
  await p.click('[data-cxs="rank"]'); const extra=await p.evaluate(()=>CX.list.find(d=>!d.core && LIVE.q[d.sym] && LIVE.q[d.sym].last>0).sym);
  await p.click(`#cx-tbl a[data-go="${extra}"]`); await p.waitForTimeout(2500);
  const xb=await p.evaluate(s=>({ sel:ST.sel, kind:IM[s] && IM[s].kind, chart:!!$('#tr-chart svg.chart'), book:$$('#tr-book tr').length }), extra);
  check(`a coin outside the main twelve (${extra}) opens with its chart and live book`, xb.sel===extra && xb.kind==='crypto' && xb.chart && xb.book>=3, JSON.stringify(xb));
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
  check('the Board shows five headlines and the coming reports', bn.news===5 && bn.earn>=1, JSON.stringify(bn));
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
  // US stocks: real time through Settings
  await p.click('.lv-nav a[data-nav="settings"]'); await p.fill('#set-ap-id', ID); await p.fill('#set-ap-sec', 'wrong'); await p.click('#set-save');
  await p.waitForFunction(()=>/refused/.test($('#set-msg').textContent), null, { timeout:8000 });
  check('wrong keys are reported as refused', true, await p.textContent('#set-msg'));
  await p.fill('#set-ap-sec', SEC); await p.click('#set-save'); await p.waitForFunction(()=>/Connected to Alpaca/.test($('#set-msg').textContent), null, { timeout:8000 });
  const us=await p.evaluate(()=>({ n:LIVE_US.filter(d=>quote(d.sym)).length, rt:LIVE_US.every(d=>!quote(d.sym).delayed) && quote('COST').delayed, secField:$('#set-ap-sec').value, stored:!!localStorage.getItem('tdl-ap-secret'), inState:localStorage.getItem('tdl-state').includes('secret123') }));
  check('good Alpaca keys switch the 14 big names to real time; the secret box is cleared and the key is kept only in its own browser slot', us.n===14 && us.rt && us.secField==='' && us.stored && !us.inState, JSON.stringify(us));
  // member access: the token lives in one localStorage key; the repository can be set for testing
  await p.evaluate(()=>location.hash='#settings'); await p.waitForTimeout(400);
  const ma=await p.evaluate(()=>({ h:$('#set-club h2').textContent, type:$('#club-tok').type, how:$('#set-club .club-how ol').textContent, st:$('#club-st').textContent }));
  check('Settings has “Member access”: a password field, Save / Check / Remove, and how to make a fine-grained token (this repository only, Actions read and write)', ma.h==='Member access' && ma.type==='password' && /Only select repositories/.test(ma.how) && /Actions: “Read and write”/.test(ma.how) && /collaborator/.test(ma.how) && /not your real name/.test(ma.how) && /View only/.test(ma.st), JSON.stringify(ma));
  await p.fill('#club-tok', 'not a token'); await p.click('#club-save'); await p.waitForTimeout(150);
  check('something that is not a token is refused', await p.evaluate(()=>!localStorage.getItem('pfc-member-token') && /does not look like/.test($('#club-msg').textContent)));
  await p.evaluate(()=>{ $('#set-club details:last-of-type').open=true; }); await p.fill('#club-owner', 'club-test'); await p.fill('#club-repo', 'fund-test'); await p.click('#club-repo-save'); await p.waitForTimeout(150);
  await p.fill('#club-tok', TOK); await p.click('#club-save'); await p.waitForTimeout(200);
  const tk=await p.evaluate(T=>({ ls:localStorage.getItem('pfc-member-token')===T, keys:Object.keys(localStorage).filter(k=>(localStorage.getItem(k)||'').includes(T)), field:$('#club-tok').value, repo:clubRepo(), st:$('#club-st').textContent }), TOK);
  check('a member token is saved only under its own localStorage key (not in the site state), and the field is cleared', tk.ls && tk.keys.join()==='pfc-member-token' && tk.field==='' && tk.repo.owner==='club-test' && /member token is saved/.test(tk.st), JSON.stringify({ ...tk, keys:tk.keys }));
  await p.click('#club-check'); await p.waitForFunction(()=>/Works|GitHub/.test($('#club-msg').textContent) && !/Checking/.test($('#club-msg').textContent), null, { timeout:5000 }).catch(()=>{});
  const ck=GH.calls.filter(c=>c.method==='GET');
  check('Check asks GitHub about the repository and its club workflow with the token in the Authorization header only', /Works: you are a club member/.test(await p.textContent('#club-msg')) && ck.length===2 && ck.every(c=>c.auth==='Bearer '+TOK && !c.url.includes(TOK)) && /\/repos\/club-test\/fund-test$/.test(ck[0].url) && /actions\/workflows\/club\.yml$/.test(ck[1].url), JSON.stringify(ck.map(c=>c.url)));
  // a member's order: dispatched to GitHub, then the result is read from fund.json
  await p.evaluate(()=>{ CLUB.POLL=400; }); await p.evaluate(()=>location.hash='#trade'); await p.selectOption('#tr-sym', 'BTC'); await p.waitForTimeout(800);
  const un=await p.evaluate(()=>({ lock:$('#tk-lock').hidden, go:$('#tk-go').disabled, cancel:$$('#tr-ord [data-cancel]').length }));
  check('with a token the ticket unlocks and open orders get cancel buttons', un.lock && !un.go && un.cancel===3, JSON.stringify(un));
  await p.click('#tk-side [data-side="buy"]'); await p.click('#tk-type [data-type="mkt"]'); await p.click('#tk-unit [data-unit="usd"]'); await p.fill('#tk-amt', '1000'); await p.fill('#tk-note', '  Bitcoin   thesis: <b>halving</b>  ');
  await p.click('#tk-go'); await p.waitForTimeout(400);
  let d=lastOrder(); const sent=await p.evaluate(()=>({ msg:$('#tk-msg').textContent, go:$('#tk-go').disabled, goT:$('#tk-go').textContent, pend:ST.pend.length, note:$('#tk-note').value }));
  check('Buy sends POST …/actions/workflows/club.yml/dispatches {ref:"main", inputs:{order, cid}} with the member’s token, and no price', /^https:\/\/api\.github\.com\/repos\/club-test\/fund-test\/actions\/workflows\/club\.yml\/dispatches$/.test(d.url) && d.auth==='Bearer '+TOK && d.ref==='main' && /^c[a-z0-9]+-[a-z0-9]+$/.test(d.cid) && JSON.stringify(d.order)===JSON.stringify({ sym:'BTC', kind:'crypto', side:'buy', type:'mkt', usd:1000, note:'Bitcoin thesis: <b>halving</b>' }), JSON.stringify(d));
  check('…and says GitHub is executing it (about 1 minute) while it waits', /Sent\. GitHub is executing it \(about 1 minute\)/.test(sent.msg) && sent.go && /Waiting for GitHub/.test(sent.goT) && sent.pend===1 && sent.note==='', JSON.stringify(sent));
  const loads0=FUND.loads; await p.waitForTimeout(1300);
  check('it polls fund.json while waiting', FUND.loads-loads0>=2, FUND.loads-loads0);
  jobDone(d.cid, { ok:true, msg:'Bought 0.015 BTC at an average of $65000.00.', tr:'BTC alındı: 0.015 adet, ortalama $65000.00.', oid:99 }, { oid:99, sym:'BTC', kind:'crypto', side:'b', type:'mkt', q:0.015, px:65000, fee:0.98, parts:[{ px:64999, q:0.01, book:true }, { px:65002, q:0.005, book:true }], pl:null, note:'Bitcoin thesis: <b>halving</b>' });
  await p.waitForFunction(()=>!ST.pend.length, null, { timeout:5000 }).catch(()=>{}); await p.waitForTimeout(300);
  const got=await p.evaluate(()=>({ msg:$('#tk-msg').textContent, oj:!!$('#tk-oj .oj') && $$('#tk-oj .oj li').length, inbox:ST.inbox.some(x=>/Bought 0.015 BTC/.test(x.msg)), go:$('#tk-go').disabled, hist:$('#b-trades') ? 1 : 0 }));
  check('polling picks up done[cid]: the result shows on the ticket with how it walked the order book, and lands in the inbox', /Bought 0\.015 BTC at an average of \$65000\.00/.test(got.msg) && got.oj===2 && got.inbox && !got.go, JSON.stringify(got));
  // other order kinds: the same path, with the right fields
  await p.selectOption('#tr-sym', 'DOGE'); await p.waitForTimeout(800); await p.click('#tk-side [data-side="short"]'); await p.click('#tk-type [data-type="lmt"]'); await p.click('#tk-unit [data-unit="qty"]'); await p.fill('#tk-amt', '50000'); const lpx=+(await p.inputValue('#tk-px')); await p.click('#tk-go'); await p.waitForTimeout(300);
  d=lastOrder(); check('a short limit order is sent with side short, a quantity and its limit price (taken from the ticket)', d.order.side==='short' && d.order.type==='lmt' && d.order.sym==='DOGE' && d.order.q===50000 && d.order.px===lpx && lpx>0 && !('usd' in d.order), JSON.stringify(d.order));
  jobDone(d.cid, { ok:false, msg:'No price for DOGE right now: the symbol is unknown or the data source did not answer. Nothing was traded.', tr:'DOGE için şu an fiyat yok: sembol bilinmiyor ya da veri kaynağı yanıt vermedi. İşlem yapılmadı.' }); await p.waitForFunction(()=>!ST.pend.length, null, { timeout:5000 }).catch(()=>{}); await p.waitForTimeout(200);
  check('…and a refusal from the club’s job is shown with its reason', /No price for DOGE right now/.test(await p.textContent('#tk-msg')));
  await p.selectOption('#tr-sym', 'BTC'); await p.waitForTimeout(600); const n0=dispatches().length; await p.click('#tk-side [data-side="sell"]'); await p.click('#tk-type [data-type="mkt"]'); await p.fill('#tk-amt', '50'); await p.click('#tk-go'); await p.waitForTimeout(300);
  check('an order that cannot work (selling more BTC than the fund holds) is stopped in the page with the reason, and not sent', dispatches().length===n0 && /free to sell/.test(await p.textContent('#tk-msg')), await p.textContent('#tk-msg'));
  await p.click('#tk-side [data-side="cover"]'); await p.click('#tk-go'); await p.waitForTimeout(200);
  check('cover with no short in that symbol is stopped too', dispatches().length===n0 && /not short BTC/.test(await p.textContent('#tk-msg')), await p.textContent('#tk-msg'));
  await p.selectOption('#tr-sym', 'TSLA'); await p.waitForTimeout(600); await p.click('#tk-side [data-side="sell"]'); await p.click('#tk-side [data-side="cover"]'); await p.waitForTimeout(100);
  const cv=await p.evaluate(()=>({ amt:+$('#tk-amt').value, unit:ST.unit }));
  await p.click('#tk-type [data-type="stp"]'); await p.click('#tk-go'); await p.waitForTimeout(300);
  d=lastOrder(); check('Cover on a short fills in the whole short (15 TSLA) and sends a cover order (here a stop)', cv.amt===15 && cv.unit==='qty' && d.order.side==='cover' && d.order.sym==='TSLA' && d.order.kind==='stock' && d.order.type==='stp' && d.order.q===15 && d.order.px>0, JSON.stringify({ cv, o:d.order }));
  await p.evaluate(()=>{ CLUB.WAIT=1500; }); await p.waitForTimeout(2600);
  check('if GitHub has not answered within the wait (5 minutes), the ticket says so and that it may still run', /No answer after 5 minutes/.test(await p.textContent('#tk-msg')), await p.textContent('#tk-msg'));
  jobDone(d.cid, { ok:true, msg:'Stop placed: cover 15 TSLA if it trades at $420.', tr:'Stop verildi: TSLA $420 fiyatına gelirse 15 adet geri al (açığı kapat).' }); await p.evaluate(()=>{ CLUB.WAIT=5*60e3; fundLoad(true); }); await p.waitForTimeout(500);
  check('…and a late result is still picked up when the fund reloads', /Stop placed: cover 15 TSLA/.test(await p.textContent('#tk-msg')) && await p.evaluate(()=>!ST.pend.length), await p.textContent('#tk-msg'));
  // cancel
  await p.click('#tr-ord [data-cancel="19"]'); await p.waitForTimeout(300); d=lastOrder();
  check('Cancel on an open order sends {cancel: id}', JSON.stringify(d.order)==='{"cancel":19}', JSON.stringify(d.order));
  jobDone(d.cid, { ok:true, msg:'Order #19 cancelled.', tr:'#19 numaralı emir iptal edildi.' }); FUND.f.orders.find(o=>o.id===19).status='cancelled'; await p.waitForTimeout(1200);
  check('…and the order leaves the open orders once the job has cancelled it', await p.evaluate(()=>!$('#tr-ord [data-cancel="19"]') && /Order #19 cancelled/.test($('#tk-msg').textContent)));
  // GitHub says no
  GH.status=401; await p.selectOption('#tr-sym', 'ETH'); await p.waitForTimeout(500); await p.click('#tk-side [data-side="buy"]'); await p.click('#tk-type [data-type="mkt"]'); await p.click('#tk-unit [data-unit="usd"]'); await p.fill('#tk-amt', '100'); await p.click('#tk-go'); await p.waitForTimeout(400); GH.status=204;
  check('a token GitHub refuses (401) is explained, and nothing is left waiting', /refused the token/.test(await p.textContent('#tk-msg')) && await p.evaluate(()=>!ST.pend.length), await p.textContent('#tk-msg'));
  check('the token never appears in a URL or in any request to anywhere but api.github.com', seen.tokLeak.length===0 && GH.calls.every(c=>!c.url.includes(TOK)), seen.tokLeak.join(' '));
  // notes are text, never HTML (a stored script would let one member steal another member's token)
  FUND.f.fills.push({ id:FUND.f.nid++, oid:500, sym:'AAPL', kind:'stock', side:'b', type:'mkt', q:1, px:350, fee:0, t:Date.now(), parts:[{ px:350, q:1 }], pl:null, note:'<img src=x onerror=alert(1)>' });
  FUND.f.orders.push({ id:FUND.f.nid++, sym:'AAPL', kind:'stock', side:'b', type:'lmt', q:1, px:100, status:'open', t:Date.now(), note:'<img src=x onerror=alert(2)><script>alert(3)</script>' }); await p.evaluate(()=>fundLoad(true)); await p.waitForTimeout(500);
  await p.evaluate(()=>location.hash='#portfolio'); await p.waitForTimeout(600);
  const xs=await p.evaluate(()=>({ img:$$('#main img').length, txt:$('#pf-fills').textContent.includes('<img src=x onerror=alert(1)>'), ord:$('#pf-ord').textContent.includes('<script>alert(3)</script>'), board:(()=>{ location.hash='#board'; return 0; })() }));
  await p.waitForTimeout(600); const xb2=await p.evaluate(()=>({ img:$$('#main img').length, txt:$('#b-trades').textContent.includes('<img src=x onerror=alert(1)>') }));
  check('a note containing <img src=x onerror=alert(1)> shows as text in the trade history, open orders and on the Board; no element is created and no script runs', xs.img===0 && xs.txt && xs.ord && xb2.img===0 && xb2.txt && dialogs.length===0, JSON.stringify({ xs, xb2, dialogs }));
  // the watchlist and alerts (kept in this browser)
  await p.evaluate(()=>location.hash='#trade'); await p.selectOption('#tr-sym', 'ETH'); await p.waitForTimeout(800);
  if (!(await p.evaluate(()=>wlHas('ETH')))) await p.click('#tr-star'); const wl=await p.evaluate(()=>({ has:wlHas('ETH'), star:$('#tr-star').textContent }));
  await p.selectOption('#al-kind', 'below'); await p.evaluate(()=>{ $('#al-v').value=String(+(quote('ETH').last*.9).toFixed(2)); }); await p.click('#al-go'); await p.waitForTimeout(150);
  const al0=await p.evaluate(()=>({ n:ST.alerts.filter(a=>a.sym==='ETH' && a.on).length, mine:$$('#al-mine li').length }));
  await p.evaluate(()=>{ const a=ST.alerts.find(x=>x.sym==='ETH' && x.on); a.v=quote('ETH').last*1.5; alCheck(quotesAll()); });
  const al1=await p.evaluate(()=>({ on:ST.alerts.filter(a=>a.sym==='ETH' && a.on).length, inbox:ST.inbox.some(x=>x.ico==='🔔') }));
  check('the star puts a coin on the watchlist, and an alert can be set on it and fires once its price is reached', wl.has && wl.star==='★' && al0.n===1 && al0.mine===1 && al1.on===0 && al1.inbox, JSON.stringify({ wl, al0, al1 }));
  // the Portfolio: the fund, public
  await p.click('.lv-nav a[data-nav="portfolio"]'); await p.waitForTimeout(500);
  const pf=await p.evaluate(()=>({ tiles:$$('#pf-perf .pf-t').length, chart:!!$('#pf-perf svg'), leg:($('#pf-perf .pf-leg')||{}).textContent||'', pos:$$('#pf-pos tbody tr').length, ord:$$('#pf-ord tbody tr').length, fills:$$('#pf-fills tbody tr').length, head:$$('#pf-fills thead th').map(x=>x.textContent).join(','), short:/Tesla\s*TSLA · short/.test($('#pf-pos').innerText), notes:$$('#pf-fills .tr-note').filter(x=>x.textContent.length>3).length, wl:$$('#wl-list tbody tr').length, al:$$('#al-list li').length, reset:!!$('#pf-reset'), mg:!!$('#pf-mg') }));
  check('Portfolio shows the fund’s performance (9 measures and the chart against the S&P 500 and Bitcoin), holdings (a short marked), open orders and the trade history with notes', pf.tiles===9 && pf.chart && /S&P 500/.test(pf.leg) && pf.pos===7 && pf.ord>=3 && pf.fills>=11 && pf.head==='Time,Symbol,Action,Quantity,Price,Value,Profit/loss,Note' && pf.short && pf.notes>=8 && !pf.reset && !pf.mg, JSON.stringify(pf));
  check('…and your own watchlist and alerts', pf.wl>=1 && pf.al>=1, JSON.stringify({ wl:pf.wl, al:pf.al }));
  { // the company drawer: a dialog from a holding, four tabs, Esc closes it and the focus goes back
    await p.focus('#pf-pos button[data-dw="AAPL"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(450);
    const dw=await p.evaluate(()=>{ const d=$('#dw-p'); return { shown:!$('#dw').hidden && getComputedStyle($('#dw')).display!=='none', role:d.getAttribute('role'), modal:d.getAttribute('aria-modal'), lab:($('#'+d.getAttribute('aria-labelledby'))||{}).textContent, tabs:$$('#dw-tabs [role="tab"]').map(x=>x.textContent).join(','), sel:$('#dw-tabs [aria-selected="true"]').textContent, inside:d.contains(document.activeElement), inert:$('.lv-shell').hasAttribute('inert'), px:$('#dw-px').textContent, tiles:$$('#dw-body .dw-tile').length, buy:($('#dw-p .dw-buy')||{}).textContent, op:getComputedStyle(d).opacity }; });
    check('Portfolio: Enter on a holding opens the company drawer (role=dialog, aria-modal, labelled) with its price and the tabs Fundamentals / News / Chart / Our trades; the page behind is inert', dw.shown && dw.role==='dialog' && dw.modal==='true' && /Apple/.test(dw.lab) && dw.tabs==='Fundamentals,News,Chart,Our trades' && dw.sel==='Fundamentals' && dw.inside && dw.inert && /\$/.test(dw.px) && dw.buy==='Buy' && dw.op==='1', JSON.stringify(dw));
    await p.waitForFunction(()=>$$('#dw-body .dw-tile').length===6 || /unavailable/.test($('#dw-body').textContent), null, { timeout:15000 }).catch(()=>{});
    const fd=await p.evaluate(()=>({ tiles:$$('#dw-body .dw-tile').length, all:($('#dw-body [data-dw-all]')||{}).textContent||'' })); await p.click('#dw-body [data-dw-all]').catch(()=>{}); await p.waitForTimeout(200);
    const fd2=await p.evaluate(()=>({ groups:$$('#dw-body .fd-g').length, exp:($('#dw-body [data-dw-all]')||{ getAttribute:()=>'' }).getAttribute('aria-expanded') }));
    check('…Fundamentals: six key tiles from the screener and a button to all the items', fd.tiles===6 && /See all \d+ items/.test(fd.all) && fd2.groups>=5 && fd2.exp==='true', JSON.stringify({ fd, fd2 }));
    // keyboard: the tabs move with the arrow keys, Tab stays in the dialog
    await p.focus('#dw-t-fund'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150); const kn=await p.evaluate(()=>({ tab:DW.tab, focus:document.activeElement.id }));
    for (let i=0; i<25; i++) await p.keyboard.press('Tab'); const trap=await p.evaluate(()=>$('#dw-p').contains(document.activeElement));
    check('…the tabs follow the arrow keys and Tab stays inside the drawer', kn.tab==='news' && kn.focus==='dw-t-news' && trap, JSON.stringify({ kn, trap }));
    await p.click('#dw-t-chart'); await p.waitForTimeout(300); const ch=await p.evaluate(()=>({ svg:!!$('#dw-body svg'), perf:!!$('#dw-body .perf-l'), open:!!$('#dw-body [data-dw-trade="chart"]') }));
    await p.click('#dw-t-news'); await p.waitForFunction(()=>$$('#dw-body .nw li').length>=3, null, { timeout:15000 }).catch(()=>{}); const nn=await p.evaluate(()=>$$('#dw-body .nw li').length);
    check('…Chart shows a small chart (or how it did over time) and News that company’s headlines', (ch.svg || ch.perf) && ch.open && nn>=3, JSON.stringify({ ch, nn }));
    await p.click('#dw-t-trades'); await p.waitForTimeout(300);
    const ot=await p.evaluate(()=>({ img:$$('#dw-p img').length, txt:$('#dw-body').textContent.includes('<img src=x onerror=alert(1)>'), ord:$('#dw-body').textContent.includes('<script>alert(3)</script>'), n:$$('#dw-body .dw-tr li').length }));
    check('…Our trades lists the fund’s fills and open orders in it, and a note with <img src=x onerror=alert(1)> renders as text', ot.img===0 && ot.txt && ot.ord && ot.n>=2 && dialogs.length===0, JSON.stringify({ ot, dialogs }));
    await p.addScriptTag({ content:fs.readFileSync(__dirname+'/../axe/node_modules/axe-core/axe.min.js','utf8') });
    const axd=async()=>p.evaluate(async()=>(await axe.run(document, { resultTypes:['violations'] })).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id+':'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')).join(', ')));
    const a1=await axd(); await p.evaluate(()=>{ ST.theme='dark'; applyTheme(); render(); }); await p.waitForTimeout(300); const a2=await axd(); await p.evaluate(()=>{ ST.theme='light'; applyTheme(); render(); }); await p.waitForTimeout(200);
    check('accessibility: no serious problems with the drawer open (light and dark)', !a1.length && !a2.length, a1.concat(a2).join(' '));
    await p.keyboard.press('Escape'); await p.waitForTimeout(450);
    const cl=await p.evaluate(()=>({ hidden:$('#dw').hidden, focus:document.activeElement && document.activeElement.dataset.dw, inert:$('.lv-shell').hasAttribute('inert') }));
    check('…Esc closes it and the focus goes back to the holding', cl.hidden && cl.focus==='AAPL' && !cl.inert, JSON.stringify(cl));
    await p.click('#pf-pos tr[data-dw="BTC"] td:last-child'); await p.waitForTimeout(450);
    const bt=await p.evaluate(()=>({ open:DW.open, sym:DW.sym, fund:$('#dw-body').textContent }));
    await p.click('#dw-p [data-dw-x]'); await p.waitForTimeout(450); const bx=await p.evaluate(()=>({ hidden:$('#dw').hidden, focus:document.activeElement && document.activeElement.dataset.dw }));
    await p.click('#pf-pos button[data-dw="BTC"]'); await p.waitForTimeout(450); await p.click('#dw-p .dw-sell'); await p.waitForTimeout(500);
    const bs=await p.evaluate(()=>({ hash:location.hash, sel:ST.sel, side:ST.side, open:DW.open }));
    check('a click anywhere on a row opens it too; a coin gets a friendly line instead of company numbers; × closes it; Sell goes to the Trade screen with the coin and the side set', bt.open && bt.sym==='BTC' && /is a coin, not a company/.test(bt.fund) && bx.hidden && bx.focus==='BTC' && bs.hash==='#trade' && bs.sel==='BTC' && bs.side==='sell' && !bs.open, JSON.stringify({ bt:{ ...bt, fund:bt.fund.slice(0,60) }, bx, bs }));
    await p.evaluate(()=>{ location.hash='#portfolio'; }); await p.waitForTimeout(300); }
  // the report: the fund against the S&P 500 by default
  await p.click('#pf-perf .bd-th a[href="#report"], .pf-pn a[href="#report"]').catch(()=>p.evaluate(()=>location.hash='#report')); await p.waitForTimeout(800);
  const rpx=await p.evaluate(()=>({ hash:location.hash, svgs:$$('.rp-sheet svg').length, a:$('#rp-a').value, b:$('#rp-b').value, opts:$$('#rp-a option').map(o=>o.value).join(), sharpe:/Sharpe/.test($('.rp-sheet').innerText), heat:$$('.rp-heat td').length, title:$('.rp-head h2').textContent }));
  check('the performance report is about the fund and compares it with the S&P 500 (or Bitcoin) from the saved prices', rpx.hash==='#report' && rpx.svgs>=2 && rpx.heat>0 && rpx.a==='fund' && rpx.b==='spy' && rpx.opts==='fund,spy,btc' && rpx.sharpe && /S&P 500/.test(rpx.title), JSON.stringify(rpx));
  { // the pro chart: timeframes, indicators, settings, templates, zoom, crosshair, drawings, chart types, PNG export
  await p.evaluate(()=>{ location.hash='#trade'; }); await p.waitForTimeout(500); await p.selectOption('#tr-sym', 'BTC'); await p.waitForTimeout(800);
  // real 1-second candles: Binance 1s klines, then every trade from the websocket
  const k1s=[]; p.on('response', r=>{ if (/interval=1s/.test(r.url())) k1s.push(r.status()); }); p.on('requestfailed', r=>{ if (/interval=1s/.test(r.url())) k1s.push('failed:'+r.failure().errorText); });
  await p.click('#tr-tf [data-ctf="1s"]');
  await p.waitForFunction(()=>typeof CHM==='object' && CHM && CHM.tf==='1s' && (cdBars('BTC','1s')||[]).length>=1000, null, { timeout:30000 }).catch(()=>{});
  const s1a=await p.evaluate(()=>{ const B=cdBars('BTC','1s')||[]; return { n:B.length, t:B.length ? B[B.length-1].t : 0, contig:B.every((x,i)=>!i || x.t-B[i-1].t===1000), tf:CHM && CHM.tf, src:$('#tr-src').textContent, stf:ST.tf }; });
  await p.waitForTimeout(3200);
  const s1b=await p.evaluate(()=>{ const B=cdBars('BTC','1s')||[], L=B[B.length-1]; return { t:L ? L.t : 0, close:L && L.c, last:quote('BTC').last }; });
  check('chart: 1-second candles load from Binance (1000 contiguous seconds) and move on live, second by second', s1a.n>=1000 && s1a.contig && s1a.tf==='1s' && s1a.stf==='intra' && /1-second/.test(s1a.src) && s1b.t-s1a.t>=2000 && Math.abs(s1b.close/s1b.last-1)<.002, JSON.stringify({ ...s1a, ...s1b, k1s }));
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
  const ax1=await axPick(); check('accessibility: no serious problems with the indicator picker open (light)', ax1.length===0, ax1.join(' '));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('#lv-theme'); await p.waitForTimeout(200); await p.click('#tr-tf [data-cu="ind"]'); await p.waitForSelector('#cu-layer [role="dialog"]');
  const ax2=await axPick(); check('accessibility: no serious problems with the indicator picker open (dark)', ax2.length===0, ax2.join(' '));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const pk=await p.evaluate(()=>({ open:!!$('#cu-layer [role="dialog"]'), focus:document.activeElement && document.activeElement.getAttribute('data-cu') }));
  check('Esc closes the picker and gives the focus back to the Indicators button', !pk.open && pk.focus==='ind', JSON.stringify(pk));
  { const th=await p.evaluate(()=>({ t:document.documentElement.dataset.tdxTheme, bg:getComputedStyle(document.body).backgroundColor, card:getComputedStyle($('.tr-card')).backgroundColor, accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), meta:$('meta[name="theme-color"]').content, lbl:$('#lv-theme').getAttribute('aria-label') }));
    await p.click('#lv-theme'); await p.waitForTimeout(200); const th2=await p.evaluate(()=>({ t:document.documentElement.dataset.tdxTheme, bg:getComputedStyle(document.body).backgroundColor, card:getComputedStyle($('.tr-card')).backgroundColor, saved:JSON.parse(localStorage.getItem('tdl-state')||'{}').theme }));
    check('the theme toggle switches dark (#000 page, #1c1c1e cards, #0a84ff accent) back to light (#f5f5f7 page, white cards, #0066cc accent)', th.t==='dark' && th.bg==='rgb(0, 0, 0)' && th.card==='rgb(28, 28, 30)' && th.accent==='#0a84ff' && th.meta==='#000000' && /light/.test(th.lbl) && th2.t==='light' && th2.bg==='rgb(245, 245, 247)' && th2.card==='rgb(255, 255, 255)', JSON.stringify({ th, th2 })); }
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
  { await p.mouse.move(box.x+box.w+40, box.y-40); await p.waitForTimeout(100); const bx3=await p.evaluate(()=>{ const r=$('#tr-chart svg.chart').getBoundingClientRect(); return { x:r.left, y:r.top, plotW:CHM.plotW, mainH:CHM.mainH }; });
    const cy=bx3.mainH*0.62, want=await p.evaluate(y=>({ px:CHM.px(y), last:quote('BTC').last }), cy); await p.mouse.click(bx3.x+bx3.plotW*0.45, bx3.y+cy); await p.waitForTimeout(500);
    const cm=await p.evaluate(()=>({ items:$$('#cm [role="menuitem"]').map(b=>b.textContent), role:($('#cm')||{ getAttribute:()=>'' }).getAttribute('role'), focus:!!(document.activeElement && document.activeElement.closest('#cm')) }));
    await p.click('#cm [data-cm="lmt"]'); await p.waitForTimeout(300);
    const tk2=await p.evaluate(()=>({ type:ST.type, side:ST.side, px:+$('#tk-px').value, pxShown:!$('#tk-pxw').hidden, menu:!!$('#cm'), focus:document.activeElement && document.activeElement.id, go:$('#tk-go').textContent }));
    check('chart: a click on the chart opens a small menu (limit here, stop here, price alert); “Limit buy here” fills the ticket with a limit at that price (sending still goes through the club’s job)', cm.role==='menu' && cm.items.length===3 && /Limit (buy|sell) here · \$[\d,.]+/.test(cm.items[0]) && /Stop here/.test(cm.items[1]) && /Price alert/.test(cm.items[2]) && cm.focus && tk2.type==='lmt' && Math.abs(tk2.px/want.px-1)<0.002 && tk2.pxShown && !tk2.menu && tk2.focus==='tk-amt' && (want.px<want.last ? tk2.side==='buy' : ['sell','short'].includes(tk2.side)), JSON.stringify({ cm, tk2, want }));
    await p.mouse.click(bx3.x+bx3.plotW*0.45, bx3.y+bx3.mainH*0.3); await p.waitForTimeout(500); await p.click('#cm [data-cm="al"]'); await p.waitForTimeout(200);
    const al2=await p.evaluate(()=>({ kind:$('#al-kind').value, v:+$('#al-v').value, focus:document.activeElement && document.activeElement.id }));
    await p.mouse.click(bx3.x+bx3.plotW*0.45, bx3.y+bx3.mainH*0.3); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(100); const esc2=await p.evaluate(()=>!$('#cm'));
    check('…“Price alert” fills in the alert form instead, and Esc closes the menu', ['above','below'].includes(al2.kind) && al2.v>0 && al2.focus==='al-v' && esc2, JSON.stringify({ al2, esc2 }));
    await p.evaluate(()=>{ ST.type='mkt'; render(); }); }
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
  await p.evaluate(()=>{ ST.tf='intra'; location.hash='#trade'; }); await p.waitForTimeout(500); await p.selectOption('#tr-sym', 'BTC'); await p.waitForTimeout(800); if (!(await p.evaluate(()=>!!ST.term))) await p.click('#tm-tog'); await p.waitForTimeout(800);
  await p.waitForFunction(()=>!!$('#tr-chart svg.chart'), null, { timeout:15000 }).catch(()=>{}); await p.evaluate(()=>render()); await p.waitForTimeout(500);
  const tm=await p.evaluate(()=>({ term:document.documentElement.classList.contains('term'), blot:$$('#tm-blot [data-blot]').map(x=>x.dataset.blot).join(), acct:$('#acct').innerText, lines:$$('#tm-ol g.tm-line').length, drag:$$('#tm-ol [data-ln]').length, tapeOk:!!$('#tm-tape') }));
  check('terminal mode: chart, book, tape and a blotter (positions, orders, fills); the bar shows the fund (value, today, cash, free cash, last update, member)', tm.term && tm.tapeOk && tm.blot==='pos,ord,fil' && /Phoenix Finance Club fund/.test(tm.acct) && /FREE CASH/i.test(tm.acct) && /Member: can trade/.test(tm.acct), JSON.stringify(tm));
  check('the fund’s average cost and open orders show as lines on the chart; they cannot be dragged (orders change only through the club’s job)', tm.lines>=1 && tm.drag===0, JSON.stringify(tm));
  await p.click('[data-blot="fil"]'); await p.waitForTimeout(300); check('the blotter lists the fund’s fills with the action and slippage column', await p.evaluate(()=>/Slippage/.test($('#tm-blot').textContent) && /Short/.test($('#tm-blot').textContent)));
  await p.keyboard.press('Control+k'); await p.waitForTimeout(150); await p.keyboard.type('report'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  check('the command palette (Ctrl+K) finds a screen and opens it', await p.evaluate(()=>location.hash==='#report'));
  await p.keyboard.press('Control+k'); await p.waitForTimeout(150); await p.keyboard.type('desk'); await p.waitForTimeout(150);
  check('…and has no removed screens left', await p.evaluate(()=>!$$('#pal [data-pal]').some(x=>/Desk|Bots|Journal|Arena|Academy|Challenge|futures/i.test(x.textContent)))); await p.keyboard.press('Escape');
  await p.evaluate(()=>location.hash='#settings'); await p.waitForTimeout(300);
  await p.click('#lv-priv'); await p.waitForTimeout(200); const pvx=await p.evaluate(()=>({ nw:$('#lv-nw').textContent, pressed:$('#lv-priv').getAttribute('aria-pressed') })); await p.click('#lv-priv');
  check('privacy mode hides money amounts (and the button says so)', /•/.test(pvx.nw) && pvx.pressed==='true', JSON.stringify(pvx));
  const dh=await p.evaluate(()=>({ rows:$$('#set-extra .tbl tbody tr').length, fund:/The fund/.test($('#set-extra').textContent), gone:/ntfy|Download a backup|Academy|\bbots?\b/i.test($('#v-settings').textContent) }));
  check('Settings: data health lists the feeds and the fund; no notifications, backup or Academy', dh.rows===5 && dh.fund && !dh.gone, JSON.stringify(dh));
  // Turkish
  await p.evaluate(()=>location.hash='#board'); await p.waitForTimeout(400);
  await p.click('#lv-lang'); await p.waitForTimeout(500);
  const tr=await p.evaluate(()=>({ nav:$$('.lv-nav a span').map(x=>x.textContent).join(','), lang:document.documentElement.lang, tile:$('#t-money-h').textContent, pills:$$('#bd [data-brange]').map(x=>x.textContent).join(','), ib:ST.inbox.map(x=>T(x.msg)).join(' '), foot:$('#foot').textContent, today:$('#hm-say').textContent }));
  check('Türkçe: the menu, tiles, order results in the inbox, “Today in one look” and the footer switch language', tr.lang==='tr' && tr.nav==='Fon,Portföy,İşlem,Piyasalar,Kripto,Haberler,Ayarlar' && tr.tile==='Phoenix Finance Club fonu' && tr.pills==='Başlangıç,1 Ay,1 Hafta,Bugün' && /BTC alındı: 0\.015 adet/.test(tr.ib) && !/Bought /.test(tr.ib) && /oyun parası/.test(tr.foot) && /Fonun değeri/.test(tr.today), JSON.stringify(tr));
  const EN_RE=/\b(the|your|and|with|order|price|cash|open|amount|buy|sell|limit price|member|trade)\b/i;
  const leftEn=async()=>p.evaluate(src=>{ const re=new RegExp(src, 'i'), out=[]; const w=document.createTreeWalker($('#main'), NodeFilter.SHOW_TEXT); let n; while ((n=w.nextNode())){ const s=n.textContent.trim(); if (s.length>3 && re.test(s) && !n.parentElement.closest('[hidden],option,optgroup,.mk-nm,.tr-hits,#tr-det,#cx-tbl .muted,#tr-sym,.nw,.chip,#nw-body .mk-nm,.tr-note,#pf-pos .muted,#tr-fund,.club-st b,.hm-ev,#hm-say b,code,.club-how li,.rt-n,.dw')) out.push(s); } return out; }, EN_RE.source);
  let le=await leftEn(); check('no English sentences left on the Turkish board', le.length===0, le.slice(0,6).join(' | '));
  await p.screenshot({ path:OUT+'/live_tr.png' });
  for (const v of ['markets','crypto','news','report','trade','portfolio','settings']){ await p.evaluate(v=>location.hash='#'+v, v); await p.waitForTimeout(400); le=await leftEn(); check(`no English left on the Turkish ${v} screen`, le.length===0, le.slice(0,6).join(' | ')); }
  await p.evaluate(()=>{ clubSetTok(''); render(); }); await p.evaluate(()=>location.hash='#trade'); await p.waitForTimeout(400);
  le=await leftEn(); const lockTr=await p.textContent('#tk-lock');
  check('the members-only message is Turkish too', le.length===0 && /Sadece kulüp üyeleri işlem yapabilir/.test(lockTr), le.slice(0,4).join(' | ')+' '+lockTr);
  await p.evaluate(T=>{ clubSetTok(T); render(); }, TOK); await p.click('#lv-lang');
  // accessibility, both themes
  await p.addScriptTag({ content:fs.readFileSync(__dirname+'/../axe/node_modules/axe-core/axe.min.js','utf8') });
  const VIEWS=['board','markets','crypto','news','report','trade','portfolio','settings'];
  for (const th of ['dark','light']){ if ((await p.evaluate(()=>ST.theme))!==th) await p.click('#lv-theme'); await p.waitForTimeout(200);
    for (const v of VIEWS){ await p.evaluate(v=>location.hash='#'+v, v); await p.waitForTimeout(500);
      const ax=await p.evaluate(async()=>(await axe.run(document, { resultTypes:['violations'] })).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id+':'+v.nodes.length+' '+v.nodes.slice(0,3).map(n=>n.target.join(' ')).join(', ')));
      check(`accessibility: no serious problems on ${v} (${th})`, ax.length===0, ax.join(' ')); } }
  await p.evaluate(()=>{ clubSetTok(''); render(); }); await p.evaluate(()=>location.hash='#trade'); await p.waitForTimeout(500);
  { const ax=await p.evaluate(async()=>(await axe.run(document, { resultTypes:['violations'] })).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id+':'+v.nodes.length));
    check('accessibility: no serious problems on the locked ticket (light)', ax.length===0, ax.join(' ')); }
  await p.click('#lv-theme');
  // phone
  const ph=await b.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:1, isMobile:true, hasTouch:true }); const q=await ph.newPage(); q.on('pageerror', e=>errs.push(e.message)); await mocks(q, seen);
  for (const v of VIEWS){ await q.goto(URL0+'#'+v); await q.waitForTimeout(['board','markets','crypto','news'].includes(v) ? 5000 : 1800);
    const w=await q.evaluate(()=>{ const n=$('.lv-nav'), r=n.getBoundingClientRect(); return { sw:document.documentElement.scrollWidth, nav:getComputedStyle(n).position, bottom:Math.round(r.bottom), tabs:$$('.lv-nav a').filter(a=>{ const b=a.getBoundingClientRect(); return b.width>30 && b.right<=390 && getComputedStyle(a.querySelector('svg')).display!=='none' && a.querySelector('span').getBoundingClientRect().width>0; }).length, cur:($('.lv-nav a[aria-current="page"]')||{ dataset:{} }).dataset.nav }; });
    check(`phone: no sideways scroll on ${v}, and the iOS-style tab bar (7 icons with labels) sits at the bottom`, w.sw<=390 && w.nav==='fixed' && w.bottom===844 && w.tabs===7 && (v==="report" ? !w.cur : w.cur===v), JSON.stringify(w));
    if (['board','trade','portfolio','settings'].includes(v)) await q.screenshot({ path:OUT+'/live_phone_'+v+'.png', fullPage:false }); }
  await q.goto(URL0+'#trade'); await q.waitForTimeout(1500); await q.evaluate(()=>{ ST.sel='BTC'; ST.chart.inds=[{ k:'i1', id:'ema', p:{ n:20 }, c:{}, hide:false }, { k:'i2', id:'vol', p:{}, c:{}, hide:false }, { k:'i3', id:'rsi', p:{}, c:{}, hide:false }, { k:'i4', id:'macd', p:{}, c:{}, hide:false }]; save(); render(); });
  await q.waitForFunction(()=>!!$('#tr-chart svg.chart') && typeof CHM==='object' && CHM && CHM.panes && CHM.panes.length===4, null, { timeout:20000 }).catch(()=>{}); await q.waitForTimeout(400);
  const p3=await q.evaluate(()=>({ sw:document.documentElement.scrollWidth, panes:CHM && CHM.panes.length, svgW:Math.round($('#tr-chart svg.chart').getBoundingClientRect().right), tb:Math.round($('#tr-tf').getBoundingClientRect().right) }));
  check('phone: the chart with three sub-panes (volume, RSI, MACD) and its toolbar fit 390px with no sideways scroll', p3.sw<=390 && p3.panes===4 && p3.svgW<=390 && p3.tb<=390, JSON.stringify(p3));
  await ph.close();
  { // a saved state from the old site (own account, bots, money handed to a bot): the preferences stay, the old account and bots go, the fund shows
    const old=JSON.stringify({ v:1, A:{ v:1, cash:5, start:100000, pos:{ DOGE:{ q:1e6, avg:.1, kind:'crypto' } }, orders:[], fills:[], nid:2, eq:[] }, bots:[{ id:'hodl' }], ai:[{ id:'knn' }], mg:[{ bot:'knn' }], accts:{ main:{} }, fut:{}, ch:{}, lang:'tr', theme:'light', watch:['BTC','TSLA'], side:'b', type:'trl', welcomed:true });
    const mc=await b.newContext({ viewport:{ width:1280, height:900 } }); const mp=await mc.newPage(); mp.on('pageerror', e=>errs.push(e.message)); await mocks(mp, seen);
    await mp.addInitScript(j=>{ if (!sessionStorage.getItem('seeded')){ localStorage.setItem('tdl-state', j); sessionStorage.setItem('seeded', '1'); } }, old);
    await mp.goto(URL0); await mp.waitForFunction(()=>CLUB.fund, null, { timeout:20000 }).catch(()=>{}); await mp.evaluate(()=>saveNow());
    const mg=await mp.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('tdl-state')); return { lang:ST.lang, theme:ST.theme, watch:ST.watch.join(), side:ST.side, type:ST.type, seq:ST.A.seq, doge:!!ST.A.pos.DOGE, keys:['A','bots','ai','mg','accts','fut','ch','welcomed'].filter(k=>k in s).join() }; });
    check('an old saved state keeps its language, theme and watchlist; its own account, bots, futures and challenge are dropped and the fund shows', mg.lang==='tr' && mg.theme==='light' && mg.watch==='BTC,TSLA' && mg.side==='buy' && mg.type==='mkt' && mg.seq>=1234 && !mg.doge && !mg.keys, JSON.stringify(mg));
    await mc.close(); }
  check('the Alpaca secret was never sent anywhere but Alpaca', seen.leak.length===0, seen.leak.join(' '));
  check('no script errors anywhere', errs.length===0, errs.slice(0,3).join(' | '));
  await b.close(); console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);
})();

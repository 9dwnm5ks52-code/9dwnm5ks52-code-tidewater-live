// Phoenix Finance Club: the club fund's executor (server/club.js) and its safe save (server/club_run.sh), against a local
// stand-in for Binance, TradingView's screener and the two calendar sources. Runs in node; never touches the real services.
const fs=require('fs'), os=require('os'), path=require('path'), http=require('http'), { execFile }=require('child_process');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const near=(a,b,e)=>Math.abs(a-b)<=(e||1e-6);
const CLUB=path.join(__dirname, '..', 'server', 'club.js'), RUNSH=path.join(__dirname, '..', 'server', 'club_run.sh');
// ---- the stand-in market: prices the test can move between runs
const M={ crypto:{ BTC:70000, ETH:3000, SOL:150 }, stock:{ AAPL:{ px:250, ex:'NASDAQ', type:'stock' }, TSLA:{ px:400, ex:'NASDAQ', type:'stock' }, SPY:{ px:600, ex:'AMEX', type:'fund' }, 'BRK.B':{ px:480, ex:'NYSE', type:'stock' } }, calls:[] };
const pairSym=p=>Object.keys(M.crypto).find(s=>s+'USDT'===p);
const tick=s=>({ symbol:s+'USDT', lastPrice:String(M.crypto[s]), bidPrice:String(M.crypto[s]-1), askPrice:String(M.crypto[s]+1), openPrice:String(M.crypto[s]*.98) });
const srv=http.createServer((req, res)=>{ const u=new URL(req.url, 'http://x'); M.calls.push(u.pathname); let body='';
  req.on('data', c=>body+=c); req.on('end', ()=>{ const send=(st, x)=>{ res.writeHead(st, { 'content-type':'application/json' }); res.end(JSON.stringify(x)); };
    if (u.pathname==='/bn/ticker/24hr'){ if (u.searchParams.get('symbols')){ const ps=JSON.parse(u.searchParams.get('symbols')); if (ps.some(p=>!pairSym(p))) return send(400, { code:-1121, msg:'Invalid symbol.' }); return send(200, ps.map(p=>tick(pairSym(p)))); }
      const s=pairSym(u.searchParams.get('symbol')); return s ? send(200, tick(s)) : send(400, { code:-1121, msg:'Invalid symbol.' }); }
    if (u.pathname==='/bn/depth'){ const s=pairSym(u.searchParams.get('symbol')), p=M.crypto[s]; if (!s) return send(400, {}); return send(200, { bids:[[String(p-1),'0.5'],[String(p-2),'5']], asks:[[String(p+1),'0.1'],[String(p+3),'0.2'],[String(p+10),'50']] }); }
    if (u.pathname==='/tv'){ const tks=JSON.parse(body).symbols.tickers; return send(200, { data:tks.map(t=>{ const [ex, tk]=t.split(':'), d=M.stock[tk]; return d && d.ex===ex ? { s:t, d:[tk, d.px, 1.5, d.type] } : null; }).filter(Boolean) }); }
    if (u.pathname==='/ff') return send(200, [{ title:'CPI m/m', country:'USD', date:'2026-11-18T08:30:00-05:00', impact:'High', forecast:'0.3%', previous:'0.2%' }, { title:'Bank Holiday', country:'USD', date:'2026-11-19T00:00:00-05:00', impact:'Holiday' }]);
    if (u.pathname==='/nasdaq') return send(200, { data:{ rows:[{ country:'United States', eventName:'Nonfarm Payrolls', gmt:'08:30', consensus:'150K', previous:'120K' }, { country:'United States', eventName:'10-Year Note Auction', gmt:'13:00' }] } });
    send(404, {}); }); });
const OPEN=Date.UTC(2026,10,17,16,0), CLOSED=Date.UTC(2026,10,21,16,0);   // Tuesday 11:00 in New York; a Saturday
let PORT=0, cidN=0; const cid=()=>'test-cid-'+(++cidN);
function run(dir, env, cmd){ return new Promise(res=>{ execFile(cmd ? 'bash' : process.execPath, cmd ? [RUNSH] : [CLUB, dir], { cwd:cmd||undefined, env:{ ...process.env, CLUB_BINANCE:`http://127.0.0.1:${PORT}/bn`, CLUB_TV:`http://127.0.0.1:${PORT}/tv`, CLUB_FF:`http://127.0.0.1:${PORT}/ff`, CLUB_NASDAQ:`http://127.0.0.1:${PORT}/nasdaq`, ORDER:'', CID:'', CLUB_NOW:String(OPEN), ...env } }, (err, out, er)=>res({ code:err ? err.code : 0, out:out+er })); }); }
const fund=dir=>JSON.parse(fs.readFileSync(path.join(dir, 'fund.json'), 'utf8'));
async function order(dir, o, extra){ const c=cid(); const r=await run(dir, { ORDER:typeof o==='string' ? o : JSON.stringify(o), CID:c, ...(extra||{}) }); const F=fund(dir); return { c, F, d:F.done[c], r }; }
(async()=>{ await new Promise(r=>srv.listen(0, '127.0.0.1', r)); PORT=srv.address().port;
  const D=fs.mkdtempSync(path.join(os.tmpdir(), 'club-'));
  // 1) the first run makes a fresh $100,000 fund, records its value with both benchmarks, and writes the calendar
  let r=await run(D, {}), F=fund(D);
  check('the first run creates a fresh $100,000 fund in the broker’s own account shape', r.code===0 && F.cash===100000 && F.start===100000 && F.v===1 && Array.isArray(F.orders) && Array.isArray(F.fills) && F.nid===1 && F.seq===1 && F.t===OPEN, r.code);
  check('each run records the fund’s value with the S&P 500 (SPY) and Bitcoin prices', F.eq.length===1 && F.eq[0].v===100000 && F.eq[0].spy===600 && F.eq[0].btc===70000 && F.prices.BTC===70000 && F.prices.SPY===600, JSON.stringify(F.eq));
  const cal=JSON.parse(fs.readFileSync(path.join(D, 'calendar.json'), 'utf8'));
  check('a scheduled run still writes the economic calendar (holidays and auctions left out)', cal.events.length>=2 && cal.events.some(e=>e.title==='CPI m/m' && e.impact==='High') && cal.events.some(e=>e.title==='Nonfarm Payrolls') && !cal.events.some(e=>/Holiday|Auction/.test(e.title)), cal.events.length);
  // 2) crypto market buy: walks the stand-in book, 0.1% fee, both languages
  let x=await order(D, { sym:'BTC', kind:'crypto', side:'buy', type:'mkt', q:0.2, note:'Halving thesis' });
  const want=(.1*70001+.1*70003)/.2;
  check('a crypto market buy fills at the real book (never a price from the order), with the fee', x.d && x.d.ok && near(x.F.pos.BTC.q, .2) && near(x.d.px, want) && near(x.F.cash, 100000-.2*want*1.001, 1e-6) && x.F.fills.length===1, JSON.stringify(x.d));
  check('the result is stored in English and Turkish under the client id', /^Bought 0\.2 BTC at an average of \$70002\.00\.$/.test(x.d.msg) && /BTC alındı: 0\.2 adet/.test(x.d.tr), x.d.msg+' | '+x.d.tr);
  check('the note travels with the order and the fill', x.F.fills[0].note==='Halving thesis' && x.F.orders[0].note==='Halving thesis');
  // 3) the same client id again: nothing happens twice
  const before=JSON.stringify(x.F.fills); r=await run(D, { ORDER:JSON.stringify({ sym:'BTC', kind:'crypto', side:'buy', type:'mkt', q:0.2 }), CID:x.c }); F=fund(D);
  check('the same client id is executed once only', JSON.stringify(F.fills)===before && near(F.pos.BTC.q, .2) && /already handled/.test(r.out), F.fills.length);
  // 4) a crypto market sell, a price in the order is ignored
  x=await order(D, { sym:'BTC', kind:'crypto', side:'sell', type:'mkt', q:0.1, px:1, fillPrice:1 });
  check('a crypto market sell sells at the book’s bid; a price sent with a market order is ignored', x.d.ok && near(x.F.pos.BTC.q, .1) && near(x.F.fills[1].px, 69999) && x.F.fills[1].pl!=null, JSON.stringify(x.d));
  // 5) US stocks while the market is open: buy by dollars, sell part
  x=await order(D, { sym:'AAPL', kind:'stock', side:'buy', type:'mkt', usd:5000 });
  check('a US stock market buy fills at the delayed price plus the 0.05% spread, no commission', x.d.ok && near(x.F.pos.AAPL.q, Math.floor(5000/(250*1.0005)*1e4)/1e4) && near(x.F.fills[2].px, 250*1.0005) && x.F.fills[2].fee===0, JSON.stringify(x.d));
  x=await order(D, { sym:'AAPL', kind:'stock', side:'sell', type:'mkt', q:5 });
  check('…and sells part of it', x.d.ok && near(x.F.pos.AAPL.q, Math.floor(5000/(250*1.0005)*1e4)/1e4-5), x.d.msg);
  x=await order(D, { sym:'BRK.B', kind:'stock', side:'buy', type:'mkt', q:1 });
  check('a NYSE ticker with a dot (BRK.B) is found too', x.d.ok && x.F.pos['BRK.B'] && x.F.pos['BRK.B'].q===1, x.d.msg);
  // 6) short and cover
  x=await order(D, { sym:'TSLA', kind:'stock', side:'short', type:'mkt', q:10, note:'Overvalued' });
  const cash0=x.F.cash;
  check('a short sale from no position: the fund holds −10 TSLA and the money comes in', x.d.ok && x.F.pos.TSLA.q===-10 && x.F.fills[x.F.fills.length-1].short===true && /^Sold short 10 TSLA/.test(x.d.msg) && /açığa satıldı/.test(x.d.tr), x.d.msg);
  M.stock.TSLA.px=360; x=await order(D, { sym:'TSLA', kind:'stock', side:'cover', type:'mkt', q:10 });
  const cf=x.F.fills[x.F.fills.length-1];
  check('cover buys it back: the position closes with the profit of the fall', x.d.ok && !x.F.pos.TSLA && cf.cover===true && near(cf.pl, 10*(400*.9995-360*1.0005), 1e-6) && near(x.F.cash, cash0-10*360*1.0005, 1e-6), JSON.stringify({ pl:cf.pl }));
  x=await order(D, { sym:'TSLA', kind:'stock', side:'cover', type:'mkt', q:1 });
  check('cover with no short is refused with a reason', !x.d.ok && /not short TSLA/.test(x.d.msg) && /açık pozisyonu yok/.test(x.d.tr), x.d.msg);
  // 7) limit and stop orders fill on a later run
  x=await order(D, { sym:'ETH', kind:'crypto', side:'buy', type:'lmt', q:1, px:2900 });
  const lid=x.d.oid; check('a limit buy below the price waits', x.d.ok && x.F.orders.find(o=>o.id===lid).status==='open' && /^Limit order placed: buy 1 ETH at \$2900\.$/.test(x.d.msg), x.d.msg);
  x=await order(D, { sym:'BTC', kind:'crypto', side:'sell', type:'stp', q:0.1, px:65000 });
  const sid=x.d.oid; check('a stop below the price waits', x.d.ok && x.F.orders.find(o=>o.id===sid).status==='open', x.d.msg);
  M.crypto.ETH=2880; M.crypto.BTC=64000; r=await run(D, { CLUB_NOW:String(OPEN+600e3) }); F=fund(D);
  check('on the next run the limit fills at the better price and the stop triggers', F.orders.find(o=>o.id===lid).status==='filled' && F.orders.find(o=>o.id===sid).status==='filled' && near(F.pos.ETH.q, 1) && !F.pos.BTC && near(F.fills.find(f=>f.oid===lid).px, 2881), JSON.stringify(F.fills.slice(-2).map(f=>[f.sym, f.px])));
  // 8) a closed US market: market orders are refused; a limit waits for the open even when the price allows
  x=await order(D, { sym:'AAPL', kind:'stock', side:'buy', type:'mkt', q:1 }, { CLUB_NOW:String(CLOSED) });
  check('a US market order while the market is closed is refused, like on the site', !x.d.ok && /market is closed/.test(x.d.msg) && /ABD piyasası kapalı/.test(x.d.tr), x.d.msg);
  x=await order(D, { sym:'AAPL', kind:'stock', side:'buy', type:'lmt', q:2, px:260 }, { CLUB_NOW:String(CLOSED+60e3) });
  const wid=x.d.oid; check('a US limit order placed while closed waits, even though the price allows', x.d.ok && x.F.orders.find(o=>o.id===wid).status==='open' && x.F.us===false, x.d.msg);
  r=await run(D, { CLUB_NOW:String(CLOSED+7*864e5/7*2+864e5) }); F=fund(D);   // the Monday after, 11:00 New York
  check('…and fills on the first run after the open', F.orders.find(o=>o.id===wid).status==='filled' && F.us===true, F.orders.find(o=>o.id===wid).status);
  const T1=CLOSED+3*864e5;
  // 9) cancel
  x=await order(D, { sym:'SOL', kind:'crypto', side:'buy', type:'lmt', q:2, px:100 }, { CLUB_NOW:String(T1) }); const cxid=x.d.oid;
  x=await order(D, JSON.stringify({ cancel:cxid }), { CLUB_NOW:String(T1+1000) });
  check('a member can cancel an open order', x.d.ok && x.F.orders.find(o=>o.id===cxid).status==='cancelled' && x.F.orders.find(o=>o.id===cxid).why==='by a member', x.d.msg);
  x=await order(D, { cancel:cxid }, { CLUB_NOW:String(T1+2000) });
  check('cancelling it again is refused with a reason', !x.d.ok && /is not open/.test(x.d.msg), x.d.msg);
  // 10) invalid orders, each refused with a reason in both languages, and nothing traded
  const nf=fund(D).fills.length, cases=[
    ['not JSON', '{oops', /could not be read/], ['an array', '[1,2]', /could not be read/], ['no kind', { sym:'BTC', side:'buy', q:1 }, /coin or a US stock/],
    ['a strange side', { sym:'BTC', kind:'crypto', side:'steal', q:1 }, /buy, sell, short or cover/], ['a strange type', { sym:'BTC', kind:'crypto', side:'buy', type:'oco', q:1 }, /market, limit or stop/],
    ['both amount kinds', { sym:'BTC', kind:'crypto', side:'buy', q:1, usd:100 }, /either a quantity or a dollar amount/], ['no amount', { sym:'BTC', kind:'crypto', side:'buy' }, /either a quantity/],
    ['a negative amount', { sym:'BTC', kind:'crypto', side:'buy', q:-1 }, /above zero/], ['a text amount', { sym:'BTC', kind:'crypto', side:'buy', q:'lots' }, /above zero/],
    ['a limit without a price', { sym:'BTC', kind:'crypto', side:'buy', type:'lmt', q:1 }, /limit price/], ['an unknown coin', { sym:'ZZZZ', kind:'crypto', side:'buy', q:1 }, /No price for ZZZZ/],
    ['an unknown stock', { sym:'NOPE', kind:'stock', side:'buy', q:1 }, /No price for NOPE/], ['a coin as a stock', { sym:'BTC', kind:'stock', side:'buy', q:1 }, /Unknown symbol/],
    ['a bad symbol', { sym:'<img>', kind:'stock', side:'buy', q:1 }, /Unknown symbol/], ['too much money', { sym:'ETH', kind:'crypto', side:'buy', usd:5e6 }, /Not enough cash/],
    ['selling more than held', { sym:'ETH', kind:'crypto', side:'sell', q:50 }, /free to sell/], ['shorting a holding', { sym:'ETH', kind:'crypto', side:'short', q:1 }, /holds ETH/],
    ['a stop on the wrong side', { sym:'ETH', kind:'crypto', side:'sell', type:'stp', q:1, px:9999 }, /below the current price/], ['a huge order text', JSON.stringify({ sym:'BTC', kind:'crypto', side:'buy', q:1, note:'x'.repeat(5000) }), /too long/] ];
  let bad=[]; for (const [n, o, re] of cases){ const y=await order(D, o, { CLUB_NOW:String(T1+5000) }); if (!(y.d && !y.d.ok && re.test(y.d.msg) && y.d.tr && y.d.tr!==y.d.msg)) bad.push(n+': '+JSON.stringify(y.d)); }
  check(`invalid orders are refused with a reason in both languages (${cases.length} kinds)`, !bad.length && fund(D).fills.length===nf, bad.join(' | '));
  r=await run(D, { ORDER:JSON.stringify({ sym:'BTC', kind:'crypto', side:'buy', q:1 }), CID:'no good id!' });
  check('an order without a valid client id is not executed', /without a valid client id/.test(r.out) && fund(D).fills.length===nf);
  // 11) the note: capped at 280 characters, control characters removed, stored as plain text
  x=await order(D, { sym:'ETH', kind:'crypto', side:'buy', type:'mkt', usd:100, note:'<img src=x onerror=alert(1)>\n\u0007'+'y'.repeat(400) }, { CLUB_NOW:String(T1+6000) });
  const nt=x.F.fills[x.F.fills.length-1].note;
  check('a note is capped at 280 characters and control characters are removed (the site escapes it when showing it)', x.d.ok && nt.length===280 && nt.startsWith('<img src=x onerror=alert(1)> y') && !/[\u0000-\u001f]/.test(nt), nt.length);
  // 12) the value history is thinned: all points of 2 days, hourly to 60 days, daily before
  F=fund(D); const T2=T1+864e5; F.eq=[]; for (let t=T2-100*864e5; t<T2; t+=300e3) F.eq.push({ t, v:100000, spy:600, btc:70000 }); fs.writeFileSync(path.join(D, 'fund.json'), JSON.stringify(F));
  await run(D, { CLUB_NOW:String(T2) }); F=fund(D); const age=p=>T2-p.t, per=(xs, k)=>{ const m={}; for (const p of xs){ const b=Math.floor(p.t/k); m[b]=(m[b]||0)+1; } return Math.max(...Object.values(m)); };
  const recent=F.eq.filter(p=>age(p)<=2*864e5), mid=F.eq.filter(p=>age(p)>2*864e5 && age(p)<=60*864e5), old=F.eq.filter(p=>age(p)>60*864e5);
  check('the value history keeps every point of 2 days, one an hour to 60 days and one a day before', recent.length>=576 && per(mid, 36e5)===1 && mid.length>=58*24-2 && per(old, 864e5)===1 && old.length>=39 && old.length<=41 && F.eq.length<2100, `${recent.length}/${mid.length}/${old.length}`);
  // 13) results are kept for the last 500 client ids
  F=fund(D); for (let k=0;k<600;k++) F.done['old-'+k]={ ok:true, msg:'x', t:k }; fs.writeFileSync(path.join(D, 'fund.json'), JSON.stringify(F));
  const c0=M.calls.length; x=await order(D, { sym:'ETH', kind:'crypto', side:'buy', usd:50 }, { CLUB_NOW:String(T2+5*3600e3) });
  check('the results of the last 500 client ids are kept', Object.keys(x.F.done).length===500 && x.F.done[x.c] && !x.F.done['old-0'], Object.keys(x.F.done).length);
  // 14) an order run does not fetch the calendar; a damaged fund file is never replaced
  check('an order run does not fetch the calendar (orders stay fast)', x.d.ok && !/ff|nasdaq/.test(M.calls.slice(c0).join()), M.calls.slice(c0).join());
  const E=fs.mkdtempSync(path.join(os.tmpdir(), 'club-bad-')); fs.writeFileSync(path.join(E, 'fund.json'), '{"cash": 5, broken');
  r=await run(E, {}); check('a damaged fund.json stops the run and is left as it was (never a silent fresh start)', r.code===2 && fs.readFileSync(path.join(E, 'fund.json'), 'utf8')==='{"cash": 5, broken', r.code);
  // 15) the safe save: two orders at the same moment against one "data" branch; both land, nothing is overwritten, history is kept
  const G=fs.mkdtempSync(path.join(os.tmpdir(), 'club-git-')), sh=(c, cwd)=>new Promise(res=>execFile('bash', ['-c', c], { cwd }, (e, o, er)=>res({ code:e ? e.code : 0, out:o+er })));
  await sh(`git init -q --bare origin.git && git init -q -b main w0 && cd w0 && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init && git remote add origin file://${G}/origin.git && git push -q origin main`, G);
  for (const w of ['w1', 'w2', 'w3']) await sh(`git clone -q file://${G}/origin.git ${w}`, G);
  const remote={ REMOTE:'origin' };
  let s1=await run(null, { ...remote, CLUB_NOW:String(OPEN) }, path.join(G, 'w1'));
  const [a, b]=await Promise.all([ run(null, { ...remote, ORDER:JSON.stringify({ sym:'BTC', kind:'crypto', side:'buy', usd:1000 }), CID:'cid-par-a' }, path.join(G, 'w2')), run(null, { ...remote, ORDER:JSON.stringify({ sym:'ETH', kind:'crypto', side:'buy', usd:1000 }), CID:'cid-par-b' }, path.join(G, 'w3')) ]);
  await sh('git fetch -q origin data && git show origin/data:fund.json > ../final.json && git log --format=%s origin/data > ../log.txt', path.join(G, 'w1'));
  const FF=JSON.parse(fs.readFileSync(path.join(G, 'final.json'), 'utf8')), lg=fs.readFileSync(path.join(G, 'log.txt'), 'utf8').trim().split('\n');
  check('two orders at once: both are executed exactly once on the shared branch, and its history is kept', s1.code===0 && a.code===0 && b.code===0 && FF.done['cid-par-a'] && FF.done['cid-par-a'].ok && FF.done['cid-par-b'] && FF.done['cid-par-b'].ok && FF.fills.length===2 && FF.pos.BTC && FF.pos.ETH && lg.length===3, `${lg.length} commits; ${(a.out+b.out).match(/saved \(try \d\)|doing this run again/g)}`);
  fs.rmSync(D, { recursive:true, force:true }); fs.rmSync(E, { recursive:true, force:true }); fs.rmSync(G, { recursive:true, force:true });
  srv.close(); console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0); })();

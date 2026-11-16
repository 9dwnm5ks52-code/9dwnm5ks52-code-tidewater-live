// Phoenix Finance Club: the executor of the club fund. GitHub Actions runs it for every member's order (workflow_dispatch)
// and every 5 minutes (schedule). It is the only thing that ever changes the fund.
//
//   node server/club.js <data folder>       reads and writes <data>/fund.json (and <data>/calendar.json on scheduled runs)
//   env ORDER  the order, JSON (the workflow input "order"); empty on scheduled runs
//   env CID    the client order id (the workflow input "cid"); the result is stored under fund.done[CID]
//
// fund.json is a paper-broker account exactly as live_broker.js makes it (brkNew), so the site can show it with the
// same views, plus: t (last run), seq (run counter), done {cid: result} (the last 500), eq [{t, v, spy, btc}] (value
// history with the S&P 500 ETF and Bitcoin prices for benchmarks), prices {sym: last price used}.
// Prices always come from the data sources, never from the order: crypto from Binance's public market data (live),
// US stocks and ETFs from TradingView's screener (about 15 minutes delayed; they fill only while the US market is open).
// Test hooks: CLUB_BINANCE and CLUB_TV point the price downloads at a stand-in, CLUB_NOW fixes the clock (ms).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const DATA = path.resolve(process.argv[2] || 'data'); fs.mkdirSync(DATA, { recursive:true });
const LIB = fs.existsSync(path.join(__dirname, 'lib')) ? path.join(__dirname, 'lib') : path.join(__dirname, '..');
const BN = process.env.CLUB_BINANCE || 'https://data-api.binance.vision/api/v3';
const TV = process.env.CLUB_TV || 'https://scanner.tradingview.com/america/scan';
const NOW = +process.env.CLUB_NOW || Date.now();
const FILE = path.join(DATA, 'fund.json');
const KEEP_DONE = 500, KEEP_ORDERS = 1000, NOTE_MAX = 280;
const log = (...a)=>console.log(new Date().toISOString(), ...a);

// the browser's own engine files: the coin list, US market hours and the paper broker
const mem = {}, ctx = { console, Date, Math, JSON, Intl, Map, Set, Promise, Infinity, setTimeout, clearTimeout, setInterval:()=>0, clearInterval:()=>{}, localStorage:{ getItem:k=>mem[k]??null, setItem:(k,v)=>{ mem[k]=String(v); }, removeItem:k=>{ delete mem[k]; } } };
vm.createContext(ctx);
vm.runInContext(['sim_live.js', 'sim_live_us.js', 'live_broker.js'].map(f=>fs.readFileSync(path.join(LIB, f), 'utf8')).join('\n;\n')
  +'\n;Object.assign(this, { LIVE_CRYPTO, BRK, brkTr });', ctx, { filename:'club-engine.js' });
const C = ctx;
C.BRK.MAX_FILLS = 3000; C.BRK.MAX_ORDERS = 1e9;   // the fund keeps a long history; old closed orders are trimmed below, open ones never
const usOpen = () => C.usMarketOpen(new Date(NOW));

// ---- downloads
async function getJSON(url, opt){ const c=new AbortController(), tm=setTimeout(()=>c.abort(), 15000);
  try{ const r=await fetch(url, { ...(opt||{}), signal:c.signal }); if (!r.ok) throw new Error('HTTP '+r.status); return await r.json(); } finally { clearTimeout(tm); } }
const pairOf = sym => { const d=C.LIVE_CRYPTO.find(x=>x.sym===sym); return d ? d.bn : sym+'USDT'; };
// crypto: last price, best bid and ask, and the 24-hour open for each coin (one call, or one per coin if a pair is unknown)
async function cryptoQuotes(syms){ const out={}, put=x=>{ const sym=syms.find(s=>pairOf(s)===x.symbol); if (!sym || !(+x.lastPrice>0)) return;
    out[sym]={ kind:'crypto', last:+x.lastPrice, bid:+x.bidPrice||null, ask:+x.askPrice||null, book:null, open:true, chg:+x.openPrice>0 ? x.lastPrice/x.openPrice-1 : null }; };
  if (!syms.length) return out;
  try{ for (const x of await getJSON(`${BN}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms.map(pairOf)))}`)) put(x); }
  catch(e){ for (const s of syms){ try{ put(await getJSON(`${BN}/ticker/24hr?symbol=${pairOf(s)}`)); }catch(x){ log('Binance', s, x.message); } } }
  return out; }
// the real order book (20 levels a side), for market orders: they walk it level by level like on the site
async function cryptoBook(sym){ try{ const x=await getJSON(`${BN}/depth?symbol=${pairOf(sym)}&limit=20`); const lv=a=>(a||[]).map(l=>[+l[0], +l[1]]).filter(l=>l[0]>0 && l[1]>0);
  const book={ bids:lv(x.bids), asks:lv(x.asks) }; return book.bids.length && book.asks.length ? book : null; }catch(e){ log('Binance book', sym, e.message); return null; } }
// US stocks and ETFs: the screener's delayed price. A ticker that also names one of our coins carries ".US" on the site (sim_live_tv.js mktKey).
const tkOf = sym => sym.replace(/\.US$/, '');
async function stockQuotes(syms){ const out={}; if (!syms.length) return out; const tks=[...new Set(syms.map(tkOf))], open=usOpen();
  const x=await getJSON(TV, { method:'POST', headers:{ 'Content-Type':'text/plain' }, body:JSON.stringify({ symbols:{ tickers:tks.flatMap(t=>['NASDAQ:'+t, 'NYSE:'+t, 'AMEX:'+t]) }, columns:['name','close','change','type'] }) });
  for (const r of (x && x.data)||[]){ const v=r.d||[], tk=v[0], last=+v[1]; if (!(last>0) || !['stock','fund','dr'].includes(v[3])) continue;
    for (const s of syms) if (tkOf(s)===tk && !out[s]) out[s]={ kind:'stock', last, bid:null, ask:null, book:null, open, chg:v[2]!=null ? v[2]/100 : null, delayed:true }; }
  return out; }
async function quotesFor(crypto, stock){ const [a, b]=await Promise.all([ cryptoQuotes([...new Set(crypto)]).catch(e=>{ log('crypto prices:', e.message); return {}; }), stockQuotes([...new Set(stock)]).catch(e=>{ log('stock prices:', e.message); return {}; }) ]); return { ...a, ...b }; }

// ---- the order, checked strictly: nothing in it is trusted except what it asks for
const SIDES = { buy:{ side:'b' }, sell:{ side:'s' }, short:{ side:'s', short:true }, cover:{ side:'b' } };
const bad = (en, tr) => ({ err:{ en, tr } });
const num = v => typeof v==='number' ? v : typeof v==='string' && v.trim()!=='' ? +v : NaN;
function cleanNote(s){ return String(s==null ? '' : s).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX); }
function parseOrder(raw){ let o; if (String(raw).length>4000) return bad('The order is too long.', 'Emir çok uzun.');
  try{ o=JSON.parse(raw); }catch(e){ return bad('The order could not be read.', 'Emir okunamadı.'); }
  if (!o || typeof o!=='object' || Array.isArray(o)) return bad('The order could not be read.', 'Emir okunamadı.');
  if ('cancel' in o){ const id=num(o.cancel); return Number.isInteger(id) && id>0 ? { cancel:id } : bad('Which order should be cancelled?', 'Hangi emir iptal edilsin?'); }
  const sym=String(o.sym||'').toUpperCase(), kind=o.kind==='stock' ? 'stock' : o.kind==='crypto' ? 'crypto' : null;
  if (!kind) return bad('Say whether this is a coin or a US stock.', 'Bunun bir coin mi yoksa ABD hissesi mi olduğunu belirt.');
  if (kind==='crypto' ? !/^[A-Z0-9]{2,12}$/.test(sym) : !/^[A-Z][A-Z0-9.\-]{0,11}$/.test(sym)) return bad(`Unknown symbol: ${sym.slice(0,16) || '—'}.`, `Bilinmeyen sembol: ${sym.slice(0,16) || '—'}.`);
  if (kind==='stock' && C.LIVE_CRYPTO.some(d=>d.sym===sym)) return bad(`Unknown symbol: ${sym}.`, `Bilinmeyen sembol: ${sym}.`);
  const sd=SIDES[o.side]; if (!sd) return bad('Choose buy, sell, short or cover.', 'Al, sat, açığa sat ya da geri al seç.');
  const type=String(o.type||'mkt'); if (!['mkt','lmt','stp'].includes(type)) return bad('Choose a market, limit or stop order.', 'Piyasa, limit ya da stop emri seç.');
  const q=num(o.q), usd=num(o.usd), px=num(o.px), hasQ=o.q!=null && o.q!=='', hasUsd=o.usd!=null && o.usd!=='';
  if (hasQ===hasUsd) return bad('Enter either a quantity or a dollar amount.', 'Ya adet ya da dolar tutarı gir.');
  if (hasQ && !(q>0 && q<1e9)) return bad('Enter an amount above zero.', 'Sıfırdan büyük bir miktar gir.');
  if (hasUsd && !(usd>0 && usd<1e9)) return bad('Enter an amount above zero.', 'Sıfırdan büyük bir miktar gir.');
  if (type!=='mkt' && !(px>0 && px<1e9)) return bad(type==='lmt' ? 'Enter a limit price.' : 'Enter a stop price.', type==='lmt' ? 'Bir limit fiyatı gir.' : 'Bir stop fiyatı gir.');
  const out={ sym, kind, side:sd.side, type, note:cleanNote(o.note), cover:o.side==='cover' };
  if (sd.short) out.short=true; if (hasQ) out.q=q; else out.usd=usd; if (type!=='mkt') out.px=px; if (!out.note) delete out.note;
  return { o:out }; }

// ---- the value history: every point of the last 2 days, then one an hour up to 60 days, then one a day
function thin(eq, now){ const m=new Map();
  for (const p of eq){ const age=now-p.t, k=age<=2*864e5 ? 'p'+p.t : age<=60*864e5 ? 'h'+Math.floor(p.t/36e5) : 'd'+Math.floor(p.t/864e5); m.set(k, p); }
  return [...m.values()].sort((a,b)=>a.t-b.t); }

(async()=>{
  // 1) the fund: a fresh $100,000 account the first time; a file that cannot be read stops the run (never start over by accident)
  let A; if (fs.existsSync(FILE)){ try{ A=JSON.parse(fs.readFileSync(FILE, 'utf8')); }catch(e){ console.error('fund.json cannot be read; nothing changed:', e.message); process.exit(2); } if (!A || typeof A.cash!=='number' || !A.pos || !Array.isArray(A.orders)) { console.error('fund.json does not look like a fund; nothing changed'); process.exit(2); } }
  else { A=C.brkNew(); A.created=NOW; log('a new fund with $'+A.start); }
  for (const [k, v] of [['done', {}], ['eq', []], ['prices', {}], ['fills', []], ['seq', 0]]) if (A[k]==null) A[k]=v;

  // 2) the order of this run, if any
  const cid=String(process.env.CID||'').trim(), raw=String(process.env.ORDER||'').trim(); let job=null, result=null;
  if (raw){ if (!/^[A-Za-z0-9_-]{6,64}$/.test(cid)) log('an order without a valid client id is ignored');
    else if (A.done[cid]) log('order', cid, 'was already handled; not executed again');
    else { const p=parseOrder(raw); if (p.err) result={ ok:false, msg:p.err.en, tr:p.err.tr }; else job=p; } }

  // 3) fresh prices for everything the fund holds or waits on, the order's symbol, and the two benchmarks
  const open=A.orders.filter(o=>o.status==='open'), need=[...Object.keys(A.pos).map(s=>[s, A.pos[s].kind]), ...open.map(o=>[o.sym, o.kind]), ['BTC','crypto'], ['SPY','stock']];
  if (job && job.o) need.push([job.o.sym, job.o.kind]);
  if (job && job.cancel) { /* nothing more to price */ }
  const Q=await quotesFor(need.filter(x=>x[1]==='crypto').map(x=>x[0]), need.filter(x=>x[1]!=='crypto').map(x=>x[0]));

  // 4) resting limit and stop orders first, at the fresh prices
  const fills=C.brkTick(A, Q, NOW); for (const f of fills) log('filled', f.side, f.q, f.sym, 'at', f.px);

  // 5) then the new order (or cancel)
  if (job && job.cancel){ const ok=C.brkCancel(A, job.cancel);
    result=ok ? { ok:true, msg:`Order #${job.cancel} cancelled.`, tr:`#${job.cancel} numaralı emir iptal edildi.`, oid:job.cancel }
      : { ok:false, msg:`Order #${job.cancel} is not open (it may have filled or been cancelled already).`, tr:`#${job.cancel} numaralı emir açık değil (dolmuş ya da iptal edilmiş olabilir).` }; }
  else if (job && job.o){ const o=job.o, q=Q[o.sym];
    if (!q) result={ ok:false, msg:`No price for ${o.sym} right now: the symbol is unknown or the data source did not answer. Nothing was traded.`, tr:`${o.sym} için şu an fiyat yok: sembol bilinmiyor ya da veri kaynağı yanıt vermedi. İşlem yapılmadı.` };
    else if (o.cover && !(C.brkHeld(A, o.sym)<0)) result={ ok:false, msg:`The fund is not short ${o.sym}; there is nothing to cover.`, tr:`Fonun ${o.sym} için açık pozisyonu yok; kapatılacak bir şey yok.` };
    else { if (o.kind==='crypto' && o.type==='mkt'){ const book=await cryptoBook(o.sym); if (book){ q.book=book; q.bid=book.bids[0][0]; q.ask=book.asks[0][0]; } }
      const r=C.brkOrder(A, o, q, NOW); result={ ok:!!r.ok, msg:r.msg, tr:C.brkTr(r.msg) }; if (r.order) result.oid=r.order.id; if (r.fill){ result.fid=r.fill.id; result.px=r.fill.px; result.q=r.fill.q; } } }
  if (result && cid){ result.t=NOW; A.done[cid]=result; log('order', cid, result.ok ? 'done:' : 'refused:', result.msg);
    const ks=Object.keys(A.done).sort((a,b)=>(A.done[a].t||0)-(A.done[b].t||0)); for (const k of ks.slice(0, Math.max(0, ks.length-KEEP_DONE))) delete A.done[k]; }

  // 6) trim old closed orders (open orders always stay)
  const closed=A.orders.filter(o=>o.status!=='open'); if (closed.length>KEEP_ORDERS){ const drop=new Set(closed.slice(0, closed.length-KEEP_ORDERS)); A.orders=A.orders.filter(o=>!drop.has(o)); }

  // 7) the fund's value now, with the benchmarks, and the prices used
  for (const s of Object.keys(Q)) A.prices[s]=Q[s].last;
  for (const s of Object.keys(A.prices)) if (!A.pos[s] && !A.orders.some(o=>o.status==='open' && o.sym===s) && s!=='BTC' && s!=='SPY') delete A.prices[s];
  const quoteOrLast = {}; for (const s of Object.keys(A.pos)) quoteOrLast[s]=Q[s] || (A.prices[s] ? { last:A.prices[s] } : null);
  const v=C.brkEquity(A, quoteOrLast); A.eq.push({ t:NOW, v:Math.round(v*100)/100, spy:Q.SPY ? Q.SPY.last : null, btc:Q.BTC ? Q.BTC.last : null }); A.eq=thin(A.eq, NOW);
  A.t=NOW; A.seq=(A.seq||0)+1; A.us=usOpen();

  // 8) write it atomically: a reader never sees half a file
  const tmp=FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(A)); fs.renameSync(tmp, FILE);
  log(`run ${A.seq}: value $${v.toFixed(2)}, ${fills.length} resting order(s) filled, ${Object.keys(Q).length} prices, US market ${A.us ? 'open' : 'closed'}`);

  // 9) on scheduled runs: the economic calendar for the site (an order run stays fast)
  if (!raw){ try{ await require('./calendar.js').calendar(DATA, NOW, log); }catch(e){ log('calendar:', e.message); } }
})().catch(e=>{ console.error(e); process.exit(1); });

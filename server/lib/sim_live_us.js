/* ---------- Tidewater Live: US stocks from free plans ----------
   Main source: Alpaca free market data (IEX feed): snapshots, daily and minute bars, news, a live stream for up to 30 symbols.
   Backup source: Finnhub free plan (quotes, a live stream, profile, news).
   Keys are the visitor's own free keys, typed into Settings and kept only in their browser. Nothing here is paid. */
const LIVE_US = [
  { sym:'AAPL', name:'Apple', sector:'Tech' }, { sym:'MSFT', name:'Microsoft', sector:'Tech' }, { sym:'NVDA', name:'NVIDIA', sector:'Tech' },
  { sym:'AMZN', name:'Amazon', sector:'Consumer' }, { sym:'GOOGL', name:'Alphabet', sector:'Tech' }, { sym:'META', name:'Meta Platforms', sector:'Tech' },
  { sym:'TSLA', name:'Tesla', sector:'Consumer' }, { sym:'JPM', name:'JPMorgan Chase', sector:'Finance' }, { sym:'V', name:'Visa', sector:'Finance' },
  { sym:'XOM', name:'Exxon Mobil', sector:'Energy' }, { sym:'JNJ', name:'Johnson & Johnson', sector:'Health' }, { sym:'KO', name:'Coca-Cola', sector:'Consumer' },
  { sym:'SPY', name:'S&P 500 ETF', sector:'Index' }, { sym:'QQQ', name:'Nasdaq 100 ETF', sector:'Index' },
];
const US = {
  q:{}, src:null, status:'nokey', err:'', ws:null, lastMsg:0, listeners:[], retry:0, calls:[], timer:null,
  AP_REST:'https://data.alpaca.markets', AP_WS:'wss://stream.data.alpaca.markets/v2/iex',
  FH_REST:'https://finnhub.io/api/v1', FH_WS:'wss://ws.finnhub.io',
};
const US_KEYS = { apId:'tdl-ap-id', apSecret:'tdl-ap-secret', fh:'tdl-fh-key' };
function usKeys(){ const g=k=>{ try{ return (localStorage.getItem(US_KEYS[k])||'').trim(); }catch(e){ return ''; } }; return { apId:g('apId'), apSecret:g('apSecret'), fh:g('fh') }; }
function usSaveKeys(o){ for (const k of Object.keys(US_KEYS)) if (k in o){ try{ const v=String(o[k]||'').trim(); if (v) localStorage.setItem(US_KEYS[k], v); else localStorage.removeItem(US_KEYS[k]); }catch(e){} } }
function usOn(fn){ US.listeners.push(fn); }
function usEmit(kind, sym){ for (const fn of US.listeners){ try{ fn(kind, sym); }catch(e){ console.error(e); } } }
function usSet(status, err){ US.status=status; if (err!=null) US.err=String(err); usEmit('status'); }
const usQ = sym => US.q[sym] || (US.q[sym]={ last:null, prev:null, open:null, high:null, low:null, chg:null, bid:null, ask:null, t:0, trades:[], intra:[], daily:[], vol:0 });
// New York market hours: 09:30-16:00 on weekdays
function usMarketOpen(d){ d=d||new Date(); const ny=new Date(d.toLocaleString('en-US', { timeZone:'America/New_York' })), wd=ny.getDay(), m=ny.getHours()*60+ny.getMinutes(); return wd>=1 && wd<=5 && m>=570 && m<960; }
// spread calls out under a free plan's per-minute limit
async function usGet(url, headers, perMin){ const now=Date.now(); US.calls=US.calls.filter(t=>now-t<60000); if (US.calls.length>=perMin){ await new Promise(r=>setTimeout(r, 60000-(now-US.calls[0])+50)); }
  US.calls.push(Date.now()); const c=new AbortController(), tm=setTimeout(()=>c.abort(), 12000);
  try{ const r=await fetch(url, { headers, signal:c.signal }); if (r.status===401 || r.status===403) throw new Error('badkey'); if (r.status===429) throw new Error('limit'); if (!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  finally { clearTimeout(tm); } }
function usTrade(sym, px, t, v){ const q=usQ(sym); q.last=px; if (q.prev) q.chg=px/q.prev-1; q.t=t; q.vol+=v||0; q.trades.push({ t, px, q:v||0 }); if (q.trades.length>200) q.trades.shift();
  const m=Math.floor(t/60000)*60000, b=q.intra[q.intra.length-1]; if (b && b.t===m){ b.h=Math.max(b.h,px); b.l=Math.min(b.l,px); b.c=px; b.v+=v||0; } else { q.intra.push({ t:m, o:px, h:px, l:px, c:px, v:v||0 }); if (q.intra.length>500) q.intra.shift(); } }
// ---- Alpaca
const apH = () => { const k=usKeys(); return { 'APCA-API-KEY-ID':k.apId, 'APCA-API-SECRET-KEY':k.apSecret }; };
const apGet = path => usGet(US.AP_REST+path, apH(), 180);
const apBar = b => ({ t:Date.parse(b.t), o:b.o, h:b.h, l:b.l, c:b.c, v:b.v });
async function apSnapshots(){ const x=await apGet('/v2/stocks/snapshots?feed=iex&symbols='+LIVE_US.map(d=>d.sym).join(',')); let n=0;
  for (const d of LIVE_US){ const s=x && x[d.sym]; if (!s) continue; const q=usQ(d.sym), lt=s.latestTrade, lq=s.latestQuote, db=s.dailyBar, pb=s.prevDailyBar;
    q.last = lt && lt.p || (db && db.c) || q.last; q.prev = pb ? pb.c : q.prev; q.open=db ? db.o : q.open; q.high=db ? db.h : q.high; q.low=db ? db.l : q.low;
    q.bid = lq && lq.bp || q.bid; q.ask = lq && lq.ap || q.ask; q.chg = q.prev ? q.last/q.prev-1 : 0; q.t = lt ? Date.parse(lt.t) : Date.now(); n++; usEmit('tick', d.sym); }
  return n; }
async function apDaily(){ const start=new Date(Date.now()-300*864e5).toISOString().slice(0,10); let tok='', guard=0;
  do { const x=await apGet(`/v2/stocks/bars?feed=iex&timeframe=1Day&adjustment=all&limit=10000&start=${start}&symbols=${LIVE_US.map(d=>d.sym).join(',')}${tok ? '&page_token='+encodeURIComponent(tok) : ''}`);
    for (const s in (x.bars||{})){ const q=usQ(s); q.daily=q.daily.concat(x.bars[s].map(apBar)); } tok=x.next_page_token||''; } while (tok && ++guard<10);
  for (const d of LIVE_US){ const q=usQ(d.sym); q.daily.sort((a,b)=>a.t-b.t); q.daily=q.daily.filter((b,i,a)=>!i || b.t!==a[i-1].t).slice(-200); } }
async function apIntra(sym){ const start=new Date(Date.now()-3*864e5).toISOString(); const x=await apGet(`/v2/stocks/${encodeURIComponent(sym)}/bars?feed=iex&timeframe=1Min&limit=1000&start=${start}`); const q=usQ(sym); q.intra=(x.bars||[]).map(apBar).slice(-500); usEmit('bars', sym); }
async function apNews(sym){ const x=await apGet(`/v1beta1/news?limit=10&symbols=${encodeURIComponent(sym)}`); return (x.news||[]).map(n=>({ t:Date.parse(n.created_at), head:n.headline, src:n.source, url:n.url, sum:n.summary })); }
function apWS(){ const k=usKeys(); try{ if (US.ws) US.ws.close(); }catch(e){} const ws=new WebSocket(US.AP_WS); US.ws=ws;
  ws.onmessage=e=>{ US.lastMsg=Date.now(); let xs; try{ xs=JSON.parse(e.data); }catch(y){ return; } if (!Array.isArray(xs)) xs=[xs]; const seen=new Set();
    for (const m of xs){
      if (m.T==='success' && m.msg==='connected') ws.send(JSON.stringify({ action:'auth', key:k.apId, secret:k.apSecret }));
      else if (m.T==='success' && m.msg==='authenticated'){ US.retry=0; ws.send(JSON.stringify({ action:'subscribe', trades:LIVE_US.map(d=>d.sym), quotes:LIVE_US.map(d=>d.sym) })); usSet(usMarketOpen() ? 'live' : 'closed', ''); }
      else if (m.T==='error'){ if (m.code===402 || m.code===401) usSet('badkey', 'The keys were refused'); else if (m.code===406) usSet('busy', 'Another tab or app is using these keys'); else US.err=m.msg||''; }
      else if (m.T==='t' && LIVE_US.some(d=>d.sym===m.S)){ usTrade(m.S, m.p, Date.parse(m.t), m.s); seen.add(m.S); }
      else if (m.T==='q' && LIVE_US.some(d=>d.sym===m.S)){ const q=usQ(m.S); q.bid=m.bp||q.bid; q.ask=m.ap||q.ask; } }
    for (const s of seen) usEmit('trade', s); };
  ws.onclose=()=>{ if (['badkey','busy','nokey'].includes(US.status)) return; usSet('reconnecting'); const n=Math.min(6, ++US.retry); setTimeout(()=>{ if (US.src==='alpaca') apWS(); }, 1000*2**n); };
  ws.onerror=()=>{}; }
// ---- Finnhub (backup)
const fhGet = path => usGet(US.FH_REST+path, { 'X-Finnhub-Token':usKeys().fh }, 55);
async function fhQuotes(){ let n=0; for (const d of LIVE_US){ const x=await fhGet('/quote?symbol='+encodeURIComponent(d.sym)); if (!x || !(x.c>0)) continue; const q=usQ(d.sym);
  q.last=x.c; q.prev=x.pc; q.open=x.o; q.high=x.h; q.low=x.l; q.chg=x.pc ? x.c/x.pc-1 : 0; q.t=(x.t||0)*1000; n++; usEmit('tick', d.sym); } return n; }
async function fhNews(sym){ const to=new Date(), from=new Date(to-7*864e5), f=d=>d.toISOString().slice(0,10); const xs=await fhGet(`/company-news?symbol=${encodeURIComponent(sym)}&from=${f(from)}&to=${f(to)}`);
  return (xs||[]).slice(0,10).map(n=>({ t:n.datetime*1000, head:n.headline, src:n.source, url:n.url, sum:n.summary })); }
function fhWS(){ const k=usKeys().fh; try{ if (US.ws) US.ws.close(); }catch(e){} const ws=new WebSocket(US.FH_WS+'?token='+encodeURIComponent(k)); US.ws=ws;
  ws.onopen=()=>{ US.retry=0; for (const d of LIVE_US) ws.send(JSON.stringify({ type:'subscribe', symbol:d.sym })); usSet(usMarketOpen() ? 'live' : 'closed', ''); };
  ws.onmessage=e=>{ US.lastMsg=Date.now(); let m; try{ m=JSON.parse(e.data); }catch(x){ return; } if (m.type!=='trade' || !Array.isArray(m.data)) return; const seen=new Set();
    for (const tr of m.data){ if (!LIVE_US.some(d=>d.sym===tr.s)) continue; usTrade(tr.s, tr.p, tr.t, tr.v); seen.add(tr.s); } for (const s of seen) usEmit('trade', s); };
  ws.onclose=()=>{ if (['badkey','nokey'].includes(US.status)) return; usSet('reconnecting'); const n=Math.min(6, ++US.retry); setTimeout(()=>{ if (US.src==='finnhub') fhWS(); }, 1000*2**n); };
  ws.onerror=()=>{}; }
// ---- start, stop, and the calls the screens use
async function usStart(){ const k=usKeys(); usStop(true);
  if (k.apId && k.apSecret){ usSet('loading', '');
    try{ const n=await apSnapshots(); if (!n) throw new Error('empty'); US.src='alpaca'; try{ await apDaily(); }catch(e){} apWS();
      US.timer=setInterval(()=>{ if (US.src==='alpaca' && US.status!=='badkey') apSnapshots().catch(()=>{}); }, 60000); usEmit('boot'); return 'alpaca'; }
    catch(e){ if (!k.fh){ usSet(e.message==='badkey' ? 'badkey' : 'offline', e.message==='badkey' ? 'The Alpaca keys were refused' : 'Alpaca: '+e.message); return null; } } }
  if (k.fh){ usSet('loading', '');
    try{ const n=await fhQuotes(); if (!n) throw new Error('empty'); US.src='finnhub'; fhWS(); US.timer=setInterval(()=>{ if (US.src==='finnhub' && US.status!=='badkey') fhQuotes().catch(()=>{}); }, 60000); usEmit('boot'); return 'finnhub'; }
    catch(e){ usSet(e.message==='badkey' ? 'badkey' : 'offline', e.message==='badkey' ? 'The Finnhub key was refused' : 'Finnhub: '+e.message); return null; } }
  usSet('nokey', ''); return null; }
function usStop(quiet){ clearInterval(US.timer); US.timer=null; const ws=US.ws; US.ws=null; US.src=null; if (!quiet) usSet(usKeys().apId || usKeys().fh ? 'idle' : 'nokey'); try{ if (ws){ ws.onclose=null; ws.close(); } }catch(e){} }
async function usNews(sym){ return US.src==='alpaca' ? apNews(sym) : US.src==='finnhub' ? fhNews(sym) : []; }
async function usIntra(sym){ if (US.src==='alpaca') return apIntra(sym); }

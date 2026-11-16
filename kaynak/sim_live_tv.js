/* ---------- Tidewater Live: the whole US market, 15 minutes delayed, no key ----------
   Source: the screener service behind TradingView's own stock screener (scanner.tradingview.com). Free, no sign-up, readable from any web page.
   It is not an official public API: it can change without notice, so everything that uses it lives in this one file.
   - One call lists every primary listing on NASDAQ, NYSE and NYSE American (about 10,000 stocks, ETFs and ADRs), refreshed every few minutes.
   - A small call refreshes the symbols you are looking at (holdings, open orders, the selected one, the big names) every 20 seconds.
   Prices are delayed 15 minutes. Daily candles are not part of this source; minute candles are built from what this page sees while it is open. */
const MKT = {
  all:{}, list:[], status:'idle', err:'', t:0, tw:0, listeners:[], watch:[], timerU:null, timerW:null, busy:false,
  URL:'https://scanner.tradingview.com/america/scan', DELAY_MIN:15, EVERY_ALL:180000, EVERY_ALL_CLOSED:900000, EVERY_WATCH:20000,
};
const MKT_COLS = ['name','description','close','change','change_abs','open','high','low','volume','market_cap_basic','sector','type','exchange'];
const MKT_TAKEN = new Set((typeof LIVE_CRYPTO!=='undefined' ? LIVE_CRYPTO : []).map(d=>d.sym)); // tickers our coins already use
function mktOn(fn){ MKT.listeners.push(fn); }
function mktEmit(kind, sym){ for (const fn of MKT.listeners){ try{ fn(kind, sym); }catch(e){ console.error(e); } } }
function mktSet(status, err){ MKT.status=status; if (err!=null) MKT.err=String(err); mktEmit('status'); }
const mktKey = tk => MKT_TAKEN.has(tk) ? tk+'.US' : tk;
async function mktPost(body){ const c=new AbortController(), tm=setTimeout(()=>c.abort(), 20000);
  try{ const r=await fetch(MKT.URL, { method:'POST', body:JSON.stringify(body), headers:{ 'Content-Type':'text/plain' }, signal:c.signal }); if (!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  finally { clearTimeout(tm); } }
// one row from the screener into our record; keeps the minute bars we have built so far
function mktRow(x, now, bars){ const v=x.d, tk=v[0], last=v[2]; if (!tk || !(last>0)) return null; const key=mktKey(tk);
  const d=MKT.all[key] || (MKT.all[key]={ sym:key, tk, tv:x.s, kind:'stock', intra:[], daily:[] });
  d.name=v[1]||tk; d.last=last; d.chg=v[3]!=null ? v[3]/100 : null; d.prev=v[4]!=null ? last-v[4] : null; d.open=v[5]; d.high=v[6]; d.low=v[7]; d.vol=v[8]||0;
  d.cap=v[9]||null; d.sector=v[10]||''; d.type=v[11]==='fund' ? 'etf' : v[11]==='dr' ? 'adr' : 'stock'; d.ex=v[12]||''; d.val=last*(v[8]||0); d.t=now;
  if (bars && mktOpenNow()){ const m=Math.floor(now/60000)*60000, b=d.intra[d.intra.length-1];
    if (b && b.t===m){ b.h=Math.max(b.h,last); b.l=Math.min(b.l,last); b.c=last; }
    else { const o=b ? b.c : last; d.intra.push({ t:m, o, h:Math.max(o,last), l:Math.min(o,last), c:last, v:0 }); if (d.intra.length>400) d.intra.shift(); } }
  return d; }
async function mktLoadAll(){ const x=await mktPost({ filter:[{ left:'subtype', operation:'not_in_range', right:['preferred','unit','warrant','right'] }, { left:'exchange', operation:'in_range', right:['NASDAQ','NYSE','AMEX'] }, { left:'type', operation:'in_range', right:['stock','fund','dr'] }],
    columns:MKT_COLS, range:[0,20000], sort:{ sortBy:'market_cap_basic', sortOrder:'desc' } });
  const now=Date.now(), out=[]; const w=new Set(MKT.watch); for (const r of (x.data||[])){ const d=mktRow(r, now, w.has(mktKey(r.d[0]))); if (d) out.push(d); } if (out.length<100) throw new Error('empty');
  MKT.list=out; MKT.t=now; mktEmit('all'); return out.length; }
async function mktLoadWatch(){ const tv=[...new Set(MKT.watch.map(s=>MKT.all[s] && MKT.all[s].tv).filter(Boolean))]; if (!tv.length) return 0;
  const x=await mktPost({ symbols:{ tickers:tv }, columns:MKT_COLS }), now=Date.now(); let n=0; for (const r of (x.data||[])){ const d=mktRow(r, now, true); if (d){ n++; mktEmit('tick', d.sym); } } MKT.tw=now; return n; }
function mktSetWatch(syms){ MKT.watch=[...new Set(syms.filter(s=>MKT.all[s]))].slice(0, 400); }
function mktOpenNow(){ return typeof usMarketOpen==='function' ? usMarketOpen() : true; }
async function mktStart(){ if (MKT.timerU) return MKT.status; mktSet('loading', '');
  const all=async()=>{ if (MKT.busy) return; MKT.busy=true; try{ await mktLoadAll(); mktSet(mktOpenNow() ? 'live' : 'closed', ''); }catch(e){ mktSet(MKT.list.length ? 'stale' : 'offline', e.message); } finally { MKT.busy=false; } };
  await all();
  let lastAll=Date.now();
  MKT.timerU=setInterval(()=>{ const every=mktOpenNow() ? MKT.EVERY_ALL : MKT.EVERY_ALL_CLOSED; if (Date.now()-lastAll>=every){ lastAll=Date.now(); all(); } }, 30000);
  MKT.timerW=setInterval(()=>{ if (!mktOpenNow() && Date.now()-MKT.tw<MKT.EVERY_ALL_CLOSED) return; mktLoadWatch().then(n=>{ if (n && MKT.status!=='live' && MKT.status!=='closed') mktSet(mktOpenNow() ? 'live' : 'closed', ''); }).catch(e=>{ if (MKT.list.length) mktSet('stale', e.message); }); }, MKT.EVERY_WATCH);
  return MKT.status; }
function mktStop(){ clearInterval(MKT.timerU); clearInterval(MKT.timerW); MKT.timerU=MKT.timerW=null; }
// search by ticker or name; exact ticker first, then tickers that start with it, then names
function mktFind(s, n){ s=String(s||'').trim().toUpperCase(); if (!s) return []; const a=[], b=[], c=[];
  for (const d of MKT.list){ const tk=d.tk.toUpperCase(); if (tk===s) a.push(d); else if (tk.startsWith(s)) b.push(d); else if (d.name.toUpperCase().includes(s)) c.push(d); if (a.length+b.length>=n && c.length>=n) break; }
  const size=d=>d.cap || d.val/50 || 0; b.sort((x,y)=>size(y)-size(x)); c.sort((x,y)=>size(y)-size(x)); return a.concat(b, c).slice(0, n||8); }

// details for one listing: how it did over time, its 52-week range and a few key numbers (kept for 10 minutes)
const MKT_DCOLS = ['Perf.W','Perf.1M','Perf.3M','Perf.6M','Perf.YTD','Perf.Y','Perf.5Y','price_52_week_high','price_52_week_low','price_earnings_ttm','dividend_yield_recent','RSI','SMA50','SMA200','average_volume_30d_calc','beta_1_year','earnings_release_next_date'];
async function mktDetail(sym){ const d=MKT.all[sym]; if (!d) return null; if (d.det && Date.now()-d.det.t<600000) return d.det;
  const x=await mktPost({ symbols:{ tickers:[d.tv] }, columns:MKT_DCOLS }), v=x.data && x.data[0] && x.data[0].d; if (!v) return null; const p=k=>v[k]!=null ? v[k]/100 : null;
  d.det={ t:Date.now(), perf:[['1W',p(0)],['1M',p(1)],['3M',p(2)],['6M',p(3)],['YTD',p(4)],['1Y',p(5)],['5Y',p(6)]], hi52:v[7], lo52:v[8], pe:v[9], dy:v[10]!=null ? v[10]/100 : null, rsi:v[11], sma50:v[12], sma200:v[13], avgv:v[14], beta:v[15], next:v[16] ? v[16]*1000 : null };
  mktEmit('detail', sym); return d.det; }

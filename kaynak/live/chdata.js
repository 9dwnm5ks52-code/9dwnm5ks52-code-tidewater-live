/* ---------- Phoenix Finance Club: candles per timeframe for the pro chart (piece 2, prefix CD) ----------
   cdBars(sym, tf) → ascending bars { t, o, h, l, c, v } for the instrument and timeframe, or null while the first
   download is running (it starts the download itself, once per sym|tf, and calls render() when bars arrive).
   Crypto: Binance klines (Coinbase candles as the fallback; 4h and 1w are built from 1h / 1d there). The last bar is kept
   live from the 1-minute bars built from live trades (quote(sym).intra) and from quote(sym).last; a new bar starts when
   the period rolls over. Stocks: built from quote(sym).intra (1m) and quote(sym).daily, no network.
   cdMore(sym, tf) loads older history (1000 more bars per call, at most CD.MAX in all) and resolves to how many were added.
   cdAgg(bars, ms) groups bars into buckets of ms aligned to UTC (weeks start on Monday 00:00 UTC, like Binance).
   cdErr(sym, tf) → the last download error for a chart that has no bars yet ('' otherwise). cdMoreLeft(sym, tf) → whether cdMore
   can still add bars (a 0 from cdMore while this is true means "busy or failed: ask again later"). Nothing here ever throws. */
const CD_TF = {
  '1s': { ms:1e3,     bn:'1s',  cb:0 },     // Binance only (Coinbase has no 1-second candles); kept live from every trade
  '1m': { ms:6e4,     bn:'1m',  cb:60 },
  '5m': { ms:3e5,     bn:'5m',  cb:300 },
  '15m':{ ms:9e5,     bn:'15m', cb:900 },
  '1h': { ms:36e5,    bn:'1h',  cb:3600 },
  '4h': { ms:144e5,   bn:'4h',  cb:3600,  cbPages:4 },   // Coinbase has no 4h: 4 pages of 1h (1200 h → 300 bars)
  '1d': { ms:864e5,   bn:'1d',  cb:86400 },
  '1w': { ms:6048e5,  bn:'1w',  cb:86400, cbPages:3 },   // Coinbase has no 1w: 3 pages of 1d (900 days → ~128 weeks)
};
const CD_WEEK = 6048e5, CD_MON = 4*864e5;   // 1970-01-01 was a Thursday: Mondays are 4 days after the epoch
const CD = {
  c: new Map(),          // 'sym|tf' → { bars:null|[], t:last REST try (ms), ok:last good load, busy:Promise|null, src:'bn'|'cb'|null, end:bool, seeded:bool, err:'', fails:0, sig, out }
  MAX: 5000,             // most bars kept per sym|tf
  KEYS: 48,              // most sym|tf entries kept (least recently used ones are dropped)
  now: () => Date.now(), // tests replace this
  RETRY: 15000,          // first retry after a failed download (doubles each time, up to the refresh interval)
};
const cdTf = tf => CD_TF[tf] || CD_TF['1m'];
// how often the REST bars of a timeframe are refreshed: 1m and 5m every minute, the rest every 5 minutes
const cdEvery = tf => (tf==='1s' || tf==='1m' || tf==='5m') ? 6e4 : 3e5;
const cdBucket = (t, ms) => ms===CD_WEEK ? Math.floor((t-CD_MON)/ms)*ms+CD_MON : Math.floor(t/ms)*ms;
const cdOk = b => b && isFinite(b.t) && isFinite(b.o) && isFinite(b.h) && isFinite(b.l) && isFinite(b.c);

// group ascending bars into UTC buckets of ms: open of the first, highest high, lowest low, close of the last, summed volume
function cdAgg(bars, ms){ const out=[]; if (!Array.isArray(bars) || !(ms>0)) return out; let cur=null;
  for (const b of bars){ if (!cdOk(b)) continue; const t=cdBucket(b.t, ms);
    if (cur && t===cur.t){ if (b.h>cur.h) cur.h=b.h; if (b.l<cur.l) cur.l=b.l; cur.c=b.c; cur.v+=+b.v||0; }
    else if (!cur || t>cur.t){ cur={ t, o:b.o, h:b.h, l:b.l, c:b.c, v:+b.v||0 }; out.push(cur); } }
  return out; }
// like cdAgg, but drops the oldest bucket when the base bars start part-way into it (it would show a wrong open and low volume)
function cdAggFull(base, ms){ const out=cdAgg(base, ms); const f=base.find(cdOk); if (out.length && f && f.t!==out[0].t) out.shift(); return out; }
// merge two ascending bar lists; for the same open time the newer download wins
function cdMerge(old, fresh){ if (!old || !old.length) return fresh.slice(); if (!fresh.length) return old.slice(); const m=new Map();
  for (const b of old) m.set(b.t, b); for (const b of fresh) m.set(b.t, b); return [...m.values()].sort((a,b)=>a.t-b.t); }

// ---- downloads
async function cdBinance(d, tf, endTime, limit){ const x=cdTf(tf);
  const r=await liveJSON(`${LIVE.BN_REST}/klines?symbol=${d.bn}&interval=${x.bn}&limit=${Math.max(1, Math.min(1000, limit||1000))}${endTime!=null ? '&endTime='+endTime : ''}`);
  if (!Array.isArray(r)) throw new Error('bad reply'); return r.map(bnBar).filter(cdOk).sort((a,b)=>a.t-b.t); }
// Coinbase returns at most 300 candles per call, newest first; pages walk back in time from endTime
async function cdCoinbase(d, tf, endTime, pages){ const x=cdTf(tf), g=x.cb*1000; let base=[], end=endTime;
  for (let i=0;i<pages;i++){ if (end!=null) end=Math.floor(end/g)*g;   // the open time of the newest candle wanted
    const q=end==null ? '' : `&start=${new Date(end-299*g).toISOString()}&end=${new Date(end).toISOString()}`;
    const r=await liveJSON(`${LIVE.CB_REST}/products/${d.cb}/candles?granularity=${x.cb}${q}`);
    if (!Array.isArray(r)) throw new Error('bad reply'); const bs=r.map(cbBar).filter(cdOk).sort((a,b)=>a.t-b.t);
    if (!bs.length) break; base=cdMerge(bs, base); end=bs[0].t-g; }   // gaps (hours with no trades) can make a page short, so keep going
  return x.cb*1000===x.ms ? base : cdAggFull(base, x.ms); }
// one download from the source that worked last time, falling back to the other one
async function cdFetch(sym, tf, c, endTime, limit){ const d=liveDef(sym); if (!d) throw new Error('unknown coin');
  const x=cdTf(tf), pref=c.src || (typeof LIVE!=='undefined' && LIVE.src==='coinbase' && d.cb ? 'cb' : 'bn'), order=pref==='cb' ? ['cb','bn'] : ['bn','cb']; let err=null;
  for (const s of order){ if (s==='cb' && (!d.cb || !x.cb)) continue; if (s==='bn' && !d.bn) continue;
    try{ const pages=x.cbPages ? (limit && limit<1000 ? 1 : x.cbPages) : (limit && limit<300 ? 1 : 2);
      const bars=s==='bn' ? await cdBinance(d, tf, endTime, limit) : await cdCoinbase(d, tf, endTime, pages);
      if (bars.length || endTime!=null) return { bars, src:s }; err=new Error('no candles'); }
    catch(e){ err=e; } }
  throw err || new Error('no source'); }

function cdEntry(key){ let c=CD.c.get(key);
  if (c){ CD.c.delete(key); CD.c.set(key, c); return c; }   // most recently used goes last
  c={ bars:null, t:0, ok:0, busy:null, src:null, end:false, seeded:false, err:'', fails:0, sig:'', out:null }; CD.c.set(key, c);
  if (CD.c.size>CD.KEYS){ for (const [k, v] of CD.c){ if (CD.c.size<=CD.KEYS) break; if (k!==key) CD.c.delete(k); } }   // a download still running for a dropped entry just finishes into nothing
  return c; }
const cdRender = () => { if (typeof render==='function'){ try{ render(); }catch(e){} } };

// (re)load the newest bars; one request at a time per sym|tf
function cdLoad(sym, tf, c){ if (c.busy) return c.busy; const now=CD.now(), x=cdTf(tf); c.t=now;
  const first=!c.bars || c.seeded || !c.bars.length, last=first ? null : c.bars[c.bars.length-1];
  const limit=first ? 1000 : Math.max(10, Math.min(1000, Math.ceil((now-last.t)/x.ms)+3));
  c.busy=(async()=>{ try{ const r=await cdFetch(sym, tf, c, null, limit);
      if (first || r.src!==c.src) c.bars=r.bars.slice(-CD.MAX); else c.bars=cdMerge(c.bars, r.bars).slice(-CD.MAX);
      if (first || r.src!==c.src) c.end=false;
      if (x.ms===1e3 && r.bars.length) cdRefold(c, sym, r.bars[r.bars.length-1].t);
      c.src=r.src; c.seeded=false; c.err=''; c.fails=0; c.ok=CD.now(); c.sig=''; }
    catch(e){ c.err=String(e && e.message || e || 'error'); c.fails++;
      // try again soon (15 s, 30 s, 60 s …, never later than the normal refresh)
      c.t=CD.now()-cdEvery(tf)+Math.min(cdEvery(tf), CD.RETRY*2**(c.fails-1)); }
    finally { c.busy=null; cdRender(); } })();
  return c.busy; }

// ---- 1-second candles: every trade from the websocket (quote.trades: { t, px, q }) goes into its second; seconds with no
// trade become flat bars at the previous close with no volume, the way Binance's own 1s klines look
function cd1sPut(c, B, px, v, id){ const bars=c.bars, I=c.ids||(c.ids=new Map()); let last=bars[bars.length-1], b=null;
  if (B<last.t){ for (let k=bars.length-1;k>=0 && bars[k].t>=B;k--) if (bars[k].t===B){ b=bars[k]; break; } if (!b) return; }   // a late trade for an older second
  else { if (B>last.t){
      if (B-last.t>6e5){ c.t=0; bars.push({ t:B, o:px, h:px, l:px, c:px, v:0 }); }   // more than 10 minutes missed (tab asleep): start here and download the gap
      else { while (last.t+1e3<B){ last={ t:last.t+1e3, o:last.c, h:last.c, l:last.c, c:last.c, v:0 }; bars.push(last); } bars.push({ t:B, o:px, h:px, l:px, c:px, v:0 }); }
      if (id!=null) I.set(B, { lo:id, hi:id }); }
    b=bars[bars.length-1]; }
  const c0=b.c;
  // a second that so far had no trade (a flat bar, opened early by the clock): its first real trade opens it afresh
  if (v>0 && !(b.v>0) && !I.has(B)){ b.o=b.h=b.l=b.c=px; if (id!=null) I.set(B, { lo:id, hi:id }); }
  if (px>b.h) b.h=px; if (px<b.l) b.l=px; b.v+=v;
  if (id==null){ if (b===bars[bars.length-1]) b.c=px; }   // no trade number (Coinbase, the quoted price): newest wins
  else { let r=I.get(B); if (!r){ r={ lo:-Infinity, hi:id }; I.set(B, r); b.c=px; }   // a second that came from the download: its open stays
    else { if (id>r.hi){ r.hi=id; b.c=px; } if (id<r.lo){ r.lo=id; b.o=px; } } }
  // an older second's close changed: the flat seconds after it carry the new close
  if (b.c!==c0 && b!==bars[bars.length-1]){ let k=bars.indexOf(b)+1; while (k<bars.length && !(bars[k].v>0) && !I.has(bars[k].t)){ const f=bars[k]; f.o=f.h=f.l=f.c=b.c; k++; } }
  if (I.size>400) for (const k of I.keys()){ if (k<B-3e5) I.delete(k); else break; } }
// the websocket's trades for a coin ({ t, px, q, id }); quote() itself does not pass them on
function cdTrades(sym, q){ if (q && Array.isArray(q.trades)) return q.trades; try{ const x=typeof LIVE!=='undefined' && LIVE.q && LIVE.q[sym]; return x && Array.isArray(x.trades) ? x.trades : []; }catch(e){ return []; } }
function cd1s(c, q, now, sym){ const bars=c.bars, seen=c.seen||(c.seen=new WeakSet()), tr=cdTrades(sym, q);
  for (const x of tr){ if (!x || typeof x!=='object' || seen.has(x)) continue; seen.add(x); const px=+x.px;
    if (!(px>0) || !isFinite(px) || !isFinite(x.t)) continue; cd1sPut(c, Math.floor(x.t/1e3)*1e3, px, +x.q>0 ? +x.q : 0, isFinite(x.id) ? x.id : null); c.heard=now; }
  // no trade for a while: the clock moves the chart on. While the trade stream is live, a quiet second is flat at the last
  // close (exactly what Binance records); only without a trade stream (Coinbase, or not this coin) does the quoted price fill in
  const flow=now-(c.heard||-Infinity)<15e3, px=flow ? bars[bars.length-1].c : +q.last;
  if (px>0 && isFinite(px) && now-(c.heard||0)>1500){ const B=Math.floor(now/1e3)*1e3; if (B>bars[bars.length-1].t) cd1sPut(c, B, px, 0); }
  if (bars.length>CD.MAX) bars.splice(0, bars.length-CD.MAX); }
// each trade goes into its second the moment it arrives: the page keeps only the last 200 trades, and a busy second can
// bring more than that between two screen updates
if (typeof liveOn==='function') liveOn((kind, sym)=>{ try{ if (kind!=='trade' && kind!=='tick') return; const c=CD.c.get(sym+'|1s'); if (!c || !c.bars || !c.bars.length) return;
  const tr=cdTrades(sym, null), x=tr[tr.length-1], seen=c.seen||(c.seen=new WeakSet()); if (!x || typeof x!=='object' || seen.has(x)) return; seen.add(x);
  const px=+x.px; if (!(px>0) || !isFinite(px) || !isFinite(x.t)) return; cd1sPut(c, Math.floor(x.t/1e3)*1e3, px, +x.q>0 ? +x.q : 0, isFinite(x.id) ? x.id : null); c.heard=CD.now();
  if (c.bars.length>CD.MAX) c.bars.splice(0, c.bars.length-CD.MAX); }catch(e){} });
// after a download the newest downloaded second (and anything after it) is rebuilt from the trades, so nothing counts twice
function cdRefold(c, sym, cut){ const bars=c.bars; if (!bars || !bars.length) return;
  let q=null; try{ q=typeof quote==='function' ? quote(sym) : null; }catch(e){ q=null; }
  const all=cdTrades(sym, q), tr=all.filter(x=>x && x.t>=cut && +x.px>0);
  if (!tr.length) return;   // no trades from that second on: keep the downloaded bar as it is
  while (bars.length>1 && bars[bars.length-1].t>=cut) bars.pop(); if (c.ids) for (const k of [...c.ids.keys()]) if (k>=cut) c.ids.delete(k);
  c.seen=new WeakSet(all.filter(x=>x && typeof x==='object' && !(x.t>=cut))); }

// keep the newest bar live: trades since its open (1-minute bars in quote.intra), then the last price, then rollover
function cdLive(c, q, ms, now, sym){ const bars=c.bars; if (!bars || !bars.length || !q) return; if (ms===1e3){ cd1s(c, q, now, sym); return; } let last=bars[bars.length-1];
  const intra=Array.isArray(q.intra) ? q.intra : [];
  if (intra.length && cdOk(intra[intra.length-1]) && intra[intra.length-1].t>=last.t){ let i=intra.length-1; while (i>0 && intra[i-1].t>=last.t) i--;
    const add=ms===6e4 ? intra.slice(i).filter(cdOk) : cdAgg(intra.slice(i), ms);
    for (const a of add){ last=bars[bars.length-1];
      if (a.t===last.t){ if (a.h>last.h) last.h=a.h; if (a.l<last.l) last.l=a.l; last.c=a.c; if ((+a.v||0)>(+last.v||0)) last.v=+a.v; }
      else if (a.t>last.t) bars.push({ t:a.t, o:a.o, h:a.h, l:a.l, c:a.c, v:+a.v||0 }); } }
  const px=+q.last; if (!(px>0) || !isFinite(px)) return; last=bars[bars.length-1];
  const B=cdBucket(now, ms);
  if (B>last.t){ bars.push({ t:B, o:px, h:px, l:px, c:px, v:0 }); if (B-last.t>ms) c.t=0;   // missed whole periods (tab asleep): refresh now
    if (bars.length>CD.MAX) bars.splice(0, bars.length-CD.MAX); }
  else if (B===last.t){ if (px>last.h) last.h=px; if (px<last.l) last.l=px; last.c=px; } }

// bars to show before the first download lands: 1m from the live 1-minute bars, 1d/1w from the daily bars loaded at start
function cdSeed(q, tf, sym){ if (!q) return null;
  if (tf==='1s'){ const t=cdTrades(sym, q).find(x=>x && +x.px>0 && isFinite(x.t)); if (!t) return null;   // the trades fill the rest in
    const px=+t.px; return [{ t:Math.floor(t.t/1e3)*1e3, o:px, h:px, l:px, c:px, v:0 }]; }
  const intra=(q.intra||[]).filter(cdOk), daily=(q.daily||[]).filter(cdOk);
  if (tf==='1m' && intra.length>=2) return intra.map(b=>({ ...b, v:+b.v||0 }));
  if (tf==='1d' && daily.length>=2) return daily.map(b=>({ ...b, v:+b.v||0 }));
  if (tf==='1w' && daily.length>=7) return cdAgg(daily, CD_WEEK);
  return null; }

// ---- stocks: no network here, everything is built from the quote's own 1m and daily bars
let cdNyFmt=null;
const cdNyDay = t => { try{ cdNyFmt=cdNyFmt || new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }); return cdNyFmt.format(new Date(t)); }catch(e){ return new Date(t).toISOString().slice(0,10); } };
function cdStock(sym, tf, q, c){ const intra=Array.isArray(q.intra) ? q.intra : [], daily=Array.isArray(q.daily) ? q.daily : [], src=tf==='1d' || tf==='1w' ? daily : intra, lb=src[src.length-1];
  const now=CD.now(), sig=`${src.length}|${lb ? lb.t+'|'+lb.h+'|'+lb.l+'|'+lb.c+'|'+lb.v : ''}|${q.last}|${q.open ? 1 : 0}|${tf==='1d' || tf==='1w' ? cdNyDay(now) : ''}`;
  if (c.out && c.sig===sig) return c.out;
  let out;
  if (tf==='1d' || tf==='1w'){ out=daily.filter(cdOk).map(b=>({ ...b, v:+b.v||0 }));
    const px=+q.last, last=out[out.length-1];
    // while the market is open the newest daily bar follows the price (a new one starts on a new New York day)
    if (last && px>0 && q.open){ const dl=cdNyDay(last.t+12*36e5), dn=cdNyDay(now);   // +12 h: daily bars open at New York midnight (04:00 or 05:00 UTC) or UTC midnight
      if (dl===dn){ last.h=Math.max(last.h, px); last.l=Math.min(last.l, px); last.c=px; }
      else if (dn>dl){ const k=Math.round((Date.parse(dn)-Date.parse(dl))/864e5); out.push({ t:last.t+k*864e5, o:px, h:px, l:px, c:px, v:0 }); } }
    if (tf==='1w') out=cdAgg(out, CD_WEEK); }
  else out=tf==='1m' ? intra.filter(cdOk).map(b=>({ ...b, v:+b.v||0 })) : cdAgg(intra, cdTf(tf).ms);
  c.sig=sig; c.out=out; c.bars=out; return out; }

function cdBars(sym, tf){ try{
  if (!CD_TF[tf]) tf='1m'; const key=sym+'|'+tf, c=cdEntry(key), x=cdTf(tf), now=CD.now();
  let q=null; try{ q=typeof quote==='function' ? quote(sym) : null; }catch(e){ q=null; }
  const d=typeof liveDef==='function' ? liveDef(sym) : null;
  if (!d){ return q ? cdStock(sym, tf, q, c) : []; }
  if (!c.bars){ const s=cdSeed(q, tf, sym); if (s){ c.bars=s; c.seeded=true; } }
  if (!c.busy && now-c.t>=cdEvery(tf)) cdLoad(sym, tf, c);   // c.t starts at 0, so the first call loads at once
  cdLive(c, q, x.ms, now, sym);
  if (!c.busy && c.t===0 && c.bars) cdLoad(sym, tf, c);   // cdLive saw missed periods
  return c.bars;
} catch(e){ try{ console.error(e); }catch(z){} return null; } }

// older history for the chart's left edge
function cdMore(sym, tf){ try{
  if (!CD_TF[tf]) tf='1m'; const d=typeof liveDef==='function' ? liveDef(sym) : null; if (!d) return Promise.resolve(0);
  const c=cdEntry(sym+'|'+tf); if (c.busy) return c.busy.then(()=>0);
  if (!c.bars || !c.bars.length || c.seeded || c.end || c.bars.length>=CD.MAX) return Promise.resolve(0);
  const firstT=c.bars[0].t, room=CD.MAX-c.bars.length;
  c.busy=(async()=>{ let n=0; try{ const r=await cdFetch(sym, tf, c, firstT-1, Math.min(1000, room));
      const older=r.bars.filter(b=>b.t<firstT && cdOk(b));
      if (!older.length) c.end=true;
      else { const keep=older.slice(-room); n=keep.length; c.bars=cdMerge(keep, c.bars); c.sig=''; }
      c.err=''; }
    catch(e){ c.err=String(e && e.message || e || 'error'); }
    finally { c.busy=null; if (n) cdRender(); }
    return n; })();
  return c.busy;
} catch(e){ return Promise.resolve(0); } }

function cdErr(sym, tf){ const c=CD.c.get(sym+'|'+(CD_TF[tf] ? tf : '1m')); return c && (!c.bars || !c.bars.length) ? c.err : ''; }
// can cdMore still add older bars? false at the start of the exchange's history, at CD.MAX bars, and for stocks
function cdMoreLeft(sym, tf){ try{ const d=typeof liveDef==='function' ? liveDef(sym) : null; if (!d) return false;
  const c=CD.c.get(sym+'|'+(CD_TF[tf] ? tf : '1m')); return !c || !(c.end || (c.bars && c.bars.length>=CD.MAX)); } catch(e){ return false; } }

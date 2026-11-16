/* ---------- Tidewater Live: real market data (free sources only) ----------
   Crypto: Binance public market data (data-api / data-stream .binance.vision), no key; Coinbase Exchange as a fallback.
   The rest of the engine reads LIVE.q[sym] and never talks to a data source directly. */
const LIVE_CRYPTO = [
  { sym:'BTC', name:'Bitcoin', sector:'Layer 1', bn:'BTCUSDT', cb:'BTC-USD' },
  { sym:'ETH', name:'Ethereum', sector:'Layer 1', bn:'ETHUSDT', cb:'ETH-USD' },
  { sym:'SOL', name:'Solana', sector:'Layer 1', bn:'SOLUSDT', cb:'SOL-USD' },
  { sym:'BNB', name:'BNB', sector:'Exchange', bn:'BNBUSDT', cb:null },
  { sym:'XRP', name:'XRP', sector:'Payments', bn:'XRPUSDT', cb:'XRP-USD' },
  { sym:'ADA', name:'Cardano', sector:'Layer 1', bn:'ADAUSDT', cb:'ADA-USD' },
  { sym:'DOGE', name:'Dogecoin', sector:'Meme', bn:'DOGEUSDT', cb:'DOGE-USD' },
  { sym:'AVAX', name:'Avalanche', sector:'Layer 1', bn:'AVAXUSDT', cb:'AVAX-USD' },
  { sym:'LINK', name:'Chainlink', sector:'DeFi', bn:'LINKUSDT', cb:'LINK-USD' },
  { sym:'DOT', name:'Polkadot', sector:'Layer 1', bn:'DOTUSDT', cb:'DOT-USD' },
  { sym:'LTC', name:'Litecoin', sector:'Payments', bn:'LTCUSDT', cb:'LTC-USD' },
  { sym:'TRX', name:'TRON', sector:'Layer 1', bn:'TRXUSDT', cb:null },
];
const LIVE = {
  q:{},                 // sym -> { last, open, high, low, vol, bid, ask, book:{bids:[[px,q]],asks:[[px,q]]}, trades:[{t,px,q,buy}], daily:[{t,o,h,l,c,v}], intra:[{t,o,h,l,c,v}], t }
  src:null,             // 'binance' | 'coinbase' | null
  status:'idle',        // idle | loading | live | reconnecting | offline
  focus:null, ws:null, err:'', lastMsg:0, listeners:[], retry:0,
  BN_REST:'https://data-api.binance.vision/api/v3', BN_WS:'wss://data-stream.binance.vision/stream',
  CB_REST:'https://api.exchange.coinbase.com', CB_WS:'wss://ws-feed.exchange.coinbase.com',
};
const LIVE_EXTRA = [];   // more coins, added at start from the crypto screen's list; priced by polling, streamed only while on screen
const liveDef = sym => LIVE_CRYPTO.find(d=>d.sym===sym) || LIVE_EXTRA.find(d=>d.sym===sym);
const liveByBn = (bn, s) => { const all=LIVE_CRYPTO.concat(LIVE_EXTRA); return all.find(z=>z.bn===bn) || (s ? all.find(z=>s.startsWith(z.bn.toLowerCase()+'@')) : null); };
function liveOn(fn){ LIVE.listeners.push(fn); }
function liveEmit(kind, sym){ for (const fn of LIVE.listeners){ try{ fn(kind, sym); }catch(e){ console.error(e); } } }
function liveSet(status, err){ LIVE.status=status; if (err!=null) LIVE.err=String(err); liveEmit('status'); }
const liveQ = sym => LIVE.q[sym] || (LIVE.q[sym]={ last:null, open:null, high:null, low:null, vol:0, bid:null, ask:null, book:{ bids:[], asks:[] }, trades:[], daily:[], intra:[], t:0 });
async function liveJSON(url, ms){ const c=new AbortController(), tm=setTimeout(()=>c.abort(), ms||10000); try{ const r=await fetch(url, { signal:c.signal }); if (!r.ok) throw new Error('HTTP '+r.status); return await r.json(); } finally { clearTimeout(tm); } }
const bnBar = k => ({ t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5] });
const cbBar = k => ({ t:k[0]*1000, l:+k[1], h:+k[2], o:+k[3], c:+k[4], v:+k[5] });   // Coinbase: [time, low, high, open, close, volume], newest first
// ---- Binance
async function liveBinanceBoot(){
  const syms=LIVE_CRYPTO.map(d=>d.bn), t24=await liveJSON(`${LIVE.BN_REST}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms))}`);
  for (const x of t24){ const d=LIVE_CRYPTO.find(z=>z.bn===x.symbol); if (!d) continue; const q=liveQ(d.sym); q.last=+x.lastPrice; q.open=+x.openPrice; q.high=+x.highPrice; q.low=+x.lowPrice; q.vol=+x.quoteVolume; q.bid=+x.bidPrice; q.ask=+x.askPrice; q.t=Date.now(); }
  await Promise.all(LIVE_CRYPTO.map(async d=>{ try{ liveQ(d.sym).daily=(await liveJSON(`${LIVE.BN_REST}/klines?symbol=${d.bn}&interval=1d&limit=200`)).map(bnBar); }catch(e){} }));
}
function liveBinanceWS(){ const streams=LIVE_CRYPTO.map(d=>d.bn.toLowerCase()+'@miniTicker').join('/'), ws=new WebSocket(`${LIVE.BN_WS}?streams=${streams}`); LIVE.ws=ws;
  ws.onopen=()=>{ LIVE.retry=0; liveSet('live', ''); if (LIVE.focus) liveFocus(LIVE.focus, true); };
  ws.onmessage=e=>{ LIVE.lastMsg=Date.now(); let m; try{ m=JSON.parse(e.data); }catch(x){ return; } const s=m.stream||'', x=m.data; if (!x) return;
    const d=liveByBn((x.s||'').toUpperCase(), s); if (!d) return; const q=liveQ(d.sym);
    if (x.e==='24hrMiniTicker'){ q.last=+x.c; q.open=+x.o; q.high=+x.h; q.low=+x.l; q.vol=+x.q; q.t=x.E; liveEmit('tick', d.sym); }
    else if (x.e==='trade'){ const tr={ t:x.T, px:+x.p, q:+x.q, buy:!x.m, id:x.t }; q.trades.push(tr); if (q.trades.length>200) q.trades.shift(); q.last=tr.px; liveBar(q, tr); liveEmit('trade', d.sym); }
    else if (s.includes('@depth')){ q.book={ bids:(x.bids||[]).map(b=>[+b[0],+b[1]]), asks:(x.asks||[]).map(a=>[+a[0],+a[1]]) }; q.bid=q.book.bids[0] ? q.book.bids[0][0] : q.bid; q.ask=q.book.asks[0] ? q.book.asks[0][0] : q.ask; liveEmit('book', d.sym); } };
  ws.onclose=()=>liveReconnect(); ws.onerror=()=>{}; }
// ---- Coinbase (fallback)
async function liveCoinbaseBoot(){
  await Promise.all(LIVE_CRYPTO.filter(d=>d.cb).map(async d=>{ try{ const q=liveQ(d.sym), tk=await liveJSON(`${LIVE.CB_REST}/products/${d.cb}/ticker`), st=await liveJSON(`${LIVE.CB_REST}/products/${d.cb}/stats`);
    q.last=+tk.price; q.bid=+tk.bid; q.ask=+tk.ask; q.open=+st.open; q.high=+st.high; q.low=+st.low; q.vol=+st.volume*q.last; q.t=Date.now();
    q.daily=(await liveJSON(`${LIVE.CB_REST}/products/${d.cb}/candles?granularity=86400`)).map(cbBar).reverse(); }catch(e){} }));
}
function liveCoinbaseWS(){ const ids=LIVE_CRYPTO.filter(d=>d.cb).map(d=>d.cb), ws=new WebSocket(LIVE.CB_WS); LIVE.ws=ws;
  ws.onopen=()=>{ ws.send(JSON.stringify({ type:'subscribe', product_ids:ids, channels:['ticker'] })); LIVE.retry=0; liveSet('live', ''); };
  ws.onmessage=e=>{ LIVE.lastMsg=Date.now(); let x; try{ x=JSON.parse(e.data); }catch(y){ return; } if (x.type!=='ticker') return; const d=LIVE_CRYPTO.find(z=>z.cb===x.product_id); if (!d) return; const q=liveQ(d.sym);
    q.last=+x.price; q.bid=+x.best_bid; q.ask=+x.best_ask; q.open=+x.open_24h; q.high=+x.high_24h; q.low=+x.low_24h; q.vol=+x.volume_24h*q.last; q.t=Date.parse(x.time)||Date.now();
    const tr={ t:q.t, px:q.last, q:+x.last_size||0, buy:x.side==='buy' }; q.trades.push(tr); if (q.trades.length>200) q.trades.shift(); liveBar(q, tr); liveEmit('tick', d.sym); };
  ws.onclose=()=>liveReconnect(); ws.onerror=()=>{}; }
// ---- shared
// one-minute bars built from live trades, so a chart can move between candle downloads
function liveBar(q, tr){ const m=Math.floor(tr.t/60000)*60000, b=q.intra[q.intra.length-1]; if (b && b.t===m){ b.h=Math.max(b.h,tr.px); b.l=Math.min(b.l,tr.px); b.c=tr.px; b.v+=tr.q; } else { q.intra.push({ t:m, o:tr.px, h:tr.px, l:tr.px, c:tr.px, v:tr.q }); if (q.intra.length>500) q.intra.shift(); } }
async function liveIntra(sym, interval){ const d=liveDef(sym); if (!d) return; const q=liveQ(sym);
  try{ if (LIVE.src==='coinbase' && d.cb) q.intra=(await liveJSON(`${LIVE.CB_REST}/products/${d.cb}/candles?granularity=60`)).map(cbBar).reverse();
       else q.intra=(await liveJSON(`${LIVE.BN_REST}/klines?symbol=${d.bn}&interval=${interval||'1m'}&limit=300`)).map(bnBar); liveEmit('bars', sym); }catch(e){} }
// the instrument on screen also gets its order book and every trade (Binance only)
function liveFocus(sym, again){ const d=liveDef(sym); if (!d) return; const prev=LIVE.focus; LIVE.focus=sym; const ws=LIVE.ws;
  if (LIVE.src!=='binance' || !ws || ws.readyState!==1){ return; }
  const st=s=>[s.toLowerCase()+'@depth10@100ms', s.toLowerCase()+'@trade'];
  if (prev && prev!==sym && !again){ const pd=liveDef(prev); if (pd) ws.send(JSON.stringify({ method:'UNSUBSCRIBE', params:st(pd.bn), id:Date.now()%1e6 })); }
  ws.send(JSON.stringify({ method:'SUBSCRIBE', params:st(d.bn), id:(Date.now()+1)%1e6 })); if (!again) liveIntra(sym); }
function liveReconnect(){ if (LIVE.status==='offline') return; liveSet('reconnecting'); const n=Math.min(6, ++LIVE.retry); setTimeout(()=>{ (LIVE.src==='coinbase' ? liveCoinbaseWS : liveBinanceWS)(); }, 1000*2**n); }
async function liveStart(){ liveSet('loading', '');
  try{ await liveBinanceBoot(); if (!LIVE_CRYPTO.some(d=>liveQ(d.sym).last)) throw new Error('no prices'); LIVE.src='binance'; liveEmit('boot'); liveBinanceWS(); return 'binance'; }
  catch(e){ LIVE.err='Binance: '+(e.message||e); }
  try{ await liveCoinbaseBoot(); if (!LIVE_CRYPTO.some(d=>liveQ(d.sym).last)) throw new Error('no prices'); LIVE.src='coinbase'; liveEmit('boot'); liveCoinbaseWS(); return 'coinbase'; }
  catch(e){ liveSet('offline', LIVE.err+'; Coinbase: '+(e.message||e)); return null; } }
// a feed that goes quiet for 30 s is reopened
setInterval(()=>{ if (LIVE.status==='live' && LIVE.lastMsg && Date.now()-LIVE.lastMsg>30000){ try{ LIVE.ws.close(); }catch(e){} } }, 10000);

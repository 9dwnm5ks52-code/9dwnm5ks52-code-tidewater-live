/* ---------- Tidewater Live: the crypto screen's data (free, no key) ----------
   - Which coins: CoinGecko's top coins by market value (name, rank, market value, 7-day change, all-time high), every 10 minutes.
     Only coins with a Binance USDT market are kept; stablecoins, gold tokens and wrapped or staked copies are left out.
   - Their prices: Binance's public market data, every 10 seconds (the 12 main coins stream live through sim_live.js).
   - The mood: the Crypto Fear & Greed Index from alternative.me, and CoinGecko's total market value and Bitcoin's share. */
const CX = {
  list:[], all:{}, fng:[], glob:null, status:'idle', err:'', t:0, tp:0, listeners:[], timer:null, N:60,
  CG:'https://api.coingecko.com/api/v3', FNG:'https://api.alternative.me/fng/?limit=30',
};
function cxOn(fn){ CX.listeners.push(fn); }
function cxEmit(kind){ for (const fn of CX.listeners){ try{ fn(kind); }catch(e){ console.error(e); } } }
const CX_SKIP = /usd|eur|gbp|gold|wrapped|staked|bridged|liquid staking|treasury|fund|t-bill|yield|stable/i;
function cxKeep(c){ const s=String(c.symbol||''), n=String(c.name||''); if (!/^[a-z0-9]{2,10}$/i.test(s)) return false; if (CX_SKIP.test(n) || /usd|eur/i.test(s)) return false;
  if (c.current_price>0.97 && c.current_price<1.03 && Math.abs(c.price_change_percentage_24h||0)<1) return false; if (/^(w|st|cb|r|m)?(btc|eth)$/i.test(s) && !/^(btc|eth)$/i.test(s)) return false; return true; }
// build the list: CoinGecko's order and facts, Binance's markets
async function cxLoadList(){ const [cg, px]=await Promise.all([ liveJSON(`${CX.CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1&sparkline=false&price_change_percentage=1h,24h,7d`, 15000), liveJSON(`${LIVE.BN_REST}/ticker/price`, 15000) ]);
  const bn=new Set((px||[]).map(x=>x.symbol)), out=[];
  for (const c of cg||[]){ if (!cxKeep(c)) continue; const sym=c.symbol.toUpperCase(), core=LIVE_CRYPTO.find(d=>d.sym===sym), pair=core ? core.bn : sym+'USDT'; if (!bn.has(pair) || out.some(d=>d.sym===sym)) continue;
    const d=CX.all[sym] || (CX.all[sym]={ sym, bn:pair });
    Object.assign(d, { name:c.name, rank:c.market_cap_rank, cap:c.market_cap, c1h:(c.price_change_percentage_1h_in_currency||0)/100, c7d:(c.price_change_percentage_7d_in_currency||0)/100, ath:c.ath, athChg:(c.ath_change_percentage||0)/100, supply:c.circulating_supply, core:!!core });
    out.push(d); if (out.length>=CX.N) break; }
  if (out.length<10) throw new Error('empty');
  for (const d of out) if (!d.core && !LIVE_EXTRA.some(x=>x.sym===d.sym)) LIVE_EXTRA.push({ sym:d.sym, name:d.name, sector:'', bn:d.bn, cb:null });
  CX.list=out; CX.t=Date.now(); cxEmit('list'); return out.length; }
// prices of the coins that do not stream (one call for all of them)
async function cxPrices(){ const xs=CX.list.filter(d=>!d.core); if (!xs.length) return 0;
  const t24=await liveJSON(`${LIVE.BN_REST}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(xs.map(d=>d.bn)))}`, 12000); let n=0;
  for (const x of t24||[]){ const d=xs.find(z=>z.bn===x.symbol); if (!d) continue; const q=liveQ(d.sym), stream=LIVE.focus===d.sym && LIVE.src==='binance';
    if (!stream || !q.last) q.last=+x.lastPrice; q.open=+x.openPrice; q.high=+x.highPrice; q.low=+x.lowPrice; q.vol=+x.quoteVolume; if (!stream){ q.bid=+x.bidPrice; q.ask=+x.askPrice; } q.t=Date.now(); n++; liveEmit('tick', d.sym); }
  CX.tp=Date.now(); return n; }
async function cxMood(){ const [f, g]=await Promise.allSettled([ liveJSON(CX.FNG, 12000), liveJSON(`${CX.CG}/global`, 12000) ]);
  if (f.status==='fulfilled' && f.value && Array.isArray(f.value.data)) CX.fng=f.value.data.map(x=>({ v:+x.value, k:x.value_classification, t:+x.timestamp*1000 })).reverse();
  if (g.status==='fulfilled' && g.value && g.value.data){ const x=g.value.data; CX.glob={ cap:x.total_market_cap && x.total_market_cap.usd, vol:x.total_volume && x.total_volume.usd, btc:(x.market_cap_percentage||{}).btc/100, eth:(x.market_cap_percentage||{}).eth/100, chg:(x.market_cap_change_percentage_24h_usd||0)/100, coins:x.active_cryptocurrencies }; }
  cxEmit('mood'); }
async function cxStart(){ if (CX.timer) return CX.status; CX.status='loading';
  try{ await cxLoadList(); CX.status='live'; cxPrices().catch(()=>{}); }catch(e){ CX.status='offline'; CX.err=String(e.message||e); }
  cxMood().catch(()=>{});
  let lastList=Date.now(), lastMood=Date.now();
  CX.timer=setInterval(()=>{ const now=Date.now();
    if (CX.list.length) cxPrices().then(()=>{ if (CX.status!=='live'){ CX.status='live'; cxEmit('status'); } }).catch(e=>{ CX.err=String(e.message||e); });
    if (now-lastList>600000 || !CX.list.length){ lastList=now; cxLoadList().then(()=>{ CX.status='live'; }).catch(()=>{}); }
    if (now-lastMood>900000){ lastMood=now; cxMood().catch(()=>{}); } }, 10000);
  cxEmit('status'); return CX.status; }

// Tidewater Live: one run of the bots on a server (GitHub Actions runs this every 5 minutes, for free).
// It loads the saved state, fetches real prices and candles, lets every bot learn and trade, and saves the state again.
// Usage: node server/run.js <data folder>     (writes <data>/state.json and <data>/calendar.json)
const fs = require('fs'), path = require('path'), vm = require('vm');
const DATA = path.resolve(process.argv[2] || 'data'); fs.mkdirSync(DATA, { recursive:true });
const LIB = fs.existsSync(path.join(__dirname, 'lib')) ? path.join(__dirname, 'lib') : path.join(__dirname, '..');
const FILES = ['sim_live.js','sim_live_us.js','sim_live_tv.js','live_broker.js','ai_bots.js','ai_learn.js','strategy.js', 'ai_daily.js'];
const mem = {}; const localStorage = { getItem:k=>mem[k]??null, setItem:(k,v)=>{ mem[k]=String(v); }, removeItem:k=>{ delete mem[k]; } };
const ctx = { console, Date, Math, JSON, Map, Set, Promise, URL, URLSearchParams, Infinity, fetch, AbortController, setTimeout, clearTimeout, setInterval:()=>0, clearInterval:()=>{}, localStorage, WebSocket:function(){ throw new Error('no sockets on the server'); } };
vm.createContext(ctx);
vm.runInContext(FILES.map(f=>fs.readFileSync(path.join(LIB, f), 'utf8')).join('\n;\n')+'\n;Object.assign(this,{liveDef,LIVE,LIVE_CRYPTO,LIVE_EXTRA,MKT,MKT_TAKEN,AI,AI_DEFS,AI_COINS,AI_STOCKS,AI_CFG,STK,BRK,DLY,DLY_STRATS});', ctx, { filename:'tidewater-engine.js' });
const C = ctx, log = (...a)=>console.log(new Date().toISOString(), ...a);
// phone notifications through ntfy.sh (free, no sign-up): set the repository variable NTFY_TOPIC to a long random name and subscribe to it in the ntfy app
const NTFY=process.env.NTFY_TOPIC||'', NTFY_TR=(process.env.NTFY_LANG||'tr')==='tr';
async function notify(msg, title){ if (!NTFY) return; try{ await fetch((process.env.NTFY_URL||'https://ntfy.sh')+'/'+encodeURIComponent(NTFY), { method:'POST', body:msg, headers:{ Title:title.normalize('NFD').replace(/[^\x20-\x7e]/g, ''), Tags:'chart_with_upwards_trend' } }); }catch(e){ console.log('notify failed'); } }
const fmtW=w=>{ const ks=Object.keys(w||{}).sort((a,b)=>w[b]-w[a]); if (!ks.length) return NTFY_TR ? 'tamamen nakit' : 'all cash'; const inv=ks.reduce((a,k)=>a+w[k],0); return ks.map(k=>`${k} ${Math.round(w[k]*100)}%`).join(', ')+(inv<.995 ? (NTFY_TR ? `, nakit ${Math.round((1-inv)*100)}%` : `, cash ${Math.round((1-inv)*100)}%`) : ''); };
const readJSON = f=>{ try{ return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); }catch(e){ return null; } };
(async()=>{ const t0=Date.now(), S=readJSON('state.json') || { v:1, created:t0 }, now=()=>Date.now();
  // the bots: kept, any missing one added, and any retired one (no longer in the roster) dropped
  let bots = Array.isArray(S.bots) ? S.bots : C.aiNew(); const gone = bots.filter(b=>!C.AI_DEFS.some(d=>d.id===b.id)).map(b=>b.id); if (gone.length) log('retired bots dropped:', gone.join(', '));
  for (const d of C.AI_DEFS) if (!bots.find(b=>b.id===d.id)) bots.push(C.aiBot(d.id));
  bots = C.AI_DEFS.map(d=>bots.find(b=>b.id===d.id));            // engine order
  for (const b of bots) b.srv = true;
  // crypto prices: Binance, or Coinbase if Binance does not answer
  try{ await C.liveBinanceBoot(); C.LIVE.src='binance'; }catch(e){ log('Binance:', e.message); try{ await C.liveCoinbaseBoot(); C.LIVE.src='coinbase'; }catch(x){ log('Coinbase:', x.message); } }
  await Promise.allSettled(C.AI_COINS.map(s=>C.aiLoad(s, 500)));
  // hourly candles, and the futures data kept from the last run plus what is new (the first run loads about 25 days)
  await Promise.allSettled(C.AI_COINS.map(s=>C.aiLoadH(s, 1000))); C.aiDerLoad(S.der); C.AI.derReady=true;
  { const r=await Promise.allSettled(C.AI_COINS.map(s=>S.der ? C.aiLoadDer(s, 1, 1) : C.aiLoadDer(s, 2, 6))); const bad=r.filter(x=>x.status==='rejected'); if (bad.length) log('OKX:', String(bad[0].reason).slice(0, 120)); }
  // US stocks: the whole-market snapshot (delayed 15 minutes), with 1-minute bars for the stocks the bots trade
  const open = C.usMarketOpen(); if (S.sbars) for (const s of C.AI_STOCKS) if (Array.isArray(S.sbars[s])) C.AI.bars[s]=S.sbars[s];
  const heldStocks = bots.flatMap(b=>Object.keys(b.A.pos).filter(s=>b.A.pos[s].kind==='stock'));
  try{ C.mktSetWatch([]); C.MKT.watch=[...new Set(C.AI_STOCKS.concat(heldStocks))]; await C.mktLoadAll();
    if (open) for (const s of C.AI_STOCKS){ const d=C.MKT.all[s]; if (!d || !(d.last>0)) continue; const k=Math.floor(now()/C.AI_CFG.BAR)*C.AI_CFG.BAR, bars=C.AI.bars[s]||(C.AI.bars[s]=[]), b=bars[bars.length-1];
      if (b && b.t===k){ b.h=Math.max(b.h, d.last); b.l=Math.min(b.l, d.last); b.c=d.last; } else { const o=b ? b.c : d.last; bars.push({ t:k, o, h:Math.max(o, d.last), l:Math.min(o, d.last), c:d.last, v:0 }); if (bars.length>600) bars.shift(); } } }
  catch(e){ log('Screener:', e.message); }
  const quoteOf = sym=>{ const d=C.liveDef(sym); if (d){ const q=C.LIVE.q[sym]; return q && q.last>0 ? { kind:'crypto', last:q.last, bid:q.bid, ask:q.ask, book:null, open:true, chg:q.open ? q.last/q.open-1 : null } : null; }
    const m=C.MKT.all[sym]; return m && m.last>0 ? { kind:'stock', last:m.last, bid:null, ask:null, book:null, open, chg:m.chg, delayed:true } : null; };
  // learn and trade
  let acts=[]; for (const s of C.AI_COINS.concat(C.AI_STOCKS)) if (C.AI.bars[s]) acts=acts.concat(C.aiStep(bots, s, C.AI.bars[s], quoteOf, now(), { open }));
  if (open){ C.STK.snap=S.stk||null; try{ await C.stkLoad(); acts=acts.concat(C.stkStep(bots, quoteOf, now())); }catch(e){ log('Stock snapshot:', e.message); } }
  else for (const b of bots) if (b.id==='rank' || b.id==='sector') b.think.US={ code:'mkt_closed', vals:{}, t:now() };
  const Q={}; for (const s of new Set(C.AI_COINS.concat(C.AI_STOCKS, bots.flatMap(b=>Object.keys(b.A.pos))))){ const q=quoteOf(s); if (q) Q[s]=q; }
  acts=acts.concat(C.aiTick(bots, Q, now())); C.aiMarkAll(bots, Q, now());
  // save: the bots (without the big rebuildable buffers), the stock candles, the last stock snapshot, and the prices used
  const out={ v:1, created:S.created||t0, t:now(), runs:(S.runs||0)+1, src:C.LIVE.src, open, bots, sbars:Object.fromEntries(C.AI_STOCKS.map(s=>[s, (C.AI.bars[s]||[]).slice(-300)])), stk:C.STK.snap||S.stk||null,
    px:Object.fromEntries(Object.entries(Q).map(([s,q])=>[s, q.last])), acts:acts.slice(-50), der:C.aiDerSave() };
  fs.writeFileSync(path.join(DATA, 'state.json'), JSON.stringify(out, (k,v)=>k==='buf' || k==='rb' ? undefined : v));
  // the forward test: once a day, after the daily close, every Desk strategy's holdings from today and the closing prices are written down.
  // Nothing is ever changed afterwards, so this becomes a real record that no backtest can be tuned to.
  try{ const fw=readJSON('forward.json') || { start:null, rows:[] }, today=Math.floor(now()/864e5)*864e5-864e5, last=fw.rows.length ? fw.rows[fw.rows.length-1].t : 0;
    if (last<today){ await C.dlyLoad(true); const D=C.DLY.D; if (D && D.days[D.days.length-1]===today){ const R=C.dlyToday(D), i=D.days.length-1, row={ t:today, w:{}, px:{} };
        for (const S of C.DLY_STRATS) if (R[S.id]) row.w[S.id]=Object.fromEntries(Object.entries(R[S.id].now).filter(([k,v])=>v>.001).map(([k,v])=>[k, Math.round(v*1e4)/1e4]));
        for (const sym of D.syms) if (isFinite(D.px[sym].c[i])) row.px[sym]=D.px[sym].c[i];
        const prev=fw.rows[fw.rows.length-1]; row.h=require('crypto').createHash('sha256').update((prev && prev.h || '')+JSON.stringify({ t:row.t, w:row.w, px:row.px })).digest('hex'); fw.rows.push(row); if (!fw.start) fw.start=today; fs.writeFileSync(path.join(DATA, 'forward.json'), JSON.stringify(fw));
        if (prev){ const changed=C.DLY_STRATS.filter(S=>{ const a=prev.w[S.id]||{}, b=row.w[S.id]||{}; return [...new Set([...Object.keys(a), ...Object.keys(b)])].some(k=>Math.abs((a[k]||0)-(b[k]||0))>=.02); });
          if (changed.length) await notify(changed.map(S=>`${S.ico} ${S.name[NTFY_TR ? 1 : 0]}: ${fmtW(row.w[S.id])}`).join('\n'), NTFY_TR ? 'Strateji hedefleri değişti' : 'Strategy targets changed'); }
        log(`forward test: day ${fw.rows.length}`); } } }
  catch(e){ log('forward test:', e.message); }
  // the order book balance of the six coins (top 20 levels a side) and the mid price, kept for a later test: does it say anything about the next minutes or hours?
  try{ const o=readJSON('obi.json') || { coins:C.AI_COINS, rows:[] }, row=[now()], v=a=>(a||[]).reduce((t,l)=>t+(+l[0])*(+l[1]), 0);
    for (const s of o.coins){ try{ const r=await fetch(`${C.LIVE.BN_REST}/depth?symbol=${s}USDT&limit=20`), x=await r.json(), b=v(x.bids), a=v(x.asks), mid=x.bids && x.bids[0] && x.asks && x.asks[0] ? (+x.bids[0][0] + +x.asks[0][0])/2 : null;
        row.push(b+a>0 ? Math.round((b-a)/(b+a)*1e4)/1e4 : null, mid ? +mid.toPrecision(7) : null); }catch(e){ row.push(null, null); } }
    o.rows.push(row); if (o.rows.length>8640) o.rows.splice(0, o.rows.length-8640);   // 30 days here; the daily job keeps the long record
    fs.writeFileSync(path.join(DATA, 'obi.json'), JSON.stringify(o)); fs.writeFileSync(path.join(DATA, 'obi_sum.json'), JSON.stringify({ n:o.rows.length, from:o.rows[0][0], to:row[0], coins:o.coins })); }
  catch(e){ log('order book:', e.message); }
  log(`run ${out.runs}: ${acts.length} trades, ${bots.filter(b=>Object.keys(b.think).length).length}/${bots.length} bots thinking, market ${open ? 'open' : 'closed'}, ${Date.now()-t0} ms`);
  // the economic calendar for this week (ForexFactory's free weekly file), kept for a few hours
  const cal=readJSON('calendar.json'); if (!cal || now()-cal.t>3*3600e3){ try{ const r=await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json'); if (!r.ok) throw new Error('HTTP '+r.status);
      const ev=(await r.json()).filter(x=>['USD','EUR','GBP','JPY','CNY'].includes(x.country) && x.impact!=='Holiday').map(x=>({ title:x.title, country:x.country, t:Date.parse(x.date), impact:x.impact, forecast:x.forecast||'', previous:x.previous||'' }));
      // next days not in ForexFactory's week: US releases from Nasdaq's calendar (its times are New York time; asking for a date returns the day before, so we ask one day ahead)
      const last=Math.max(0, ...ev.map(e=>e.t)), ny=(day, hm)=>{ const [h, m]=String(hm||'0:0').split(':').map(Number), base=Date.UTC(+day.slice(0,4), +day.slice(5,7)-1, +day.slice(8,10), h||0, m||0), off=Date.parse(new Date(base).toLocaleString('en-US', { timeZone:'America/New_York' })+' GMT')-base; return base-off; };
      const big=/CPI|Nonfarm|Payroll|FOMC|Fed Chair|Interest Rate|GDP|PCE|Retail Sales|Unemployment|PPI|ISM|Jobless/i;
      for (let k=0;k<8;k++){ const day=new Date(now()+k*864e5).toISOString().slice(0,10); if (Date.parse(day+'T23:59:59Z')<=last || [0,6].includes(new Date(day+'T12:00:00Z').getUTCDay())) continue;
        try{ const x=await (await fetch(`https://api.nasdaq.com/api/calendar/economicevents?date=${new Date(Date.parse(day+"T12:00:00Z")+864e5).toISOString().slice(0,10)}`, { headers:{ 'User-Agent':'Mozilla/5.0', Accept:'application/json' } })).json();
          for (const r of (x.data && x.data.rows)||[]){ if (r.country!=='United States' || /Auction/i.test(r.eventName)) continue; const cl=v=>String(v||'').replace(/&nbsp;/g,'').trim();
            ev.push({ title:cl(r.eventName), country:'USD', t:ny(day, r.gmt), impact:big.test(r.eventName) ? 'High' : 'Medium', forecast:cl(r.consensus), previous:cl(r.previous) }); } }
        catch(e){ log('Nasdaq calendar', day, e.message); } }
      fs.writeFileSync(path.join(DATA, 'calendar.json'), JSON.stringify({ t:now(), src:'ForexFactory and Nasdaq', events:ev.sort((a,b)=>a.t-b.t) })); log(`calendar: ${ev.length} events`); }
    catch(e){ log('Calendar:', e.message); } }
})().catch(e=>{ console.error(e); process.exit(1); });

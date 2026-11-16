// Tidewater Live: candles per timeframe for the pro chart (live/chdata.js), with a fake Binance / Coinbase behind liveJSON (runs in node)
const fs=require('fs'), vm=require('vm');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };

// ---- a fake exchange: every bar is a pure function of its open time, so any timeframe can be checked against any other
const H=36e5, M=6e4, D=864e5, W=7*D;
const f=t=>100+10*Math.sin(t/(7*H))+3*Math.cos(t/(37*M));
const fakeBar=(t, ms)=>{ const o=f(t), c=f(t+ms); return { t, o, h:Math.max(o,c)+1, l:Math.min(o,c)-1, c, v:ms/M }; };
const bucket=(t, ms)=>ms===W ? Math.floor((t-4*D)/ms)*ms+4*D : Math.floor(t/ms)*ms;
const IV={ '1m':M, '5m':5*M, '15m':15*M, '1h':H, '4h':4*H, '1d':D, '1w':W };
const NET={ calls:[], mode:'auto', hold:[], fail:new Set(), first:-Infinity, garbage:false };
function answer(url){ const u=new URL(url), p=u.searchParams;
  if (NET.garbage) return { code:-1, msg:'nope' };
  if (u.hostname.includes('binance')){ if (NET.fail.has('bn')) throw new Error('HTTP 451');
    const ms=IV[p.get('interval')], lim=+p.get('limit'), endT=p.has('endTime') ? +p.get('endTime') : NOW; let t=bucket(endT, ms); const out=[];
    while (out.length<lim && t>=NET.first){ const b=fakeBar(t, ms); out.unshift([b.t, String(b.o), String(b.h), String(b.l), String(b.c), String(b.v), b.t+ms-1, '0', 1, '0', '0', '0']); t=ms===W ? t-W : bucket(t-1, ms); }
    return out; }
  if (u.hostname.includes('coinbase')){ if (NET.fail.has('cb')) throw new Error('HTTP 503');
    const g=+p.get('granularity')*1000, end=p.has('end') ? Date.parse(p.get('end')) : NOW, start=p.has('start') ? Date.parse(p.get('start')) : bucket(NOW, g)-349*g; const out=[];
    for (let t=bucket(end, g); t>=start && t>=NET.first && out.length<350; t-=g){ const b=fakeBar(t, g); out.push([b.t/1000, b.l, b.h, b.o, b.c, b.v]); }
    return out; }   // newest first, like Coinbase
  throw new Error('unknown host'); }
function liveJSONStub(url){ NET.calls.push(url);
  if (NET.mode==='hold') return new Promise((res, rej)=>NET.hold.push({ url, res, rej }));
  return new Promise((res, rej)=>{ try{ res(answer(url)); }catch(e){ rej(e); } }); }
const flush=()=>new Promise(r=>setImmediate(r));
async function settle(){ for (let i=0;i<30;i++) await flush(); }
async function release(){ const xs=NET.hold.splice(0); for (const h of xs){ try{ h.res(answer(h.url)); }catch(e){ h.rej(e); } } await settle(); }

// ---- the page's globals that chdata.js uses
let NOW=Date.UTC(2026,10,11,10,17,30), renders=0, Q={};   // Wednesday 2026-11-11 10:17:30 UTC
const ctx={ console, URL, Intl, setInterval:()=>0, setTimeout, clearTimeout, Promise };
ctx.render=()=>{ renders++; };
ctx.quote=sym=>{ if (sym==='BOOM') throw new Error('boom'); return Q[sym] || null; };
vm.createContext(ctx);
vm.runInContext('"use strict";\n'+fs.readFileSync(__dirname+'/../sim_live.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../live/chdata.js','utf8')+
  '\n;this.LIVE=LIVE;this.CD=CD;this.CD_TF=CD_TF;this.liveEmit=liveEmit;', ctx);
ctx.liveJSON=liveJSONStub; ctx.CD.now=()=>NOW; ctx.LIVE.src='binance';
const X=ctx, ent=k=>X.CD.c.get(k);
const asc=bs=>bs.every((b,i)=>!i || b.t>bs[i-1].t);
const contig=(bs, ms)=>bs.every((b,i)=>!i || b.t-bs[i-1].t===ms);
const near=(a,b)=>Math.abs(a-b)<1e-9;
const sameBar=(a,b)=>a && b && a.t===b.t && near(a.o,b.o) && near(a.h,b.h) && near(a.l,b.l) && near(a.c,b.c) && near(a.v,b.v);
const reset=()=>{ X.CD.c.clear(); NET.calls.length=0; NET.hold.length=0; NET.mode='auto'; NET.fail.clear(); NET.first=-Infinity; NET.garbage=false; Q={}; X.LIVE.src='binance'; };

(async()=>{
// ================= cdAgg
{ const t0=Date.UTC(2026,10,11,10,0), m1=[]; for (let i=0;i<30;i++) m1.push(fakeBar(t0+i*M, M));
  const before=JSON.stringify(m1), a=X.cdAgg(m1, 5*M), b0=a[0], kids=m1.slice(0,5);
  check('cdAgg: 30 one-minute bars make 6 five-minute bars', a.length===6, a.length);
  check('cdAgg: open of the first, highest high, lowest low, close of the last, summed volume', b0.t===t0 && b0.o===kids[0].o && b0.h===Math.max(...kids.map(k=>k.h)) && b0.l===Math.min(...kids.map(k=>k.l)) && b0.c===kids[4].c && b0.v===5);
  check('cdAgg: does not change the bars it is given', JSON.stringify(m1)===before);
  const off=X.cdAgg(m1.slice(3), 15*M); check('cdAgg: buckets are aligned to UTC clock times, not to the first bar', off[0].t===t0 && off[1].t===t0+15*M && off[0].o===m1[3].o, new Date(off[0].t).toISOString());
  const h1=[]; for (let i=0;i<48;i++) h1.push(fakeBar(Date.UTC(2026,10,10,1)+i*H, H)); const h4=X.cdAgg(h1, 4*H);
  check('cdAgg: 4h buckets start at 00, 04, 08 … UTC', h4.every(b=>new Date(b.t).getUTCHours()%4===0) && h4[0].t===Date.UTC(2026,10,10,0), h4.length);
  const d1=[]; for (let i=0;i<20;i++) d1.push(fakeBar(Date.UTC(2026,9,28)+i*D, D)); const w=X.cdAgg(d1, W);   // starts on a Wednesday
  check('cdAgg: weeks start on Monday 00:00 UTC, like Binance', w.every(b=>new Date(b.t).getUTCDay()===1 && b.t%D===0) && w[0].t===Date.UTC(2026,9,26) && w[1].t===Date.UTC(2026,10,2), w.map(b=>new Date(b.t).toISOString().slice(0,10)).join(','));
  check('cdAgg: a week holds Monday to Sunday', w[1].o===d1[5].o && w[1].c===d1[11].c && w[1].v===7*1440);
  const gap=X.cdAgg([fakeBar(t0, M), fakeBar(t0+20*M, M)], 5*M); check('cdAgg: an empty period is skipped, not invented', gap.length===2 && gap[1].t===t0+20*M);
  const bad=X.cdAgg([fakeBar(t0, M), { t:t0+M, o:NaN, h:1, l:1, c:1, v:1 }, null, fakeBar(t0+2*M, M)], 5*M);
  check('cdAgg: broken bars are ignored, empty or wrong input gives []', bad.length===1 && bad[0].v===2 && X.cdAgg([], M).length===0 && X.cdAgg(null, M).length===0 && X.cdAgg(m1, 0).length===0);
  const full=X.cdAggFull(h1, 4*H); check('a partial oldest bucket (built from base bars starting mid-period) is dropped', full.length===h4.length-1 && full[0].t===Date.UTC(2026,10,10,4)); }

// ================= first download, cache, render
reset(); renders=0; NET.mode='hold';
{ const r1=X.cdBars('BTC','1h'), r2=X.cdBars('BTC','1h'), r3=X.cdBars('BTC','1h');
  check('cdBars: null while the first download runs', r1===null && r2===null && r3===null);
  check('cdBars: only one request per sym|tf while it is running', NET.calls.length===1, NET.calls.length);
  const u=new URL(NET.calls[0]); check('Binance klines are asked for the right coin, interval and 1000 bars', u.pathname.endsWith('/klines') && u.searchParams.get('symbol')==='BTCUSDT' && u.searchParams.get('interval')==='1h' && u.searchParams.get('limit')==='1000' && !u.searchParams.has('endTime'), NET.calls[0]);
  await release(); const b=X.cdBars('BTC','1h');
  check('the bars arrive oldest first, 1000 of them, one hour apart', b && b.length===1000 && asc(b) && contig(b, H), b && b.length);
  check('render() is called when the bars arrive', renders>=1, renders);
  check('the newest bar is the hour in progress', b[b.length-1].t===bucket(NOW, H), new Date(b[b.length-1].t).toISOString());
  check('bars are parsed like Binance sends them (strings → numbers)', sameBar(b[500], fakeBar(b[500].t, H)));
  NET.calls.length=0; NOW+=4*M; X.cdBars('BTC','1h'); X.cdBars('BTC','1h');
  check('no new request inside the 5-minute refresh window (1h)', NET.calls.length===0);
  NOW+=61e3; X.cdBars('BTC','1h'); check('after 5 minutes the 1h bars are refreshed, once', NET.calls.length===1, NET.calls.length);
  const lim=+new URL(NET.calls[0]).searchParams.get('limit'); check('a refresh only asks for the newest few bars', lim>=10 && lim<=20, lim);
  X.cdBars('BTC','1h'); check('…and no second request while it runs', NET.calls.length===1);
  await release(); const b2=X.cdBars('BTC','1h');
  check('the refresh merges in without duplicates and keeps the history', b2.length===1000 && asc(b2) && new Set(b2.map(x=>x.t)).size===b2.length, b2.length); }

// 1m / 5m every minute, 15m every 5 minutes
reset(); { NET.mode='auto'; X.cdBars('ETH','1m'); X.cdBars('ETH','5m'); X.cdBars('ETH','15m'); await settle(); NET.calls.length=0;
  NOW+=61e3; X.cdBars('ETH','1m'); X.cdBars('ETH','5m'); X.cdBars('ETH','15m'); await settle();
  const iv=NET.calls.map(u=>new URL(u).searchParams.get('interval')).sort().join(',');
  check('after a minute 1m and 5m refresh but 15m does not', iv==='1m,5m', iv);
  NOW+=240e3; NET.calls.length=0; X.cdBars('ETH','15m'); await settle(); check('15m refreshes after 5 minutes', NET.calls.length===1); }

// errors
reset(); { NET.fail.add('bn'); NET.fail.add('cb'); let threw=false, r;
  try{ r=X.cdBars('ETH','4h'); await settle(); r=X.cdBars('ETH','4h'); }catch(e){ threw=true; }
  check('both sources down: no exception, still null, cdErr says why', !threw && r===null && /HTTP/.test(X.cdErr('ETH','4h')), X.cdErr('ETH','4h'));
  const n0=NET.calls.length; NOW+=5e3; X.cdBars('ETH','4h'); await settle();
  check('a failed download is not retried at once…', NET.calls.length===n0);
  NOW+=11e3; X.cdBars('ETH','4h'); await settle(); check('…but again after 15 s', NET.calls.length>n0, NET.calls.length-n0);
  const n1=NET.calls.length; NOW+=16e3; X.cdBars('ETH','4h'); await settle(); check('…and the wait doubles after each failure', NET.calls.length===n1);
  NET.fail.clear(); NOW+=15e3; X.cdBars('ETH','4h'); await settle(); const ok=X.cdBars('ETH','4h');
  check('once a source answers, the bars appear and the error is cleared', ok && ok.length===1000 && X.cdErr('ETH','4h')==='');
  NET.fail.add('bn'); NET.fail.add('cb'); NOW+=301e3; const keep=X.cdBars('ETH','4h'); await settle(); const after=X.cdBars('ETH','4h');
  check('a failed refresh keeps the old bars', after && after.length===1000 && keep.length===1000 && X.cdErr('ETH','4h')===''); }
reset(); { NET.garbage=true; let threw=false, r; try{ X.cdBars('SOL','1h'); await settle(); r=X.cdBars('SOL','1h'); }catch(e){ threw=true; }
  check('a reply that is not a list of candles is an error, not a crash', !threw && r===null && X.cdErr('SOL','1h')!==''); }

// ================= Coinbase fallback
reset(); { NET.fail.add('bn'); X.cdBars('SOL','1h'); await settle(); const b=X.cdBars('SOL','1h'), c=ent('SOL|1h');
  const cbu=NET.calls.find(u=>u.includes('coinbase'));
  check('Binance down → Coinbase candles (SOL-USD, granularity 3600)', c.src==='cb' && cbu && cbu.includes('/products/SOL-USD/candles') && cbu.includes('granularity=3600'), cbu);
  check('Coinbase candles (newest first, [time, low, high, open, close, volume]) end up oldest first and correct', b && b.length>=600 && asc(b) && contig(b, H) && sameBar(b[10], fakeBar(b[10].t, H)), b && b.length);
  NET.fail.clear(); NET.calls.length=0; NOW+=301e3; X.cdBars('SOL','1h'); await settle();
  check('refreshes go to the source that worked last time', NET.calls.length>=1 && NET.calls.every(u=>u.includes('coinbase'))); }
reset(); { X.LIVE.src='coinbase'; X.cdBars('ETH','4h'); await settle(); const b=X.cdBars('ETH','4h'), cb=NET.calls.filter(u=>u.includes('coinbase'));
  check('with the Coinbase feed, 4h is built from 4 pages of 1h candles', !NET.calls.some(u=>u.includes('binance')) && cb.length===4 && cb.every(u=>u.includes('granularity=3600')), cb.length);
  const ref=X.cdAgg(Array.from({ length:8 }, (_,i)=>fakeBar(b[5].t+i*H, H)), 4*H)[0];
  check('…aligned 4h bars that match the 1h candles inside them, no partial first bar', asc(b) && contig(b, 4*H) && b.every(x=>x.t%(4*H)===0) && sameBar(b[5], ref) && b.length>=290, b.length);
  X.cdBars('ETH','1w'); await settle(); const w=X.cdBars('ETH','1w');
  check('with the Coinbase feed, 1w is built from daily candles and starts on Mondays', w && w.length>=120 && w.every(x=>new Date(x.t).getUTCDay()===1) && contig(w, W) && near(w[3].v, 7*1440), w && w.length);
  NET.calls.length=0; X.cdBars('BNB','15m'); await settle();
  check('a coin Coinbase does not list (BNB) still loads from Binance', ent('BNB|15m').src==='bn' && (X.cdBars('BNB','15m')||[]).length===1000 && NET.calls.every(u=>u.includes('binance'))); }

// ================= the live last bar
reset(); { Q.BTC={ kind:'crypto', last:null, intra:[], daily:[] }; X.cdBars('BTC','5m'); await settle(); let b=X.cdBars('BTC','5m'); const L=b[b.length-1], h0=L.h, n0=b.length;
  Q.BTC.last=h0+5; b=X.cdBars('BTC','5m'); check('a new high from the last price lifts the live bar’s high and close', b[b.length-1].h===h0+5 && b[b.length-1].c===h0+5 && b.length===n0);
  const l0=b[b.length-1].l; Q.BTC.last=l0-3; b=X.cdBars('BTC','5m'); check('a new low lowers the low; the high stays', b[b.length-1].l===l0-3 && b[b.length-1].h===h0+5 && b[b.length-1].c===l0-3);
  const o0=b[b.length-1].o; check('folding never changes the open', b[b.length-1].o===o0 && near(o0, fakeBar(L.t, 5*M).o));
  NOW=bucket(NOW, 5*M)+5*M+2000; Q.BTC.last=123.45; b=X.cdBars('BTC','5m'); const nb=b[b.length-1];
  check('when the 5 minutes roll over a new bar starts at the last price', b.length===n0+1 && nb.t===bucket(NOW, 5*M) && nb.o===123.45 && nb.h===123.45 && nb.l===123.45 && nb.c===123.45 && nb.v===0);
  Q.BTC.last=124; b=X.cdBars('BTC','5m'); check('later prices go into the new bar, the old one is final', b[b.length-1].h===124 && b[b.length-2].c===l0-3);
  // trades since the bar opened, as 1-minute bars in quote.intra
  const bt=bucket(NOW, 5*M); Q.BTC.intra=[{ t:bt-M, o:1,h:999,l:0.5,c:1,v:9 }, { t:bt, o:123.45, h:130, l:120, c:125, v:3 }, { t:bt+M, o:125, h:126, l:119, c:124, v:2 }];
  b=X.cdBars('BTC','5m'); const lv=b[b.length-1];
  check('live 1-minute bars push the live bar’s high, low and volume (older ones are ignored)', lv.h===130 && lv.l===119 && lv.v===5 && lv.c===124 && b[b.length-2].h!==999, JSON.stringify(lv));
  b=X.cdBars('BTC','5m'); check('folding the same trades again changes nothing', b[b.length-1].v===5 && b[b.length-1].h===130 && b.length===n0+1);
  await settle(); NET.calls.length=0; NOW+=20*M; Q.BTC.intra=[]; b=X.cdBars('BTC','5m');
  check("after missed periods (a sleeping tab) a refresh starts at once", NET.calls.length===1 && b[b.length-1].t===bucket(NOW, 5*M), NET.calls.length+" "+(b[b.length-1].t-bucket(NOW,5*M))+" "+NET.calls.join(" ")); await settle();
  b=X.cdBars('BTC','5m'); check('…and the refresh fills the missing bars', contig(b.slice(-8), 5*M) && asc(b), b.length); }
reset(); { NET.mode='hold'; const intra=[]; const t0=bucket(NOW, M)-199*M; for (let i=0;i<200;i++) intra.push(fakeBar(t0+i*M, M)); Q.ETH={ kind:'crypto', last:intra[199].c, intra, daily:[] };
  const s=X.cdBars('ETH','1m'); check('1m shows the live 1-minute bars at once, before its download lands', s && s.length===200 && s[0]!==intra[0] && s[199].t===intra[199].t);
  check('…while the download still runs', NET.calls.length===1); await release(); const b=X.cdBars('ETH','1m');
  check('…which then replaces them with 1000 bars', b.length===1000 && asc(b) && contig(b, M));
  intra.push({ t:intra[199].t+M, o:7, h:8, l:6, c:7.5, v:4 }); NOW=intra[200].t+5000; Q.ETH.last=7.6; const b2=X.cdBars('ETH','1m'), z=b2[b2.length-1];
  check('a new live 1-minute bar is appended on 1m (with the last price folded in)', b2.length===1001 && z.t===intra[200].t && z.o===7 && z.c===7.6 && z.v===4 && intra[200].c===7.5, JSON.stringify(z)); }
reset(); { NET.mode='hold'; const daily=[]; for (let i=0;i<200;i++) daily.push(fakeBar(bucket(NOW, D)-(199-i)*D, D)); Q.XRP={ kind:'crypto', last:2, intra:[], daily };
  const d=X.cdBars('XRP','1d'), w=X.cdBars('XRP','1w');
  check('1d and 1w show the daily bars loaded at start while their downloads run', d && d.length===200 && w && w.length>=28 && w.every(x=>new Date(x.t).getUTCDay()===1)); await release(); }

// ================= cdMore
reset(); { NET.first=bucket(NOW, H)-4500*H; X.cdBars('BTC','1h'); await settle(); renders=0; const b0=X.cdBars('BTC','1h'), f0=b0[0].t; NET.calls.length=0;
  const p=X.cdMore('BTC','1h'), p2=X.cdMore('BTC','1h');
  const u=new URL(NET.calls[0]); check('cdMore asks Binance for 1000 bars ending just before the first bar', u.searchParams.get('endTime')===String(f0-1) && u.searchParams.get('limit')==='1000', NET.calls[0]);
  check('cdMore: only one request while it runs', NET.calls.length===1);
  const n=await p; await p2; const b=X.cdBars('BTC','1h');
  check('cdMore prepends 1000 older bars without duplicates', n===1000 && b.length===2000 && asc(b) && contig(b, H) && b[1000].t===f0 && new Set(b.map(x=>x.t)).size===2000, n);
  check('render() is called after older bars arrive', renders>=1);
  await X.cdMore('BTC','1h'); await X.cdMore('BTC','1h'); const n4=await X.cdMore('BTC','1h'); const b4=X.cdBars('BTC','1h');
  check('the history runs out where the exchange’s does (4501 bars), still in order', b4.length===4501 && contig(b4, H) && n4===501, b4.length+' / '+n4);
  NET.calls.length=0; const n5=await X.cdMore('BTC','1h'); const n6=await X.cdMore('BTC','1h');
  check('an empty answer marks the start of history: no more requests after it', n5===0 && n6===0 && NET.calls.length===1 && ent('BTC|1h').end===true, NET.calls.length); }
reset(); { X.cdBars('ETH','15m'); await settle(); for (let i=0;i<6;i++) await X.cdMore('ETH','15m'); const b=X.cdBars('ETH','15m'); NET.calls.length=0; const n=await X.cdMore('ETH','15m');
  check('cdMore stops at 5000 bars', b.length===5000 && n===0 && NET.calls.length===0 && contig(b, 15*M), b.length); }
reset(); { X.LIVE.src='coinbase'; X.cdBars('SOL','4h'); await settle(); const b0=X.cdBars('SOL','4h'), f0=b0[0].t; NET.calls.length=0; const n=await X.cdMore('SOL','4h'); const b=X.cdBars('SOL','4h');
  const e=new URL(NET.calls[0]).searchParams.get('end');
  check('Coinbase cdMore walks back from the hour before the first bar', Date.parse(e)===f0-H, e);
  check('Coinbase cdMore (4h from 1h) prepends whole, aligned bars without duplicates', n>=290 && asc(b) && contig(b, 4*H) && b.every(x=>x.t%(4*H)===0) && new Set(b.map(x=>x.t)).size===b.length && sameBar(b[n-1], X.cdAgg(Array.from({ length:4 }, (_,i)=>fakeBar(b[n-1].t+i*H, H)), 4*H)[0]), n); }
reset(); { X.cdBars('BTC','1h'); await settle(); const n=await X.cdMore('AAPL','1h'); check('cdMore on a stock does nothing', n===0); }

// ================= stocks (no network)
reset(); { const t0=Date.UTC(2026,10,10,14,30), intra=[]; for (let i=0;i<390;i++) intra.push(fakeBar(t0+i*M, M)); const daily=[]; for (let i=0;i<60;i++) daily.push(fakeBar(Date.UTC(2026,8,14,4)+i*D, D));
  Q.AAPL={ kind:'stock', last:intra[389].c, open:false, intra, daily };
  const m5=X.cdBars('AAPL','5m'), h1=X.cdBars('AAPL','1h'), h4=X.cdBars('AAPL','4h'), m1=X.cdBars('AAPL','1m'), d1=X.cdBars('AAPL','1d'), w1=X.cdBars('AAPL','1w');
  check('stocks: 5m, 1h and 4h are built from the 1-minute bars', m5.length===78 && sameBar(m5[1], X.cdAgg(intra.slice(5,10), 5*M)[0]) && h1.length===7 && h1[0].t===Date.UTC(2026,10,10,14) && h4.length===3, `${m5.length} ${h1.length} ${h4.length}`);
  check('stocks: 1m and 1d are the quote’s own bars (copied), 1w is built from the daily bars', m1.length===390 && m1[0]!==intra[0] && d1.length===60 && w1.every(x=>new Date(x.t).getUTCDay()===1) && w1.length>=9);
  check('stocks never touch the network', NET.calls.length===0, NET.calls.length);
  check('stocks: the same array comes back while nothing changed (cheap on every tick)', X.cdBars('AAPL','5m')===m5);
  intra.push(fakeBar(t0+390*M, M)); const m5b=X.cdBars('AAPL','5m'); check('…and a fresh one when a new 1-minute bar arrives', m5b!==m5 && m5b.length===79);
  const lastD=d1[d1.length-1]; NOW=lastD.t+15*H; Q.AAPL.last=lastD.h+10; let dd=X.cdBars('AAPL','1d');
  check('stocks: market closed → the daily bars are left as they are', dd[dd.length-1].h===lastD.h && dd.length===60);
  Q.AAPL.open=true; dd=X.cdBars('AAPL','1d'); check('stocks: market open → today’s daily bar follows the price', dd[dd.length-1].h===lastD.h+10 && dd[dd.length-1].c===lastD.h+10 && dd.length===60 && daily[59].h===lastD.h);
  NOW=lastD.t+D+15*H; Q.AAPL.last=150; dd=X.cdBars('AAPL','1d'); check('stocks: on a new New York day a new daily bar starts at the price', dd.length===61 && dd[60].o===150 && dd[60].t===lastD.t+D);
  check('a stock with no quote yet gives an empty list (not "loading")', Array.isArray(X.cdBars('ZZZZ','1h')) && X.cdBars('ZZZZ','1h').length===0); }

// ================= robustness
reset(); { let threw=false; try{ X.cdBars('BOOM','1h'); X.cdBars('BTC','7m'); await settle(); }catch(e){ threw=true; }
  check('a quote() that throws or an unknown timeframe never throws', !threw && ent('BTC|1m') && (X.cdBars('BTC','7m')||[]).length===1000);
  X.CD.KEYS=10; for (const s of ['BTC','ETH','SOL','XRP','ADA','DOGE']) for (const tf of ['1m','5m','15m']) X.cdBars(s, tf); await settle();
  check('the cache keeps at most CD.KEYS sym|tf entries', X.CD.c.size<=10, X.CD.c.size); X.CD.KEYS=48;
  check('cdErr is empty for a chart with bars or one never asked for', X.cdErr('DOGE','15m')==='' && X.cdErr('NOPE','1h')===''); }

// ================= 1-second candles: Binance 1s klines, then every trade from the websocket
{ reset(); IV['1s']=1e3; const S=1e3, T0=Date.UTC(2026,10,11,10,17,30); NOW=T0+400; const trades=[]; Q.BTC={ kind:'crypto', last:100, intra:[], daily:[] }; X.LIVE.q.BTC={ trades };
  const first=X.cdBars('BTC','1s'); await settle(); let b=X.cdBars('BTC','1s');
  check('1s: nothing to show until the download (no trades yet)', first===null, String(first));
  check('1s: 1000 one-second bars from Binance, contiguous, ending at the current second', b.length===1000 && contig(b, S) && b[b.length-1].t===T0 && NET.calls.every(u=>/interval=1s/.test(u) && /binance/.test(u)), b.length+' '+NET.calls.join(' '));
  const rest30={ ...b[b.length-1] };
  NOW=T0+S+400; trades.push({ t:T0+S+100, px:101, q:.5 }, { t:T0+S+300, px:99, q:.25 }); Q.BTC.last=99; b=X.cdBars('BTC','1s'); let L=b[b.length-1];
  check('1s: trades build the new second: open of the first, high, low, close of the last, summed size', L.t===T0+S && L.o===101 && L.h===101 && L.l===99 && L.c===99 && near(L.v, .75), JSON.stringify(L));
  check('1s: the downloaded second before it is left alone', sameBar(b[b.length-2], rest30));
  X.cdBars('BTC','1s'); b=X.cdBars('BTC','1s'); check('1s: asking again does not count a trade twice', near(b[b.length-1].v, .75), b[b.length-1].v);
  NOW=T0+5*S+400; trades.push({ t:T0+5*S+200, px:102, q:1 }); Q.BTC.last=102; b=X.cdBars('BTC','1s'); L=b[b.length-1];
  check('1s: seconds without a trade become flat bars at the last close with no volume (like Binance)', contig(b, S) && L.t===T0+5*S && [2,3,4].every(k=>{ const x=b.find(y=>y.t===T0+k*S); return x && x.o===99 && x.h===99 && x.l===99 && x.c===99 && x.v===0; }) && L.o===102 && near(L.v, 1));
  NOW=T0+8*S+400; b=X.cdBars('BTC','1s'); L=b[b.length-1];
  check('1s: a quiet market still moves the chart on, second by second, at the last price', L.t===T0+8*S && L.c===102 && L.v===0 && contig(b, S), new Date(L.t).toISOString());
  trades.push({ t:T0+6*S+500, px:150, q:2 }); b=X.cdBars('BTC','1s'); const b6=b.find(y=>y.t===T0+6*S); L=b[b.length-1];
  const b7=b.find(y=>y.t===T0+7*S);
  check('1s: a late trade for a second that had none opens that second itself, and the empty seconds after it carry its close (like the exchange)', b6.o===150 && b6.h===150 && b6.l===150 && b6.c===150 && near(b6.v, 2) && b7.o===150 && b7.c===150 && b7.v===0 && b.find(y=>y.t===T0+5*S).c===102, JSON.stringify([b6, b7]));
  trades.push({ t:T0+8*S+100, px:103, q:1 }); Q.BTC.last=103; b=X.cdBars('BTC','1s'); L=b[b.length-1];
  check('1s: the next trade carries on from there', L.t===T0+8*S && L.o===103 && L.c===103 && near(L.v, 1), JSON.stringify(L));
  // the minute refresh: the newest downloaded second is rebuilt from the trades, so its trades are not counted twice
  NOW=T0+68*S+400; const cut=T0+68*S; X.cdBars('BTC','1s'); trades.push({ t:cut+200, px:200, q:3 }); Q.BTC.last=200; X.cdBars('BTC','1s'); await settle(); b=X.cdBars('BTC','1s'); L=b[b.length-1];
  check('1s: after the minute refresh the current second comes from the trades once (no double volume)', L.t===cut && L.o===200 && L.c===200 && near(L.v, 3) && contig(b, S), JSON.stringify(L));
  const n0=b.length, add=await X.cdMore('BTC','1s'); b=X.cdBars('BTC','1s');
  check('1s: older history loads 1000 seconds further back with no gap or duplicate', add===1000 && b.length===n0+1000 && contig(b, S), add+' '+b.length);
  check('1s: never more than CD.MAX bars', b.length<=X.CD.MAX); }
{ reset(); const S=1e3, T0=Date.UTC(2026,10,11,10,30,0); NOW=T0+300; const trades=[]; Q.BTC={ kind:'crypto', last:100, intra:[], daily:[] }; X.LIVE.q.BTC={ trades };
  X.cdBars('BTC','1s'); await settle(); X.cdBars('BTC','1s');
  // a busy second: 900 trades arrive between two screen updates, while the page keeps only the newest 200
  let sum=0; for (let k=0;k<900;k++){ const tr={ t:T0+S+k, px:100+(k%7), q:.01 }; trades.push(tr); if (trades.length>200) trades.shift(); sum+=.01; X.liveEmit('trade', 'BTC'); }
  NOW=T0+2*S+100; const b=X.cdBars('BTC','1s'), s1=b.find(x=>x.t===T0+S);
  check('1s: a burst of 900 trades in one second is counted in full (each trade is folded as it arrives)', s1 && near(s1.v, sum) && s1.h===106 && s1.l===100 && s1.o===100 && s1.c===100+(899%7), s1 && JSON.stringify(s1)); }
{ reset(); const S=1e3, T0=Date.UTC(2026,10,11,10,40,0); NOW=T0+300; const trades=[]; Q.BTC={ kind:'crypto', last:100, intra:[], daily:[] }; X.LIVE.q.BTC={ trades };
  X.cdBars('BTC','1s'); await settle(); X.cdBars('BTC','1s');
  for (const [id, px] of [[11, 101], [13, 99], [12, 104], [10, 100]]){ trades.push({ t:T0+S+500, px, q:1, id }); X.liveEmit('trade', 'BTC'); }   // delivered 11, 13, 12, 10
  NOW=T0+2*S+50; const b=X.cdBars('BTC','1s'), s1=b.find(x=>x.t===T0+S);
  check('1s: trades delivered out of order still give the exchange’s open (lowest trade id) and close (highest)', s1 && s1.o===100 && s1.c===99 && s1.h===104 && s1.l===99 && near(s1.v, 4), s1 && JSON.stringify(s1)); }
{ reset(); const S=1e3, T0=Date.UTC(2026,10,11,10,20,0); NOW=T0+700; NET.fail.add('bn'); X.LIVE.src='coinbase';
  const trades=[{ t:T0+100, px:50, q:1 }, { t:T0+600, px:51, q:2 }]; Q.ETH={ kind:'crypto', last:51, intra:[], daily:[] }; X.LIVE.q.ETH={ trades };
  let b=X.cdBars('ETH','1s'); await settle(); b=X.cdBars('ETH','1s'); const L=b && b[b.length-1];
  check('1s on Coinbase (no 1s candles there) or with Binance down: the chart is built from the live trades', L && L.t===T0 && L.o===50 && L.h===51 && L.c===51 && near(L.v, 3), JSON.stringify(b));
  check('1s never asks Coinbase for candles it does not have', !NET.calls.some(u=>/coinbase/.test(u)), NET.calls.join(' ')); }

console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });

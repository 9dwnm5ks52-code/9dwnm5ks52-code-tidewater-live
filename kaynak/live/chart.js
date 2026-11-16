/* ---------- Tidewater Live: the pro chart engine (piece 3 of the pro chart, prefix CH / ch) ----------
   chInit() makes sure ST.chart exists (see ds/CHART_SPEC.md). chRender(host, sym) draws the chart of the instrument into
   host (#tr-chart) and returns true, or shows a message and returns false when there are no bars yet.
   One <svg class="chart">: the price pane on top, one pane per 'sub' indicator below it, the time axis at the bottom
   and the price axis on the right. Candle bodies are <rect> elements (and nothing else is a <rect>).
   The visible window is CH.view = { n: bars across the plot (null = the default for the width),
   end: bars scrolled back from the live edge (0 = live; fractional while panning; negative = empty space on the right) }.
   Zoom: wheel / ctrl+wheel (trackpad pinch) / the + − buttons / two-finger pinch / dragging the time axis.
   Pan: drag the plot, one-finger drag, trackpad swipe, shift+wheel, ← →. Price scale: drag the price axis (auto again
   with the A button or a double-click). Double-click (double-tap) resets. Panning to the left edge loads older bars.
   Crosshair: follows the mouse; tap-and-hold on touch; Shift+← → from the keyboard. The legend shows the values there.
   Coordinates for term.js / draw.js: the global CHM (filled in by chBuild), see the spec. */
const CH_TF_MS = { '1s':1e3, '1m':6e4, '5m':3e5, '15m':9e5, '1h':36e5, '4h':144e5, '1d':864e5, '1w':6048e5 };
const CH_TYPES = ['candle','hollow','heikin','bar','line','area'];
const CH_RM = 3;                  // empty bar slots right of the last bar when live
const CH_AX = 22;                 // height of the time axis
const CH_NOSCALE = { pivots:1 };  // overlays left out of the price auto-scale (far-away levels would squash the candles)
const CH = {
  view:{ n:null, end:0 }, yz:1, yo:0,     // window; manual price scale (zoom factor, offset as a fraction of the range)
  key:'', sym:null, host:null, wrap:null, svg:null, ro:null,
  L:null, sig:'', live:'', built:0, timer:0, act:0, qr:0, raf:0,
  hov:null, kb:null, drag:null, ptrs:new Map(), pinch:null, holdT:0, tapT:0, tapX:0, kin:0,
  more:'', moreBusy:false, moreFail:0, escT:0, memo:new Map(), ha:null, lastT:null, dr:null, legSig:'', lv:[], lvEls:[], ctlSig:'', legMin:null, legAll:false,
};
// ---------------------------------------------------------------- state
function chInit(){
  if (typeof ST!=='object' || !ST) return null;
  let C=ST.chart;
  if (!C || typeof C!=='object') C=ST.chart={ tf:ST.tf==='daily' ? '1d' : '1m', type:'candle', log:false,
    inds:[ { k:'i1', id:'ema', p:{ n:20 }, c:{}, hide:false }, { k:'i2', id:'vol', p:{}, c:{}, hide:false } ], draw:{}, tpl:{}, marks:true };
  if (!CH_TF_MS[C.tf]) C.tf='1m';
  if (!CH_TYPES.includes(C.type)) C.type='candle';
  if (typeof C.log!=='boolean') C.log=!!C.log;
  if (!Array.isArray(C.inds)) C.inds=[];
  if (C.inds.some(x=>!x || typeof x!=='object' || typeof x.id!=='string')) C.inds=C.inds.filter(x=>x && typeof x==='object' && typeof x.id==='string');
  const seen=new Set(); let mx=0; for (const x of C.inds){ const m=/^i(\d+)$/.exec(x.k||''); if (m) mx=Math.max(mx, +m[1]); }
  for (const x of C.inds){ if (!x.k || seen.has(x.k)) x.k='i'+(++mx); seen.add(x.k); if (!x.p || typeof x.p!=='object') x.p={}; if (!x.c || typeof x.c!=='object') x.c={}; }
  if (!C.draw || typeof C.draw!=='object') C.draw={};
  if (!C.tpl || typeof C.tpl!=='object') C.tpl={};
  if (C.marks===undefined) C.marks=true;
  // keep the old ST.tf ('intra' | 'daily') in sync; if older code changed it since the last sync, follow it
  const daily=C.tf==='1d' || C.tf==='1w';
  if (CH.stf!==undefined && ST.tf!==CH.stf){ if (ST.tf==='daily' && !daily) C.tf='1d'; else if (ST.tf==='intra' && daily) C.tf='1m'; }
  ST.tf=C.tf==='1d' || C.tf==='1w' ? 'daily' : 'intra'; CH.stf=ST.tf;
  return C;
}
function chLM(narrow){ return CH.legMin==null ? !!narrow : CH.legMin; }   // legend overlay rows folded? (default: folded on narrow charts)
function chBarsFor(sym, tf){
  if (typeof cdBars==='function') return cdBars(sym, tf);
  const q=typeof quote==='function' ? quote(sym) : null; if (!q) return null;
  const src=tf==='1d' || tf==='1w' ? q.daily : q.intra; return Array.isArray(src) ? src : [];
}
const chMemo = (k, fn) => typeof indCache==='function' ? indCache(k, fn) : fn();
const chDef = id => typeof IND_DEFS!=='undefined' && IND_DEFS[id] ? IND_DEFS[id] : null;
// theme tokens read from CSS (hex), cached until the theme or colour-blind mode changes
const CH_TOK = { k:'', v:{} };
function chThemeKey(){ const h=document.documentElement; return (h.getAttribute('data-tdx-theme')||'')+(h.classList.contains('cb') ? '|cb' : ''); }
function chTok(name){ const k=chThemeKey(); if (CH_TOK.k!==k){ CH_TOK.k=k; CH_TOK.v={}; }
  if (!(name in CH_TOK.v)){ let v=''; try{ v=getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }catch(e){} CH_TOK.v[name]=/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : ''; }
  return CH_TOK.v[name]; }
// default colour of an output: outputs that mean up / down (dir ±1) follow --gain / --loss, so colour-blind mode applies
function chOutCol(d, k){ const o=d.out[k]; if (o && o.dir){ const v=chTok(o.dir>0 ? '--gain' : '--loss'); if (v) return v; } return o ? o.c : '#888888'; }
// a stored colour wins, except an up / down output still holding the built-in hex (saved before outputs followed the theme)
const chCol = (ind, d, k) => { const c=ind.c && ind.c[k], o=d.out[k]; return c && !(o && o.dir && String(c).toLowerCase()===String(o.c).toLowerCase()) ? c : chOutCol(d, k); };
const chLabel = ind => typeof indLabel==='function' ? indLabel(ind, typeof ST==='object' && ST ? ST.lang : 'en') : String(ind.id).toUpperCase();
const chTfName = tf => ({ '1s':L2('1s','1sn'), '1m':L2('1m','1dk'), '5m':L2('5m','5dk'), '15m':L2('15m','15dk'), '1h':L2('1h','1sa'), '4h':L2('4h','4sa'), '1d':L2('1D','1G'), '1w':L2('1W','1Hf') })[tf] || tf;
const chEsc = s => String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
// ---------------------------------------------------------------- formatting
const CH_NF={}, CH_DF={};
const chNf = d => CH_NF[d] || (CH_NF[d]=new Intl.NumberFormat('en-US', { minimumFractionDigits:d, maximumFractionDigits:d }));
const chDec = v => !(v>0) ? 2 : v>=1 ? 2 : v>=.01 ? 4 : v>=1e-4 ? 6 : 8;
function chFmtP(v, d){ return v==null || !isFinite(v) ? '—' : (v<0 ? '−' : '')+chNf(d).format(Math.abs(v)); }
function chFmtV(v){ if (v==null || !isFinite(v)) return '—'; const a=Math.abs(v), s=v<0 ? '−' : '';
  if (a>=1e9) return s+chNf(2).format(a/1e9)+'B'; if (a>=1e6) return s+chNf(2).format(a/1e6)+'M'; if (a>=1e4) return s+chNf(1).format(a/1e3)+'K';
  if (a>=100) return s+chNf(1).format(a); if (a>=1) return s+chNf(2).format(a); if (a===0) return '0'; return s+String(+a.toPrecision(3)); }
const chLoc = () => typeof ST==='object' && ST && ST.lang==='tr' ? 'tr-TR' : 'en-US';
function chDf(k, o){ const key=chLoc()+'|'+k; return CH_DF[key] || (CH_DF[key]=new Intl.DateTimeFormat(chLoc(), o)); }
const chLt = t => t-new Date(t).getTimezoneOffset()*6e4;      // local wall-clock time as if it were UTC
// "Sat 14 Nov '26 09:00" (intraday) / "Sat 14 Nov '26" (daily and weekly bars), in the page language and local time
function chTimeFull(t, tfms){ const wd=chDf('wd', { weekday:'short' }).format(t), dm=chDf('dm', { day:'numeric', month:'short' }).format(t).replace(/\./g, ''), yy="'"+String(new Date(t).getFullYear()).slice(2);
  return `${wd} ${dm} ${yy}`+(tfms<6e4 ? ' '+chDf('hms', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(t) : tfms<864e5 ? ' '+chDf('hm', { hour:'2-digit', minute:'2-digit', hour12:false }).format(t) : ''); }
function chCountdown(ms){ if (!(ms>0)) return '00:00'; const s=Math.floor(ms/1e3), p=x=>String(x).padStart(2,'0'), d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60);
  return d>0 ? d+L2('d ','g ')+p(h)+L2('h','sa') : h>0 ? p(h)+':'+p(m)+':'+p(s%60) : p(m)+':'+p(s%60); }
// readable text colour on a coloured label
function chOn(c){ const m=/^#?([0-9a-f]{6})$/i.exec(String(c||'').trim()); if (!m) return '#ffffff'; const n=parseInt(m[1],16), f=x=>{ x/=255; return x<=.03928 ? x/12.92 : Math.pow((x+.055)/1.055, 2.4); };
  const L=.2126*f(n>>16)+.7152*f(n>>8&255)+.0722*f(n&255); return L>.179 ? '#0b0d10' : '#ffffff'; }
// ---------------------------------------------------------------- ticks
function chNice(lo, hi, cnt){ const span=hi-lo; if (!(span>0) || !isFinite(span)) return { step:0, ticks:[] };
  const raw=span/Math.max(1, cnt), p=Math.pow(10, Math.floor(Math.log10(raw))), m=raw/p, step=(m<1.5 ? 1 : m<2.25 ? 2 : m<3.5 ? 2.5 : m<7.5 ? 5 : 10)*p, ticks=[];
  for (let k=Math.ceil(lo/step-1e-9); k*step<=hi+step*1e-9 && ticks.length<100; k++) ticks.push(+(k*step).toPrecision(12));
  return { step, ticks }; }
function chStepDec(step){ if (!(step>0)) return 2; const e=Math.floor(Math.log10(step)+1e-9), m=+(step/Math.pow(10, e)).toFixed(6); return Math.max(0, Math.min(10, -e+(m%1 ? 1 : 0))); }
function chLogTicks(lo, hi, cnt){ if (!(lo>0) || hi/lo<3) return chNice(lo, hi, cnt).ticks; const out=[];
  for (let e=Math.floor(Math.log10(lo)); e<=Math.ceil(Math.log10(hi)); e++) for (const m of [1,2,5]){ const v=m*Math.pow(10, e); if (v>=lo && v<=hi) out.push(+v.toPrecision(12)); }
  return out; }
const CH_TSTEPS=[5e3,1e4,15e3,3e4,6e4,3e5,9e5,18e5,36e5,72e5,108e5,144e5,216e5,432e5,864e5,1728e5,6048e5,-1,-3,-6,-12];   // negative: months
function chTKey(t, s){ const lt=chLt(t); if (s===6048e5) return Math.floor((lt-4*864e5)/s); if (s>0) return Math.floor(lt/s); const d=new Date(lt); return Math.floor((d.getUTCFullYear()*12+d.getUTCMonth())/(-s)); }
// time axis labels for the visible bars: [{ a, text, major }]
function chTimeTicks(raw, i0, i1, cw, tfms, minGap){
  if (i1<=i0) return [];
  const msBar=Math.max(tfms, (raw[i1].t-raw[i0].t)/(i1-i0)), stepMs=s=>s>0 ? s : -s*30.44*864e5;
  let s=CH_TSTEPS[CH_TSTEPS.length-1]; for (const x of CH_TSTEPS){ if (stepMs(x)>=tfms && stepMs(x)/msBar*cw>=minGap){ s=x; break; } }
  const out=[], day=t=>Math.floor(chLt(t)/864e5), mon=t=>{ const d=new Date(chLt(t)); return d.getUTCFullYear()*12+d.getUTCMonth(); }, yr=t=>new Date(chLt(t)).getUTCFullYear();
  for (let a=Math.max(1, i0); a<=i1; a++){ const t=raw[a].t, p=raw[a-1].t; if (chTKey(t, s)===chTKey(p, s)) continue;
    let text, major=false;
    if (stepMs(s)<864e5){ if (day(t)!==day(p)){ major=true; text=mon(t)!==mon(p) && new Date(chLt(t)).getUTCDate()<=3 && yr(t)!==yr(p) ? String(yr(t)) : chDf('dm', { day:'numeric', month:'short' }).format(t); } else text=s<6e4 ? chDf('hms', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(t) : chDf('hm', { hour:'2-digit', minute:'2-digit', hour12:false }).format(t); }
    else if (s>0){ if (mon(t)!==mon(p)){ major=true; text=yr(t)!==yr(p) ? String(yr(t)) : chDf('mo', { month:'short' }).format(t); } else text=String(new Date(chLt(t)).getUTCDate()); }
    else { if (yr(t)!==yr(p)){ major=true; text=String(yr(t)); } else text=chDf('mo', { month:'short' }).format(t); }
    out.push({ a, text, major }); }
  return out; }
// ---------------------------------------------------------------- render entry
function chTfEff(sym){ const C=ST.chart, tf=C && C.tf || '1m'; if (tf!=='1s') return tf; try{ return typeof liveDef==='function' && liveDef(sym) ? '1s' : '1m'; }catch(e){ return '1m'; } }
function chRender(host, sym){
  if (!host) return false; const C=chInit(); if (!C) return false;
  const tf=chTfEff(sym), key=sym+'|'+tf, raw0=chBarsFor(sym, tf);
  if (key!==CH.key){ CH.key=key; CH.view.end=0; CH.yz=1; CH.yo=0; CH.hov=null; CH.kb=null; CH.lastT=null; CH.more=''; CH.moreFail=0; chKinStop(); }
  CH.sym=sym;
  const raw=Array.isArray(raw0) ? raw0 : null;
  if (!raw || raw.length<2){ CHM=null; CH.chm=null; CH.L=null; CH.sig='';
    const err=typeof cdErr==='function' ? cdErr(sym, tf) : '';
    const msg=raw0==null ? (err ? L2('Could not load the candles. Trying again…','Mumlar yüklenemedi. Yeniden deneniyor…') : L2('Loading the chart…','Grafik yükleniyor…')) : L2('Waiting for prices…','Fiyatlar bekleniyor…');
    const h=`<p class="empty ch-empty"${CH.lastH ? ` style="min-height:${CH.lastH}px"` : ""}>${chEsc(msg)}</p>`; if (host.__h!==h){ host.__h=h; host.innerHTML=h; } CH.wrap=null; return false; }
  if (!CH.wrap || CH.host!==host || !host.contains(CH.wrap)) chMount(host);
  const html=document.documentElement, W=Math.max(300, Math.round(host.clientWidth || 720)), narrow=W<560, phone=(typeof innerWidth==='number' ? innerWidth : 1024)<=700, term=html.classList.contains('term'), full=html.classList.contains('ch-full');
  const subs=C.inds.filter(x=>{ const d=chDef(x.id); return d && d.pane==='sub'; }), subH=phone || narrow && !term ? 70 : 90;
  let mainH=phone ? 230 : term ? 430 : narrow ? 230 : 300;   // terminal: tall even when the chart column is narrow
  if (full){ const top=Math.max(0, host.getBoundingClientRect().top); mainH=Math.max(narrow ? 200 : 260, Math.floor(innerHeight-top-subs.length*subH-CH_AX-16)); }
  const N=raw.length, last=raw[N-1];
  // a new bar while scrolled back: keep the same bars on screen
  if (CH.lastT!=null && last.t>CH.lastT && CH.view.end>0.5){ let k=0; for (let i=N-1; i>=0 && raw[i].t>CH.lastT; i--) k++; CH.view.end+=k; }
  CH.lastT=last.t;
  const fl=(ST.A && ST.A.fills) || [], lf=fl[fl.length-1];
  const sig=[key, C.type, C.log, W, mainH, subH, CH.view.n, CH.view.end, CH.yz, CH.yo, N, raw[0].t, JSON.stringify(C.inds), C.marks, fl.length, lf ? lf.id+':'+lf.t : '', ST.lang, CH.moreBusy, CH.legMin, CH.legAll, chThemeKey()].join('|');
  const live=last.t+'|'+last.o+'|'+last.h+'|'+last.l+'|'+last.c+'|'+last.v, now=Date.now();
  if (sig===CH.sig && CH.L){
    if (CH.chm) CHM=CH.chm;    // someone else (an older chart) may have replaced it
    if (live===CH.live){ chDraw(); return true; }
    // live ticks: at most ~4 rebuilds a second unless the user is interacting, and never two builds in one frame
    // (a pan / zoom frame already carries the newest price)
    const gap=now-CH.act>400 ? 250 : 16;
    if (now-CH.built<gap){ if (!CH.timer) CH.timer=setTimeout(()=>{ CH.timer=0; chQueue(); }, Math.max(16, gap+10-(now-CH.built))); chDraw(); return true; }
  }
  try { chBuild(sym, raw, C, { W, mainH, subH, narrow, subs }); }
  catch (e){ try{ console.error(e); }catch(z){} return !!CH.L; }
  CH.sig=sig; CH.live=live; CH.built=now; CH.dr=null; chDraw(); chCross();
  // the left edge is on screen (or a visible VWAP needs today's session from its start): fetch older history once per
  // length; a 0 while more history exists (a refresh was running, or the request failed) is asked again after a back-off
  const L=CH.L, mk=key+'|'+N;
  if ((L.A(0)<=1 || chNeedSess(C, raw, tf)) && typeof cdMore==='function' && !CH.moreBusy && CH.more!==mk){ CH.more=mk; CH.moreBusy=true;
    const done=n=>{ CH.moreBusy=false; chMoreAfter(sym, tf, mk, +n||0); chQueue(); };
    Promise.resolve().then(()=>cdMore(sym, tf)).then(done, ()=>done(0)); }
  return true;
}
function chMoreAfter(sym, tf, mk, n){
  if (n>0){ CH.moreFail=0; return; }
  if (typeof cdMoreLeft==='function' && !cdMoreLeft(sym, tf)) return;      // the start of the history (or the cap): stop asking
  const wait=Math.min(30000, 600*Math.pow(2, CH.moreFail)); CH.moreFail++;
  setTimeout(()=>{ if (CH.more===mk){ CH.more=''; chQueue(); } }, wait); }
// VWAP restarts at UTC midnight: on a crypto intraday chart whose bars start after today's midnight, load older bars
// (until then the indicator shows nothing for the cut-off session rather than a wrong value)
function chNeedSess(C, raw, tf){ if (CH_TF_MS[tf]>=864e5 || !raw.length || !chH24(CH.sym)) return false;
  if (!C.inds.some(x=>x.id==='vwap' && !x.hide)) return false;
  const last=raw[raw.length-1].t; return raw[0].t>Math.floor(last/864e5)*864e5; }
const chH24 = sym => typeof liveDef==='function' && !!liveDef(sym);     // crypto: a 24-hour market
// context for indicators that need whole sessions: pivots read the previous day / week / month from daily bars,
// VWAP knows whether the first bar opens its session (stocks) or may be cut off (24-hour crypto)
function chIndCtx(id, sym, tf, raw){
  if (id==='vwap') return chH24(sym) ? null : { sess0:true, sig:'s0' };
  if (id!=='pivots' || tf==='1d') return null;
  let d=null; try{ d=typeof cdBars==='function' ? cdBars(sym, '1d') : null; }catch(e){ d=null; }
  if (!Array.isArray(d) || d.length<2){ const q=typeof quote==='function' ? quote(sym) : null; d=q && Array.isArray(q.daily) ? q.daily : null; }
  if (!d || !d.length) return null;
  // whole days only: drop the day the chart's last bar is in (still forming)
  const cut=Math.floor(raw[raw.length-1].t/864e5)*864e5, hi=[]; for (const b of d){ if (b && b.t<cut) hi.push(b); }
  if (!hi.length) return null; const z=hi[hi.length-1];
  return { hi, sig:hi.length+':'+hi[0].t+':'+z.t+':'+z.h+':'+z.l+':'+z.c }; }
// the chart gives way to something else in #tr-chart (a stock's performance view or a message): forget the old chart so
// no queued redraw (tick throttle, older-bars promise, kinetic pan) can paint it back, and CHM stops describing it
function chDetach(){
  if (CH.timer){ clearTimeout(CH.timer); CH.timer=0; } if (CH.qr){ cancelAnimationFrame(CH.qr); CH.qr=0; } if (CH.raf){ cancelAnimationFrame(CH.raf); CH.raf=0; }
  chKinStop(); clearTimeout(CH.holdT);
  CH.sym=null; CH.wrap=null; CH.svg=null; CH.L=null; CH.chm=null; CH.sig=''; CH.live=''; CH.drag=null; CH.pinch=null; CH.hov=null; CH.kb=null; CH.ptrs.clear();
  if (typeof CHM!=='undefined') CHM=null; }
// Esc handled by the chart UI (crosshair, drawing tools, dialogs): term.js leaves the next Esc alone for a moment, so a
// second press does not cancel an order
function chEscMark(){ CH.escT=Date.now(); }
function chEscRecent(){ return Date.now()-(CH.escT||0)<700; }
// redraw only the chart (and the order lines over it), once per frame
function chQueue(){ if (CH.qr) return; CH.qr=requestAnimationFrame(()=>{ CH.qr=0; try{ if (CH.host && CH.host.isConnected && CH.sym && (typeof ST!=='object' || !ST || !ST.sel || CH.sym===ST.sel) && CH.host.getClientRects().length){ chRender(CH.host, CH.sym); if (typeof ST==='object' && ST.term && typeof termLines==='function') termLines(); } }catch(e){ try{ console.error(e); }catch(z){} } }); }
function chDraw(){ const svg=CH.svg; if (!svg || !CH.L) return; const g=svg.querySelector('.ch-dr'); if (!g) return; let m='';
  try{ m=typeof drRender==='function' ? String(drRender() || '') : ''; }catch(e){ m=''; }
  if (m!==CH.dr){ CH.dr=m; g.innerHTML=m; } }
// ---------------------------------------------------------------- build
function chBuild(sym, raw, C, o){
  const { W, mainH, subH, narrow, subs }=o, N=raw.length, last=raw[N-1], tf=chTfEff(sym), tfms=CH_TF_MS[tf];
  const base=CH.key+'|'+N+'|'+raw[0].t+'|'+last.t+'|'+last.o+'|'+last.h+'|'+last.l+'|'+last.c+'|'+last.v;
  // results are kept per indicator instance (one slot each, replaced when the key changes): a live tick replaces its own
  // slot instead of pushing new entries through the shared LRU, and pan / zoom / crosshair rebuilds reuse them
  let disp=raw; if (C.type==='heikin' && typeof indHeikin==='function'){ if (!CH.ha || CH.ha.k!==base) CH.ha={ k:base, v:indHeikin(raw) }; disp=CH.ha.v; }
  const res={}, memo=CH.memo, inUse=new Set();
  for (const ind of C.inds){ const d=chDef(ind.id); if (!d) continue; const x=chIndCtx(ind.id, sym, tf, raw), k=base+'|'+ind.id+'|'+JSON.stringify(ind.p||{})+(x ? '|'+x.sig : ''), m=memo.get(ind.k);
    if (m && m.k===k) res[ind.k]=m.v; else { const v=d.f(raw, ind.p||{}, x); memo.set(ind.k, { k, v }); res[ind.k]=v; } inUse.add(ind.k); }
  for (const k of [...memo.keys()]) if (!inUse.has(k)) memo.delete(k);
  const mains=C.inds.filter(x=>{ const d=chDef(x.id); return d && d.pane!=='sub'; });
  const dec=chDec(last.c), padTxt=Math.max(chFmtP(last.c, dec).length, chFmtP(Math.max(...raw.slice(-300).map(b=>b.h)), dec).length);
  const pad=Math.max(narrow ? 50 : 58, Math.round(padTxt*6.3+16)), plotW=W-pad;
  const nDef=Math.max(20, Math.min(120, Math.round(plotW/6.5))), n=CH.view.n ? Math.max(20, Math.min(1000, CH.view.n)) : nDef, cw=plotW/n;
  CH.view.end=Math.max(-n*0.7, Math.min(Math.max(0, N-5), CH.view.end));
  const end=CH.view.end, xr=N-1-end, xR=plotW-cw*(0.5+CH_RM), X=a=>xR-(xr-a)*cw, A=x=>xr-(xR-x)/cw;
  const i0=Math.max(0, Math.floor(A(0))), i1=Math.min(N-1, Math.ceil(A(plotW))), aMax=Math.ceil(A(plotW))+1;
  // ---- price scale of the main pane
  const hl=!['line','area'].includes(C.type); let lo=Infinity, hi=-Infinity;
  for (let a=i0; a<=i1; a++){ const b=disp[a]; if (hl){ if (b.l<lo) lo=b.l; if (b.h>hi) hi=b.h; } else { if (b.c<lo) lo=b.c; if (b.c>hi) hi=b.c; } }
  const series=(ind, d, r, k)=>{ const s=r[k] || []; const ah=r.ahead && r.ahead[k]; return ah && ah.length ? s.concat(ah) : s; };
  for (const ind of mains){ const d=chDef(ind.id), r=res[ind.k]; if (ind.hide || !r || CH_NOSCALE[ind.id]) continue;
    for (const k in d.out){ const s=series(ind, d, r, k), e=Math.min(s.length-1, aMax); for (let a=i0; a<=e; a++){ const v=s[a]; if (v!=null){ if (v<lo) lo=v; if (v>hi) hi=v; } } } }
  if (!(hi>lo)){ const m=isFinite(hi) ? Math.abs(hi) || 1 : 1; lo=(isFinite(lo) ? lo : m)-m*0.005; hi=(isFinite(hi) ? hi : m)+m*0.005; }
  const log=C.log && lo>0, F=log ? Math.log : (v=>v), Fi=log ? Math.exp : (v=>v);
  // headroom at the top so the legend rows (OHLC + overlay values) cover as little of the price action as possible
  const legRows=chLM(narrow) ? 0 : Math.min(mains.length, Math.max(2, Math.floor((mainH*0.62-22)/19))), tTop=Math.max(0.115, Math.min(0.3, ((narrow ? 46 : 34)+19*legRows)/mainH)), fTop=tTop*1.08/(1-tTop);
  let sLo=F(lo), sHi=F(hi); { const sp=sHi-sLo; sLo-=sp*0.08; sHi+=sp*fTop; const c=(sLo+sHi)/2+CH.yo*(sHi-sLo), h=(sHi-sLo)/2*CH.yz; sLo=c-h; sHi=c+h; }
  const yM=v=>(sHi-F(v))/(sHi-sLo)*mainH, pxM=y=>Fi(sHi-y/mainH*(sHi-sLo));
  // ---- panes
  const panes=[{ id:'main', top:0, h:mainH, y:yM, v:pxM, main:true }]; let top=mainH;
  for (const ind of subs){ const d=chDef(ind.id), r=res[ind.k]||{}, pT=16, pB=4; let a0=Infinity, a1=-Infinity;
    if (d.range){ a0=d.range[0]; a1=d.range[1]; }
    else { for (const k in d.out){ const s=r[k]||[]; for (let a=i0; a<=i1; a++){ const v=s[a]; if (v!=null){ if (v<a0) a0=v; if (v>a1) a1=v; } } if (d.out[k].kind==='hist'){ a0=Math.min(a0, 0); a1=Math.max(a1, 0); } }
      for (const v of d.lv||[]){ a0=Math.min(a0, v); a1=Math.max(a1, v); }
      if (!(a1>a0)){ const m=isFinite(a1) ? Math.abs(a1)||1 : 1; a0=(isFinite(a0) ? a0 : 0)-m*0.1; a1=(isFinite(a1) ? a1 : 0)+m*0.1; }
      const sp=a1-a0; if (ind.id!=='vol') a0-=sp*0.06; a1+=sp*0.06; }
    const t0=top, ih=subH-pT-pB, plo=a0, phi=a1;
    panes.push({ id:ind.k, ind, d, top:t0, h:subH, lo:plo, hi:phi, y:v=>t0+pT+(phi-v)/(phi-plo)*ih, v:y=>phi-(y-t0-pT)/ih*(phi-plo) }); top+=subH; }
  const axTop=top, H=top+CH_AX;
  // ---- coordinate API for term.js and draw.js
  const t2a=t=>{ if (t<=raw[0].t) return (t-raw[0].t)/tfms; if (t>=last.t) return N-1+(t-last.t)/tfms; let l=0, h=N-1; while (h-l>1){ const m=(l+h)>>1; if (raw[m].t<=t) l=m; else h=m; } const g=raw[h].t-raw[l].t; return l+(g>0 ? Math.min(1, (t-raw[l].t)/g) : 0); };
  const a2t=a=>{ if (a<=0) return raw[0].t+a*tfms; if (a>=N-1) return last.t+(a-N+1)*tfms; const i=Math.floor(a), f=a-i; return raw[i].t+f*(raw[i+1].t-raw[i].t); };
  CHM=CH.chm={ lo:Fi(sLo), hi:Fi(sHi), W, H, pad, plotW, top:0, mainH, log, y:yM, px:pxM, x:i=>X(i0+i), t2x:t=>X(t2a(t)), x2t:x=>a2t(A(x)), a2x:X, x2a:A, t2a, a2t,
    bars:disp.slice(i0, i1+1), raw, i0, i1, N, cw, tfms, sym, tf, panes:panes.map(p=>({ id:p.id, top:p.top, h:p.h })) };
  const L=CH.L={ W, H, pad, plotW, mainH, axTop, panes, X, A, xR, n, N, raw, disp, res, mains, subs, dec, tfms, cw, i0, i1, sym, tf, log, narrow, yM };
  // ---- markup
  const f1=v=>Math.round(v*10)/10, out=[], clip=k=>`url(#ch-cp${k})`;
  out.push('<defs>');
  panes.forEach((p, k)=>out.push(`<clipPath id="ch-cp${k}"><path d="M0 ${p.top}H${plotW}V${p.top+p.h}H0Z"/></clipPath>`));
  out.push('<linearGradient id="ch-ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>');
  // grid + price ticks
  const tcnt=Math.max(3, Math.round(mainH/48)), tk=log ? chLogTicks(Fi(sLo), Fi(sHi), tcnt) : chNice(Fi(sLo), Fi(sHi), tcnt).ticks, tstep=log ? 0 : chNice(Fi(sLo), Fi(sHi), tcnt).step;
  const tdec=log ? dec : Math.min(dec, chStepDec(tstep)), ttick=chTimeTicks(raw, i0, i1, cw, tfms, narrow ? 66 : 86);
  let gd='', lab=''; let lastY=-99;
  for (const v of tk){ const y=yM(v); if (y<6 || y>mainH-4 || Math.abs(y-lastY)<18) continue; lastY=y; gd+=`M0 ${f1(y)}H${plotW}`; lab+=`<text x="${plotW+6}" y="${f1(y+3.5)}">${chFmtP(v, log ? chDec(v) : tdec)}</text>`; }
  for (const p of panes.slice(1)){ const d=p.d, ih=p.h-20; let vals;
    if (d.lv && d.lv.length) vals=d.lv.slice(); else vals=chNice(p.lo, p.hi, Math.max(2, Math.round(ih/30))).ticks;
    if (d.range && !(d.lv && d.lv.length)) vals=[d.range[0], (d.range[0]+d.range[1])/2, d.range[1]];
    for (const v of vals){ const y=p.y(v); if (y<p.top+8 || y>p.top+p.h-3) continue; gd+=`M0 ${f1(y)}H${plotW}`; lab+=`<text x="${plotW+6}" y="${f1(y+3.5)}">${chFmtV(v)}</text>`; } }
  let lx=-99; for (const t of ttick){ const x=X(t.a); if (x<14 || x>plotW-14 || x-lx<(narrow ? 40 : 52)) continue; lx=x; gd+=`M${f1(x)} 0V${axTop}`; lab+=`<text class="ch-tl${t.major ? ' ch-tm' : ''}" x="${f1(x)}" y="${axTop+15}" text-anchor="middle">${chEsc(t.text)}</text>`; }
  out.push(`<path class="gl" fill="none" d="${gd}"/>`);
  // separators and axis lines
  let sp=`M${plotW+0.5} 0V${axTop}M0 ${axTop+0.5}H${W}`; for (const p of panes.slice(1)) sp+=`M0 ${p.top+0.5}H${W}`;
  out.push(`<path class="ch-sep" fill="none" d="${sp}"/>`);
  // ---- main pane
  out.push(`<g clip-path="${clip(0)}">`);
  const bandFill=(up, dn, a0, a1, cu, cd, Y)=>{ let s=''; const sign=cu!==cd; let seg=[], sg=0;
    const flush=()=>{ if (seg.length>1){ const fw=seg.map(a=>`${f1(X(a))} ${f1(Y(up[a]))}`).join('L'), bw=seg.slice().reverse().map(a=>`${f1(X(a))} ${f1(Y(dn[a]))}`).join('L'); s+=`<path d="M${fw}L${bw}Z" fill="${chEsc(sign && sg<0 ? cd : cu)}" fill-opacity="${sign ? .16 : .08}" stroke="none"/>`; } seg=[]; };
    for (let a=a0; a<=a1; a++){ const u=up[a], v=dn[a]; if (u==null || v==null){ flush(); continue; } const g=u>=v ? 1 : -1; if (sign && seg.length && g!==sg){ const pa=seg[seg.length-1]; flush(); seg.push(pa); } sg=g; seg.push(a); }
    flush(); return s; };
  const linePath=(s, a0, a1, Y)=>{ let d='', pen=false; for (let a=a0; a<=a1; a++){ const v=s[a]; if (v==null){ pen=false; continue; } d+=(pen ? 'L' : 'M')+f1(X(a))+' '+f1(Y(v)); pen=true; } return d; };
  const dotsPath=(s, a0, a1, Y)=>{ const r=Math.max(1.2, Math.min(2.5, cw*0.22)); let d=''; for (let a=a0; a<=a1; a++){ const v=s[a]; if (v==null) continue; const x=X(a), y=Y(v); d+=`M${f1(x-r)} ${f1(y)}a${r} ${r} 0 1 0 ${f1(2*r)} 0a${r} ${r} 0 1 0 ${f1(-2*r)} 0`; } return d; };
  const levelPath=(s, a0, a1, Y, lab)=>{ let d='', a=a0, txt=''; while (a<=a1){ const v=s[a]; if (v==null){ a++; continue; } let b=a; while (b+1<=a1 && s[b+1]===v) b++; const x1=X(a)-cw/2, x2=X(b)+cw/2, y=f1(Y(v)); d+=`M${f1(x1)} ${y}H${f1(x2)}`; if (b>=a1-1 || b===N-1) txt=`<text x="${f1(Math.min(x2, plotW)-3)}" y="${f1(+y-3)}" text-anchor="end" class="ch-pvt">${chEsc(lab)}</text>`; a=b+1; } return { d, txt }; };
  // overlay bands go behind the candles
  const ovl=[];
  for (const ind of mains){ const d=chDef(ind.id), r=res[ind.k]; if (ind.hide || !r) continue; const e=Math.min(N-1+((r.ahead && r.ahead.up) ? r.ahead.up.length : 0), aMax), a0=Math.max(0, i0-1);
    if (d.out.up && d.out.dn && d.out.up.kind==='band') out.push(bandFill(series(ind, d, r, 'up'), series(ind, d, r, 'dn'), a0, e, chCol(ind, d, 'up'), chCol(ind, d, 'dn'), yM));
    for (const k in d.out){ const col=chEsc(chCol(ind, d, k)), s=series(ind, d, r, k), kind=d.out[k].kind;
      if (ind.id==='pivots'){ const lv=levelPath(s, a0, e, yM, d.out[k].n[0]); if (lv.d) ovl.push(`<path d="${lv.d}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="5 3"/>`, lv.txt.replace('class="ch-pvt"', `class="ch-pvt" style="fill:${col}"`)); }
      else if (kind==='dots'){ const p=dotsPath(s, a0, e, yM); if (p) ovl.push(`<path d="${p}" fill="${col}" stroke="none"/>`); }
      else { const p=linePath(s, a0, e, yM); if (p) ovl.push(`<path d="${p}" fill="none" stroke="${col}" stroke-width="${kind==='band' ? 1 : 1.5}" stroke-linejoin="round"/>`); } } }
  // price series
  const bw=Math.max(1, Math.min(cw*0.72, cw-1)), up=a=>{ const b=disp[a]; return C.type==='hollow' ? (a>0 ? b.c>=disp[a-1].c : b.c>=b.o) : b.c>=b.o; };
  if (C.type==='line' || C.type==='area'){ const cl=disp.map(b=>b.c), d=linePath(cl, Math.max(0, i0-1), Math.min(N-1, i1+1), yM);
    if (C.type==='area') out.push(`<path class="ch-ar" d="${d}L${f1(X(Math.min(N-1, i1+1)))} ${mainH}L${f1(X(Math.max(0, i0-1)))} ${mainH}Z" fill="url(#ch-ga)"/>`);
    out.push(`<path class="ch-ln" d="${d}"/>`); }
  else if (C.type==='bar'){ let u='', dn='', tw=Math.max(1, bw/2);
    for (let a=i0; a<=i1; a++){ const b=disp[a], x=Math.round(X(a))+0.5, s=`M${x} ${f1(yM(b.h))}V${f1(yM(b.l))}M${f1(x-tw)} ${f1(yM(b.o))}H${x}M${x} ${f1(yM(b.c))}H${f1(x+tw)}`; if (up(a)) u+=s; else dn+=s; }
    out.push(`<path class="cu ch-wk ch-ob" d="${u}"/><path class="cd ch-wk ch-ob" d="${dn}"/>`); }
  else if (Math.max(1, Math.round(bw))===1){ let wu='', wd='';     // zoomed far out: a 1px body is the wick's own pixel column, so one path per colour
    for (let a=i0; a<=i1; a++){ const b=disp[a], x=Math.round(X(a))+0.5, w=`M${x} ${f1(yM(b.h))}V${f1(Math.max(yM(b.l), yM(b.h)+1))}`; if (up(a)) wu+=w; else wd+=w; }
    out.push(`<path class="cu ch-wk ch-thin" d="${wu}"/><path class="cd ch-wk ch-thin" d="${wd}"/>`); }
  else { let wu='', wd='', bodies='';
    for (let a=i0; a<=i1; a++){ const b=disp[a], u=up(a), x=Math.round(X(a))+0.5, yo=yM(b.o), yc=yM(b.c), y1=Math.min(yo, yc), y2=Math.max(yo, yc), hollow=C.type==='hollow' && b.c>=b.o;
      const w=hollow ? `M${x} ${f1(yM(b.h))}V${f1(y1)}M${x} ${f1(y2)}V${f1(yM(b.l))}` : `M${x} ${f1(yM(b.h))}V${f1(yM(b.l))}`; if (u) wu+=w; else wd+=w;
      const bx=Math.round(X(a)-bw/2), bwi=Math.max(1, Math.round(bw));
      bodies+=hollow ? `<rect class="${u ? 'cu' : 'cd'} ch-ho" x="${bx+0.5}" y="${f1(y1)}" width="${Math.max(0.5, bwi-1)}" height="${f1(Math.max(1, y2-y1))}"/>` : `<rect class="${u ? 'cu' : 'cd'}" x="${bx}" y="${f1(y1)}" width="${bwi}" height="${f1(Math.max(1, y2-y1))}"/>`; }
    out.push(`<path class="cu ch-wk" d="${wu}"/><path class="cd ch-wk" d="${wd}"/>`, bodies); }
  out.push(ovl.join(''));
  // highest high / lowest low of the window
  if (hl && i1>i0){ let ah=i0, al=i0; for (let a=i0; a<=i1; a++){ if (disp[a].h>disp[ah].h) ah=a; if (disp[a].l<disp[al].l) al=a; }
    const mk=(a, v, dy)=>{ const x=X(a), y=yM(v)+dy, right=x<plotW*0.62, xs=right ? x+4 : x-4, xe=right ? x+16 : x-16; return `<path class="ch-hlm" d="M${f1(xs)} ${f1(y-3)}L${f1(xe)} ${f1(y-3)}" fill="none"/><text class="ch-hlt" x="${f1(right ? xe+3 : xe-3)}" y="${f1(y)}" text-anchor="${right ? 'start' : 'end'}">${chFmtP(v, dec)}</text>`; };
    out.push(mk(ah, disp[ah].h, -4), mk(al, disp[al].l, 12)); }
  // my fills
  if (C.marks){ const mks=[], stack={};
    for (const f of chFills()) { if (f.sym!==sym || !(f.t>0)) continue; const a=Math.floor(t2a(f.t)+1e-9); if (a<i0 || a>i1 || a<0 || a>=N) continue;
      const buy=f.side==='b', b=disp[a], k=a+(buy ? 'b' : 's'), j=stack[k]=(stack[k]||0)+1, x=X(a), s=Math.max(4, Math.min(6, cw*0.45));
      const y=buy ? yM(b.l)+6+(j-1)*(s+3) : yM(b.h)-6-(j-1)*(s+3);
      const tri=buy ? `M${f1(x)} ${f1(y)}L${f1(x+s)} ${f1(y+s*1.4)}L${f1(x-s)} ${f1(y+s*1.4)}Z` : `M${f1(x)} ${f1(y)}L${f1(x+s)} ${f1(y-s*1.4)}L${f1(x-s)} ${f1(y-s*1.4)}Z`;
      const ttl=`${buy ? L2('Bought','Alındı') : L2('Sold','Satıldı')} ${+(+f.q).toPrecision(6)} @ $${chFmtP(f.px, chDec(f.px))} · ${chTimeFull(f.t, 6e4)}`;
      mks.push(`<path class="ch-mk ${buy ? 'b' : 's'}" d="${tri}"><title>${chEsc(ttl)}</title></path>`); }
    out.push(mks.join('')); }
  // last price line
  const lc=last.c, ldir=last.c>=last.o ? 'up' : 'down', ly=yM(lc);
  out.push(`<path class="ch-lp ${ldir}" fill="none" d="M0 ${f1(ly)}H${plotW}"/>`);
  out.push('</g>');
  out.push(`<g class="ch-dr" clip-path="${clip(0)}"></g>`);
  // ---- sub panes
  panes.slice(1).forEach((p, k)=>{ const ind=p.ind, d=p.d, r=res[ind.k]||{}; out.push(`<g clip-path="${clip(k+1)}">`);
    const lv=d.lv||[]; if (lv.length===2){ const ya=p.y(Math.max(...lv)), yb=p.y(Math.min(...lv)); const fc=chCol(ind, d, Object.keys(d.out)[0]); out.push(`<path d="M0 ${f1(ya)}H${plotW}V${f1(yb)}H0Z" fill="${chEsc(fc)}" fill-opacity=".07" stroke="none"/>`); }
    if (lv.length) out.push(`<path class="ch-lv" fill="none" d="${lv.map(v=>`M0 ${f1(p.y(v))}H${plotW}`).join('')}"/>`);
    if (!ind.hide){ const a0=Math.max(0, i0-1), a1=Math.min(N-1, i1+1);
      if (d.out.up && d.out.dn && d.out.up.kind==='band') out.push(bandFill(r.up||[], r.dn||[], a0, a1, chCol(ind, d, 'up'), chCol(ind, d, 'dn'), p.y));
      for (const key in d.out){ const kind=d.out[key].kind, s=r[key]||[], col=chEsc(chCol(ind, d, key));
        if (kind==='hist'){ const y0=p.y(0), w=Math.max(1, Math.min(cw*0.62, cw-1)), g={ a:'', b:'', c:'', d:'' };
          for (let a=i0; a<=i1; a++){ const v=s[a]; if (v==null) continue; const x=X(a), y=p.y(v), seg=`M${f1(x-w/2)} ${f1(y0)}h${f1(w)}V${f1(y)}h${f1(-w)}Z`;
            if (ind.id==='vol'){ if ((r.dir||[])[a]<0) g.b+=seg; else g.a+=seg; }
            else { const pv=s[a-1], rising=pv==null || Math.abs(v)>=Math.abs(pv); if (v>=0) g[rising ? 'a' : 'c']+=seg; else g[rising ? 'b' : 'd']+=seg; } }
          const pc=ind.c && ind.c[key] ? col : 'var(--gain)';
          out.push(`<path d="${g.a}" fill="${pc}" fill-opacity="${ind.id==='vol' ? .5 : .85}"/><path d="${g.b}" fill="var(--loss)" fill-opacity="${ind.id==='vol' ? .5 : .85}"/>`);
          if (g.c || g.d) out.push(`<path d="${g.c}" fill="${pc}" fill-opacity=".4"/><path d="${g.d}" fill="var(--loss)" fill-opacity=".4"/>`); }
        else if (kind==='dots'){ const pd=dotsPath(s, a0, a1, p.y); if (pd) out.push(`<path d="${pd}" fill="${col}"/>`); }
        else { const pd=linePath(s, a0, a1, p.y); if (pd) out.push(`<path d="${pd}" fill="none" stroke="${col}" stroke-width="${kind==='band' ? 1 : 1.5}" stroke-linejoin="round"/>`); } } }
    out.push('</g>'); });
  out.push(lab);
  // ---- labels on the price axis: indicator values, then the last price with the countdown on top of them
  const tags=[], aL=Math.min(i1, N-1);
  for (const ind of mains){ const d=chDef(ind.id), r=res[ind.k]; if (ind.hide || !r || ind.id==='pivots') continue; for (const k in d.out){ if (d.out[k].kind==='dots') continue; const v=(r[k]||[])[aL]; if (v==null) continue; const y=yM(v); if (y<0 || y>mainH) continue; tags.push({ y, t:chFmtP(v, dec), c:chCol(ind, d, k), lo:0, hi:mainH }); } }
  for (const p of panes.slice(1)){ const ind=p.ind, d=p.d, r=res[ind.k]||{}; if (ind.hide) continue; for (const k in d.out){ const v=(r[k]||[])[aL]; if (v==null) continue; const c=d.out[k].kind==='hist' ? (ind.id==='vol' ? ((r.dir||[])[aL]<0 ? 'var(--loss)' : 'var(--gain)') : v>=0 ? 'var(--gain)' : 'var(--loss)') : chCol(ind, d, k); tags.push({ y:p.y(v), t:chFmtV(v), c, lo:p.top+2, hi:p.top+p.h-2, sub:true }); } }
  const q=typeof quote==='function' ? quote(sym) : null, cdOn=tfms>1e3 && !(q && q.open===false) && Date.now()<last.t+tfms*1.5, lyC=Math.max(8, Math.min(mainH-(cdOn ? 22 : 8), ly));
  const used=[[lyC-8, lyC+(cdOn ? 22 : 8)]], tagM=[];
  for (const g of tags){ const y=Math.max(g.lo+7, Math.min(g.hi-7, g.y)); if (used.some(u=>y+7>u[0] && y-7<u[1])) continue; used.push([y-7, y+7]);
    const fg=g.c.startsWith('var(') ? 'var(--on-trade)' : chOn(g.c); tagM.push(`<path d="M${plotW} ${f1(y)}l4 -7H${W}V${f1(y+7)}H${plotW+4}Z" fill="${chEsc(g.c)}"/><text x="${plotW+6}" y="${f1(y+3.5)}" style="fill:${fg}" class="ch-tg">${g.t}</text>`); }
  out.push(tagM.join(''));
  out.push(`<path class="ch-lpb ${ldir}" d="M${plotW} ${f1(lyC)}l4 -8H${W}V${f1(lyC+(cdOn ? 22 : 8))}H${plotW+4}V${f1(lyC+8)}Z"/><text class="ch-lpt" x="${plotW+6}" y="${f1(lyC+3.5)}">${chFmtP(lc, dec)}</text>`);
  if (cdOn) out.push(`<text class="ch-lpt ch-cdt" x="${plotW+6}" y="${f1(lyC+17)}">${chCountdown(last.t+tfms-Date.now())}</text>`);
  out.push('<g class="ch-x ch-noshot"></g>');
  // ---- write it
  const svg=CH.svg, first=disp[i0].o || disp[i0].c, lastV=disp[i1].c;
  CH.lastH=H; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.style.height=H+'px';
  svg.setAttribute('aria-label', `${sym} · ${chTfName(tf)} · ${L2('last','son')} $${chFmtP(lc, dec)} · ${L2('on screen','ekranda')} ${typeof pct==='function' ? pct(lastV/first-1) : ((lastV/first-1)*100).toFixed(2)+'%'}`);
  CH.wrap.setAttribute('aria-label', L2(`${sym} price chart. Arrow keys move it, + and − zoom, Shift+arrows move the crosshair, Home resets.`, `${sym} fiyat grafiği. Ok tuşları kaydırır, + ve − yakınlaştırır, Shift+ok artı imlecini taşır, Home sıfırlar.`));
  svg.innerHTML=out.join('');
  chLegBuild(L); chCtl(L);
}
function chFills(){ return (typeof ST==='object' && ST && ST.A && Array.isArray(ST.A.fills)) ? ST.A.fills : []; }
// ---------------------------------------------------------------- legend (built when its structure changes, values updated in place)
const CH_EYE='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1 8s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>';
const CH_EYEX='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1 8s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 14L14 2" stroke="currentColor" stroke-width="1.6"/></svg>';
function chLegBuild(L){
  const C=ST.chart, legSig=JSON.stringify([L.sym, L.tf, ST.lang, L.pad, L.panes.map(p=>p.top), C.inds.map(x=>[x.k, x.id, x.p, x.c, x.hide]), chLM(L.narrow), CH.legAll, L.dec, C.type, chThemeKey()]);
  if (legSig===CH.legSig && CH.lvEls.length) return; CH.legSig=legSig;
  const lv=[], V=(fn)=>{ lv.push(fn); return `<span data-lv="${lv.length-1}"></span>`; };
  const row=(ind, d, p, fmt)=>{ const nm=chEsc(chLabel(ind)), outs=Object.keys(d.out);
    const vals=outs.map(k=>{ const c=chEsc(chCol(ind, d, k)); return V((a, L)=>{ const r=L.res[ind.k]||{}; const v=(r[k]||[])[a]; return { t:v==null ? '' : fmt(v), c:v==null ? 'ch-v ch-nil' : 'ch-v', s:c }; }); }).join('');
    return `<div class="ch-lr ch-li${ind.hide ? ' off' : ''}"><button type="button" class="ch-in" data-cu-ind="${chEsc(ind.k)}" title="${chEsc(L2('Settings','Ayarlar'))}">${nm}</button>${ind.hide ? '' : vals}`+
      `<button type="button" class="ch-ib" data-ch-eye="${chEsc(ind.k)}" aria-pressed="${ind.hide ? 'true' : 'false'}" aria-label="${chEsc((ind.hide ? L2('Show','Göster') : L2('Hide','Gizle'))+' '+chLabel(ind))}">${ind.hide ? CH_EYEX : CH_EYE}</button>`+
      `<button type="button" class="ch-ib" data-ch-del="${chEsc(ind.k)}" aria-label="${chEsc(L2('Remove','Kaldır')+' '+chLabel(ind))}">×</button></div>`; };
  const k=(en, tr, full, fullTr)=>`<abbr class="ch-k" title="${chEsc(L2(full, fullTr))}">${chEsc(L2(en, tr))}</abbr>`;
  const px=(f)=>V((a, L)=>{ const b=L.disp[a]; return { t:chFmtP(f(b), L.dec), c:b.c>=b.o ? 'up' : 'down' }; });
  let h=`<div class="ch-lg" style="top:4px;right:${L.pad+6}px"><div class="ch-lr"><span class="ch-sy">${chEsc(L.sym)} · ${chEsc(chTfName(L.tf))}</span>`+
    k('O','A','Open','Açılış')+px(b=>b.o)+k('H','Y','High','Yüksek')+px(b=>b.h)+k('L','D','Low','Düşük')+px(b=>b.l)+k('C','K','Close','Kapanış')+px(b=>b.c)+
    V((a, L)=>{ const b=L.disp[a], p=L.disp[a-1]; if (!p) return { t:'', c:'' }; const d=b.c-p.c, r=p.c ? d/p.c : 0; return { t:(d>=0 ? '+' : '−')+chFmtP(Math.abs(d), L.dec)+' ('+(typeof pct==='function' ? pct(r) : (r*100).toFixed(2)+'%')+')', c:d>0 ? 'up' : d<0 ? 'down' : '' }; })+
    k('Vol','Hcm','Volume','Hacim')+V((a, L)=>({ t:chFmtV(L.raw[a].v||0), c:'' }));
  if (L.mains.length) h+=`<button type="button" class="ch-ib ch-lx" data-ch-legx aria-expanded="${chLM(L.narrow) ? 'false' : 'true'}" aria-label="${chEsc(chLM(L.narrow) ? L2('Show the indicator values','İndikatör değerlerini göster') : L2('Hide the indicator values','İndikatör değerlerini gizle'))}">${chLM(L.narrow) ? '▸' : '▾'}</button>`;
  h+='</div>';
  if (!chLM(L.narrow)){ const cap=Math.max(2, Math.floor((L.mainH*0.62-22)/19)), cut=!CH.legAll && L.mains.length>cap ? cap-1 : L.mains.length;
    for (const ind of L.mains.slice(0, cut)){ const d=chDef(ind.id); h+=row(ind, d, null, v=>chFmtP(v, L.dec)); }
    if (L.mains.length>cap) h+=`<div class="ch-lr"><button type="button" class="ch-more" data-ch-legmore aria-expanded="${CH.legAll ? 'true' : 'false'}">${chEsc(CH.legAll ? L2('Show fewer','Daha az göster') : L2(`+${L.mains.length-cut} more`, `+${L.mains.length-cut} daha`))}</button></div>`; }
  h+='</div>';
  for (const p of L.panes.slice(1)) h+=`<div class="ch-lg" style="top:${p.top+2}px;right:${L.pad+6}px">${row(p.ind, p.d, p, chFmtV)}</div>`;
  const el=CH.wrap.querySelector('.ch-lgs'); el.innerHTML=h; CH.lv=lv; CH.lvEls=[...el.querySelectorAll('[data-lv]')];
  for (const s of CH.lvEls){ const i=+s.dataset.lv; s.__i=i; }
}
function chLegend(a){ const L=CH.L; if (!L) return; a=Math.max(0, Math.min(L.N-1, a));
  for (const el of CH.lvEls){ const r=CH.lv[el.__i](a, L); if (el.textContent!==r.t) el.textContent=r.t; if (r.c!=null && el.className!==r.c) el.className=r.c; if (r.s && el.__s!==r.s){ el.__s=r.s; el.style.setProperty('--sw', r.s); } } }
// ---------------------------------------------------------------- buttons on the plot
function chCtl(L){ const manual=CH.yz!==1 || CH.yo!==0, away=CH.view.end>0.5, sig=[L.mainH, L.pad, manual, away, ST.lang, CH.moreBusy].join('|'); if (sig===CH.ctlSig) return; CH.ctlSig=sig;
  const b=(attr, txt, en, tr)=>`<button type="button" ${attr} title="${chEsc(L2(en, tr))}" aria-label="${chEsc(L2(en, tr))}">${txt}</button>`;
  const h=`<div class="ch-zm" style="top:${L.mainH-36}px;right:${L.pad}px">${b('data-ch-z="-1"', '−', 'Zoom out', 'Uzaklaştır')}${b('data-ch-z="1"', '+', 'Zoom in', 'Yakınlaştır')}${b('data-ch-reset', '⟲', 'Reset the view', 'Görünümü sıfırla')}${manual ? b('data-ch-auto', 'A', 'Automatic price scale', 'Otomatik fiyat ölçeği') : ''}</div>`+
    (away ? `<button type="button" class="ch-golive" data-ch-live style="top:${L.mainH-36}px;right:${L.pad+8}px" aria-label="${chEsc(L2('Go to the live bar','Canlı muma git'))}"><span aria-hidden="true">⇥</span> ${chEsc(L2('Live','Canlı'))}</button>` : '')+
    (CH.moreBusy ? `<span class="ch-busy" style="top:${Math.max(4, L.mainH-30)}px">${chEsc(L2('Loading older bars…','Eski mumlar yükleniyor…'))}</span>` : '');
  CH.wrap.querySelector('.ch-ctl').innerHTML=h; }
// ---------------------------------------------------------------- crosshair
function chCrossLater(){ if (!CH.raf) CH.raf=requestAnimationFrame(chCross); }
function chCross(){ CH.raf=0; const L=CH.L, svg=CH.svg; if (!L || !svg) return; const g=svg.querySelector('.ch-x'); if (!g) return;
  const f1=v=>Math.round(v*10)/10; let h=CH.hov, a=L.N-1, out='';
  if (!h && CH.kb!=null){ const k=Math.max(0, Math.min(L.N-1, CH.kb)); h={ x:L.X(k), y:L.yM(L.disp[k].c), kb:true }; }
  if (h && h.x>=0 && h.x<L.plotW && h.y>=0 && h.y<L.axTop){
    const af=Math.round(L.A(h.x)), x=L.X(af); a=af;
    const pane=L.panes.find(p=>h.y>=p.top && h.y<p.top+p.h) || L.panes[0];
    out+=`<path class="ch-xl" d="M${f1(x)} 0V${L.axTop}M0 ${f1(h.y)}H${L.plotW}"/>`;
    const val=pane.main ? chFmtP(pane.v(h.y), L.dec) : chFmtV(pane.v(h.y));
    out+=`<path class="ch-xb" d="M${L.plotW} ${f1(h.y-8)}H${L.W}V${f1(h.y+8)}H${L.plotW}Z"/><text class="ch-xt" x="${L.plotW+6}" y="${f1(h.y+3.5)}">${val}</text>`;
    const t=af<=0 ? L.raw[0].t+af*L.tfms : af>=L.N-1 ? L.raw[L.N-1].t+(af-L.N+1)*L.tfms : L.raw[af].t, txt=chTimeFull(t, L.tfms), tw=txt.length*6.1+14, tx=Math.max(0, Math.min(L.plotW-tw, x-tw/2));
    out+=`<path class="ch-xb" d="M${f1(tx)} ${L.axTop+1}h${f1(tw)}v${CH_AX-2}h${f1(-tw)}Z"/><text class="ch-xt" x="${f1(tx+tw/2)}" y="${L.axTop+15}" text-anchor="middle">${chEsc(txt)}</text>`;
  } else a=Math.min(L.N-1, L.i1);
  g.innerHTML=out; chLegend(a); }
// ---------------------------------------------------------------- view changes
const chNow = () => { CH.act=Date.now(); };
function chZoomAt(nn, x, anchor){ const L=CH.L; if (!L) return; nn=Math.max(20, Math.min(1000, nn)); const live=CH.view.end<=0.5 && anchor==null;
  if (x==null || live){ x=L.xR; anchor=L.N-1-CH.view.end; }   // live (or buttons): keep the right edge where it is
  if (anchor==null) anchor=L.A(x);
  const cw2=L.plotW/nn, xR2=L.plotW-cw2*(0.5+CH_RM), xr2=anchor+(xR2-x)/cw2;
  CH.view.n=nn; CH.view.end=live ? CH.view.end : L.N-1-xr2; chNow(); chQueue(); }
function chPanBy(bars){ CH.view.end+=bars; chNow(); chQueue(); }
function chReset(){ chKinStop(); CH.view.n=null; CH.view.end=0; CH.yz=1; CH.yo=0; chNow(); chQueue(); }
function chLive(){ chKinStop(); CH.view.end=0; chNow(); chQueue(); }
function chKinStop(){ if (CH.kin){ cancelAnimationFrame(CH.kin); CH.kin=0; } }
function chKinStart(v){ chKinStop(); if (typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return; let t0=performance.now();
  const step=t=>{ const L=CH.L, dt=Math.min(50, t-t0); t0=t; if (!L){ CH.kin=0; return; } const e0=CH.view.end; CH.view.end+=v*dt/L.cw; v*=Math.pow(0.995, dt); chNow(); chQueue();
    if (Math.abs(v)<0.02 || (CH.view.end<=-L.n*0.7 && v<0) || (CH.view.end>=L.N-5 && v>0) || e0===CH.view.end){ CH.kin=0; return; } CH.kin=requestAnimationFrame(step); };
  CH.kin=requestAnimationFrame(step); }
// ---------------------------------------------------------------- pointer, wheel, keyboard
function chMount(host){
  host.innerHTML='<div class="ch-wrap" tabindex="0" role="group"><svg class="chart" xmlns="http://www.w3.org/2000/svg" role="img"></svg><div class="ch-lgs"></div><div class="ch-ctl"></div></div>';
  host.__h=null; CH.host=host; CH.wrap=host.firstElementChild; CH.svg=CH.wrap.querySelector('svg'); CH.sig=''; CH.legSig=''; CH.lvEls=[]; CH.ctlSig=''; CH.dr=null;
  const s=CH.svg, w=CH.wrap;
  s.addEventListener('pointerdown', chDown); s.addEventListener('pointermove', chMove); s.addEventListener('pointerup', chUp); s.addEventListener('pointercancel', chUp);
  s.addEventListener('pointerleave', e=>{ if (e.pointerType==='mouse' && !CH.drag){ CH.hov=null; chCrossLater(); } });
  s.addEventListener('wheel', chWheel, { passive:false });
  s.addEventListener('dblclick', e=>{ const L=CH.L, p=chPt(e); if (L && p.x>=L.plotW && p.y<L.mainH){ CH.yz=1; CH.yo=0; chNow(); chQueue(); } else chReset(); });
  s.addEventListener('contextmenu', e=>{ if (CH.drag && CH.drag.touch) e.preventDefault(); });
  s.addEventListener('touchmove', e=>{ if ((CH.pinch || (CH.drag && (CH.drag.zone==='hold' || CH.drag.moved))) && e.cancelable) e.preventDefault(); }, { passive:false });
  w.addEventListener('keydown', chKey); w.addEventListener('click', chClick);
  w.addEventListener('blur', ()=>{ if (CH.kb!=null){ CH.kb=null; chCrossLater(); } });
  if (typeof ResizeObserver==='function'){ if (CH.ro) CH.ro.disconnect(); let lw=host.clientWidth; CH.ro=new ResizeObserver(()=>{ const x=host.clientWidth; if (x!==lw){ lw=x; chQueue(); } }); CH.ro.observe(host); }
}
function chPt(e){ const L=CH.L, r=CH.svg.getBoundingClientRect(); return { x:(e.clientX-r.left)*((L ? L.W : r.width)/(r.width||1)), y:(e.clientY-r.top)*((L ? L.H : r.height)/(r.height||1)) }; }
function chDown(e){ const L=CH.L; if (!L) return; chKinStop(); const p=chPt(e);
  if (e.pointerType==='touch'){ CH.ptrs.set(e.pointerId, p);
    if (CH.ptrs.size===2){ clearTimeout(CH.holdT); CH.drag=null; const [p1, p2]=[...CH.ptrs.values()], mx=(p1.x+p2.x)/2; CH.pinch={ d0:Math.max(20, Math.abs(p1.x-p2.x)), n0:CH.view.n || L.n, a:L.A(mx) }; return; }
    if (CH.ptrs.size>2) return; }
  else if (e.button!==0) return;
  if (typeof drBusy==='function' && drBusy()) return;          // a drawing tool owns the pointer
  const zone=p.x>=L.plotW ? (p.y<L.mainH ? 'y' : 'none') : p.y>=L.axTop ? 't' : 'plot'; if (zone==='none') return;
  CH.drag={ id:e.pointerId, zone, x0:p.x, y0:p.y, end0:CH.view.end, n0:CH.view.n || L.n, yz0:CH.yz, yo0:CH.yo, moved:false, touch:e.pointerType==='touch', hist:[{ x:p.x, t:performance.now() }], hadHov:!!CH.hov };
  try{ CH.svg.setPointerCapture(e.pointerId); }catch(z){}
  if (CH.drag.touch && zone==='plot'){ clearTimeout(CH.holdT); CH.holdT=setTimeout(()=>{ const D=CH.drag; if (D && !D.moved && D.zone==='plot'){ D.zone='hold'; CH.hov={ x:D.x0, y:D.y0 }; chCross(); try{ navigator.vibrate && navigator.vibrate(8); }catch(z){} } }, 420); }
}
function chMove(e){ const L=CH.L; if (!L) return; const p=chPt(e);
  if (e.pointerType==='touch' && CH.ptrs.has(e.pointerId)) CH.ptrs.set(e.pointerId, p);
  if (CH.pinch && CH.ptrs.size>=2){ const [p1, p2]=[...CH.ptrs.values()], d=Math.max(20, Math.abs(p1.x-p2.x)), mx=(p1.x+p2.x)/2; chZoomAt(CH.pinch.n0*CH.pinch.d0/d, mx, CH.pinch.a); return; }
  const D=CH.drag;
  if (D && D.id===e.pointerId){ const dx=p.x-D.x0, dy=p.y-D.y0;
    if (!D.moved && (D.zone==='hold' || Math.hypot(dx, dy)>(D.touch ? 7 : 3))){
      // a mostly vertical one-finger swipe on the plot belongs to the page (touch-action: pan-y): let go of it, so the
      // touchmove listener does not cancel the scroll (unless the price scale is manual: then up / down moves the prices)
      if (D.touch && D.zone==='plot' && Math.abs(dy)>Math.abs(dx) && CH.yz===1 && CH.yo===0){ clearTimeout(CH.holdT); CH.drag=null; try{ CH.svg.releasePointerCapture(e.pointerId); }catch(z){} return; }
      D.moved=true; clearTimeout(CH.holdT); if (D.zone==='plot') CH.svg.classList.add('ch-grab'); }
    if (!D.moved) return;
    if (D.zone==='hold'){ CH.hov=p; chCrossLater(); return; }
    if (D.zone==='plot'){ CH.view.end=D.end0+dx/L.cw; if (CH.yz!==1 || CH.yo!==0) CH.yo=D.yo0+dy/L.mainH*CH.yz; D.hist.push({ x:p.x, t:performance.now() }); if (D.hist.length>8) D.hist.shift(); if (!D.touch) CH.hov=p; chNow(); chQueue(); return; }
    if (D.zone==='y'){ CH.yz=Math.max(0.05, Math.min(20, D.yz0*Math.exp(dy/160))); chNow(); chQueue(); return; }
    if (D.zone==='t'){ chZoomAt(D.n0*Math.exp(-dx/140), null, null); return; }
    return; }
  if (!D && e.pointerType!=='touch'){ CH.hov=p; chCrossLater(); }
}
function chUp(e){ const D=CH.drag;
  if (e.pointerType==='touch'){ CH.ptrs.delete(e.pointerId); if (CH.pinch){ if (CH.ptrs.size<2) CH.pinch=null; CH.drag=null; return; } }
  clearTimeout(CH.holdT); CH.svg && CH.svg.classList.remove('ch-grab');
  if (!D || D.id!==e.pointerId) return; CH.drag=null;
  try{ CH.svg.releasePointerCapture(e.pointerId); }catch(z){}
  if (e.type==='pointercancel') return;
  if (D.zone==='plot' && D.moved){ const h=D.hist, t=performance.now(), k=h.findIndex(q=>t-q.t<=100); if (k>=0 && k<h.length-1){ const q0=h[k], q1=h[h.length-1], v=(q1.x-q0.x)/Math.max(1, q1.t-q0.t); if (Math.abs(v)>0.3 && t-q1.t<60) chKinStart(v); } return; }
  if (D.zone==='plot' && !D.moved && D.touch){ const now=Date.now(), p=chPt(e);
    if (D.hadHov){ CH.hov=null; chCross(); }
    if (now-CH.tapT<320 && Math.abs(p.x-CH.tapX)<30){ CH.tapT=0; chReset(); } else { CH.tapT=now; CH.tapX=p.x; } }
}
function chWheel(e){ const L=CH.L; if (!L) return; e.preventDefault(); chKinStop(); const p=chPt(e), k=e.deltaMode===1 ? 16 : e.deltaMode===2 ? 400 : 1, dx=e.deltaX*k, dy=e.deltaY*k;
  if (p.x>=L.plotW && p.y<L.mainH){ CH.yz=Math.max(0.05, Math.min(20, CH.yz*Math.exp(dy*0.002))); chNow(); chQueue(); return; }
  if (e.shiftKey && !e.ctrlKey){ chPanBy((dy || dx)/L.cw); return; }
  if (!e.ctrlKey && Math.abs(dx)>Math.abs(dy)){ chPanBy(-dx/L.cw); return; }
  const cur=CH.view.n || L.n; chZoomAt(cur*Math.exp(dy*(e.ctrlKey ? 0.01 : 0.0015)), p.x, null); }
function chKey(e){ if (e.target!==CH.wrap || e.ctrlKey || e.metaKey || e.altKey) return; const L=CH.L; if (!L) return; const k=e.key, cur=CH.view.n || L.n, step=Math.max(1, Math.round(cur*0.1));
  // Esc on the focused chart clears the crosshair; it never reaches the Trade-screen shortcut that cancels an order
  if (k==='Escape'){ e.preventDefault(); e.stopPropagation(); chEscMark(); if (CH.kb!=null || CH.hov){ CH.kb=null; CH.hov=null; chCross(); } return; }
  let done=true;
  if (e.shiftKey && (k==='ArrowLeft' || k==='ArrowRight')){ const base=CH.kb!=null ? CH.kb : Math.min(L.N-1, L.i1); CH.kb=Math.max(0, Math.min(L.N-1, base+(k==='ArrowLeft' ? -1 : 1)));
    if (L.X(CH.kb)<0) CH.view.end+=1; else if (L.X(CH.kb)>L.plotW) CH.view.end-=1; chNow(); chQueue(); chCross(); }
  else if (k==='ArrowLeft') chPanBy(step); else if (k==='ArrowRight') chPanBy(-step);
  else if (k==='ArrowUp' || k==='+' || k==='=') chZoomAt(cur/1.25, null, null); else if (k==='ArrowDown' || k==='-' || k==='_') chZoomAt(cur*1.25, null, null);
  else if (k==='Home') chReset(); else if (k==='End') chLive();
  else done=false;
  if (done) e.preventDefault(); }
function chClick(e){ const b=e.target.closest && e.target.closest('button'); if (!b || !CH.wrap || !CH.wrap.contains(b)) return; const L=CH.L, C=ST.chart;
  if (b.dataset.chZ){ if (L) chZoomAt((CH.view.n || L.n)*(b.dataset.chZ==='1' ? 1/1.4 : 1.4), null, null); return; }
  if (b.hasAttribute('data-ch-reset')){ chReset(); return; }
  if (b.hasAttribute('data-ch-live')){ chLive(); CH.wrap.focus({ preventScroll:true }); return; }
  if (b.hasAttribute('data-ch-auto')){ CH.yz=1; CH.yo=0; chNow(); chQueue(); return; }
  if (b.hasAttribute('data-ch-legmore')){ CH.legAll=!CH.legAll; chQueue(); setTimeout(()=>{ const x=CH.wrap && CH.wrap.querySelector('[data-ch-legmore]'); if (x) x.focus(); }, 40); return; }
  if (b.hasAttribute('data-ch-legx')){ CH.legMin=!chLM(CH.L && CH.L.narrow); chQueue(); setTimeout(()=>{ const x=CH.wrap && CH.wrap.querySelector('[data-ch-legx]'); if (x) x.focus(); }, 40); return; }
  const ey=b.dataset.chEye, dl=b.dataset.chDel;
  if (ey && C){ const x=C.inds.find(i=>i.k===ey); if (x){ x.hide=!x.hide; if (typeof save==='function') save(); if (typeof render==='function') render(); setTimeout(()=>{ const n=CH.wrap && CH.wrap.querySelector(`[data-ch-eye="${ey}"]`); if (n) n.focus(); }, 60); } return; }
  if (dl && C){ C.inds=C.inds.filter(i=>i.k!==dl); if (typeof save==='function') save(); if (typeof render==='function') render(); CH.wrap.focus({ preventScroll:true }); return; }
}
// the bar countdown ticks every second without a full render
setInterval(()=>{ const L=CH.L, svg=CH.svg; if (!L || !svg || !svg.isConnected || document.hidden) return; const el=svg.querySelector('.ch-cdt'); if (!el){ if (L.tfms===1e3 && typeof render==='function') render(); return; }   // 1s: no countdown, but a new bar every second
  const last=L.raw[L.N-1], ms=last.t+L.tfms-Date.now(), t=chCountdown(ms); if (el.textContent!==t) el.textContent=t; if (ms<=0 && typeof render==='function') render(); }, 1000);
// full-screen mode and window resizes change the height available to the chart
addEventListener('resize', ()=>{ if (CH.L) chQueue(); });

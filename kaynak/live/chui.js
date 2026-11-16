// Phoenix Finance Club: chart toolbar, indicator picker, indicator settings and templates (Piece 4 of the pro chart, prefix CU / cu).
//
// cuToolbar() → HTML for the bar above the chart (#tr-tf's row). Its string only changes when the chart state, the
// language or an open menu changes, so setHTML() leaves it alone on price ticks.
// Every handler is delegated on document through data-ctf / data-ctype / data-cu / data-cu-* attributes.
// Dialogs and menus live in one body-level layer (#cu-layer) that render() never touches: role="dialog" (or "menu"),
// aria-modal, labelled, focus trapped, Esc closes, focus returns to the button that opened it. On phones (≤560px) they
// become bottom sheets. Keydowns inside the layer never reach the Trade-screen shortcuts (term.js / ui.js).
// State: ST.chart (see ds/CHART_SPEC.md) — tf, type, log, inds[{k,id,p,c,hide}], tpl{name:[inds]}, marks. ST.tf is kept
// in sync ('daily' for 1D / 1W, 'intra' otherwise). Fullscreen: html.ch-full + .cu-fullhost on the chart's card.
// Globals: CU, CU_TFS, CU_TYPES, CU_TPL, cuToolbar, cuOpen, cuClose, cuSetTf, cuSetType, cuAddInd, cuRemoveInd,
// cuMoveInd, cuApplyTpl, cuSaveTpl, cuDelTpl, cuFull, cuShot, cuS (ensures ST.chart).

const CU_TFS = [
  { id:'1s', s:['1s','1sn'], n:['1 second (coins only)','1 saniye (sadece kripto)'] },
  { id:'1m', s:['1m','1dk'], n:['1 minute','1 dakika'] },
  { id:'5m', s:['5m','5dk'], n:['5 minutes','5 dakika'] },
  { id:'15m', s:['15m','15dk'], n:['15 minutes','15 dakika'] },
  { id:'1h', s:['1h','1sa'], n:['1 hour','1 saat'] },
  { id:'4h', s:['4h','4sa'], n:['4 hours','4 saat'] },
  { id:'1d', s:['1D','1G'], n:['1 day','1 gün'] },
  { id:'1w', s:['1W','1H'], n:['1 week','1 hafta'] },
];
const CU_TYPES = [
  { id:'candle', n:['Candles','Mumlar'] },
  { id:'hollow', n:['Hollow candles','İçi boş mumlar'] },
  { id:'heikin', n:['Heikin Ashi','Heikin Ashi'] },
  { id:'bar', n:['Bars (OHLC)','Çubuklar (OHLC)'] },
  { id:'line', n:['Line','Çizgi'] },
  { id:'area', n:['Area','Alan'] },
];
// used only if IND_CATS / IND_DEFS[id].cat are missing
const CU_CATS0 = [ { id:'trend', n:['Trend','Trend'] }, { id:'momentum', n:['Momentum','Momentum'] }, { id:'volatility', n:['Volatility','Oynaklık'] }, { id:'volume', n:['Volume','Hacim'] }, { id:'other', n:['Other','Diğer'] } ];
const CU_CATMAP = { sma:'trend', ema:'trend', wma:'trend', hma:'trend', vwma:'trend', dema:'trend', tema:'trend', lsma:'trend', ichimoku:'trend', psar:'trend', supertrend:'trend', adx:'trend', aroon:'trend',
  bb:'volatility', kc:'volatility', dc:'volatility', atr:'volatility', stdev:'volatility', bbw:'volatility',
  rsi:'momentum', macd:'momentum', stoch:'momentum', stochrsi:'momentum', cci:'momentum', willr:'momentum', roc:'momentum', mom:'momentum', ao:'momentum', trix:'momentum',
  vol:'volume', vwap:'volume', obv:'volume', mfi:'volume', cmf:'volume', ad:'volume', pivots:'other', linreg:'other' };
// colours given to a second, third… instance of the same single-line indicator so they can be told apart
const CU_PAL = ['#f5a524', '#2962ff', '#ab47bc', '#26a69a', '#ef5350', '#00acc1', '#8d6e63', '#ec407a', '#43a047', '#ff6d00'];
const CU_TPL = [
  { id:'trend', n:['Trend','Trend'], inds:[ { id:'ema', p:{ n:20 }, c:{ line:'#f5a524' } }, { id:'ema', p:{ n:50 }, c:{ line:'#2962ff' } }, { id:'ema', p:{ n:200 }, c:{ line:'#ab47bc' } }, { id:'vol' } ] },
  { id:'momentum', n:['Momentum','Momentum'], inds:[ { id:'rsi' }, { id:'macd' }, { id:'vol' } ] },
  { id:'volatility', n:['Volatility','Oynaklık'], inds:[ { id:'bb' }, { id:'atr' }, { id:'kc' } ] },
  { id:'ichimoku', n:['Ichimoku','Ichimoku'], inds:[ { id:'ichimoku' }, { id:'vol' } ] },
];

const CU = { open:null, stack:[], q:'', cat:'all', n:0, drag:null, rove:null, live:'' };

/* ---------- icons (inline SVG, currentColor) ---------- */
const cuSvg = (d, vb) => `<svg class="cu-i" viewBox="${vb||'0 0 18 18'}" aria-hidden="true" focusable="false">${d}</svg>`;
const CU_IC = {
  candle: cuSvg('<path d="M5 1.5v3.5M5 12v4.5M13 1.5v2.5M13 11v5"/><rect x="3" y="5" width="4" height="7" rx=".6" class="cu-fill"/><rect x="11" y="4" width="4" height="7" rx=".6"/>'),
  hollow: cuSvg('<path d="M5 1.5v3.5M5 12v4.5M13 1.5v2.5M13 11v5"/><rect x="3" y="5" width="4" height="7" rx=".6"/><rect x="11" y="4" width="4" height="7" rx=".6"/>'),
  heikin: cuSvg('<path d="M5 3v2M5 12v3M13 2v2M13 11v3"/><rect x="3" y="5" width="4" height="7" rx="1.6" class="cu-fill"/><rect x="11" y="4" width="4" height="7" rx="1.6" class="cu-fill"/>'),
  bar: cuSvg('<path d="M5 2v14M2 5h3M5 12h3M13 3v12M10 11h3M13 6h3"/>'),
  line: cuSvg('<path d="M1.5 13.5 6 8.5l3.5 3 7-8.5"/>'),
  area: cuSvg('<path d="M1.5 13.5 6 8.5l3.5 3 7-8.5V16.5h-15z" class="cu-fill cu-soft"/><path d="M1.5 13.5 6 8.5l3.5 3 7-8.5"/>'),
  tpl: cuSvg('<rect x="2" y="2" width="5.5" height="5.5" rx="1"/><rect x="10.5" y="2" width="5.5" height="5.5" rx="1"/><rect x="2" y="10.5" width="5.5" height="5.5" rx="1"/><path d="M13.25 10.5v5.5M10.5 13.25H16"/>'),
  draw: cuSvg('<path d="M3 15l1-4 8.2-8.2a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 14z"/><path d="M10.5 4.5l3 3"/>'),
  marks: cuSvg('<path d="M5 3 8.5 8h-7z" class="cu-fill"/><path d="M13 15 9.5 10h7z" class="cu-fill"/>'),
  shot: cuSvg('<rect x="1.5" y="4.5" width="15" height="11" rx="2"/><circle cx="9" cy="10" r="3"/><path d="M6 4.5 7.4 2.5h3.2L12 4.5"/>'),
  full: cuSvg('<path d="M2 6.5V2h4.5M11.5 2H16v4.5M16 11.5V16h-4.5M6.5 16H2v-4.5"/>'),
  unfull: cuSvg('<path d="M6.5 2v4.5H2M16 6.5h-4.5V2M11.5 16v-4.5H16M2 11.5h4.5V16"/>'),
  caret: cuSvg('<path d="M2.5 4 5 6.5 7.5 4"/>', '0 0 10 10'),
  x: cuSvg('<path d="M4 4l10 10M14 4 4 14"/>'),
  up: cuSvg('<path d="M9 14.5V3.5M4.5 8 9 3.5 13.5 8"/>'),
  dn: cuSvg('<path d="M9 3.5v11M4.5 10 9 14.5 13.5 10"/>'),
  eye: cuSvg('<path d="M1.5 9S4.2 3.8 9 3.8 16.5 9 16.5 9 13.8 14.2 9 14.2 1.5 9 1.5 9z"/><circle cx="9" cy="9" r="2.4"/>'),
  eyeoff: cuSvg('<path d="M1.5 9S4.2 3.8 9 3.8 16.5 9 16.5 9 13.8 14.2 9 14.2 1.5 9 1.5 9z"/><path d="M2.5 15.5l13-13"/>'),
  gear: cuSvg('<circle cx="9" cy="9" r="2.5"/><path d="M9 1.5v2.3M9 14.2v2.3M1.5 9h2.3M14.2 9h2.3M3.7 3.7l1.6 1.6M12.7 12.7l1.6 1.6M3.7 14.3l1.6-1.6M12.7 5.3l1.6-1.6"/>'),
  grip: cuSvg('<circle cx="6.5" cy="4" r="1.2" class="cu-fill"/><circle cx="11.5" cy="4" r="1.2" class="cu-fill"/><circle cx="6.5" cy="9" r="1.2" class="cu-fill"/><circle cx="11.5" cy="9" r="1.2" class="cu-fill"/><circle cx="6.5" cy="14" r="1.2" class="cu-fill"/><circle cx="11.5" cy="14" r="1.2" class="cu-fill"/>'),
  search: cuSvg('<circle cx="7.5" cy="7.5" r="5"/><path d="M11.3 11.3 16 16"/>'),
  plus: cuSvg('<path d="M9 3.5v11M3.5 9h11"/>'),
  back: cuSvg('<path d="M11 3.5 5.5 9l5.5 5.5"/>'),
  check: cuSvg('<path d="M3.5 9.5 7.2 13 14.5 5"/>'),
  trash: cuSvg('<path d="M2.5 4.5h13M7 4.5V2.8h4v1.7M4 4.5l.8 11h8.4l.8-11"/>'),
};

/* ---------- state helpers ---------- */
function cuS(){
  if (typeof chInit==='function'){ try { chInit(); } catch (e){} }
  let c=ST.chart; if (!c || typeof c!=='object') c=ST.chart={};
  if (!CU_TFS.some(x=>x.id===c.tf)) c.tf= ST.tf==='daily' ? '1d' : '1m';
  if (!CU_TYPES.some(x=>x.id===c.type)) c.type='candle';
  if (typeof c.log!=='boolean') c.log=!!c.log;
  if (c.marks==null) c.marks=true;
  if (!Array.isArray(c.inds)) c.inds=[];
  if (!c.tpl || typeof c.tpl!=='object' || Array.isArray(c.tpl)) c.tpl={};
  if (!c.draw || typeof c.draw!=='object') c.draw={};
  return c;
}
const cuL = a => Array.isArray(a) ? L2(a[0], a[1]) : String(a==null ? '' : a);
const cuDefs = () => (typeof IND_DEFS==='object' && IND_DEFS) ? IND_DEFS : {};
const cuCats = () => (typeof IND_CATS!=='undefined' && Array.isArray(IND_CATS) && IND_CATS.length) ? IND_CATS : CU_CATS0;
function cuCat(id){ const d=cuDefs()[id], c=d && d.cat; return cuCats().some(x=>x.id===c) ? c : (CU_CATMAP[id] || 'other'); }
function cuIds(){ const D=cuDefs(); return Object.keys(D).filter(id=>D[id] && typeof D[id]==='object' && typeof D[id].f==='function' && D[id].out); }
function cuP0(id){ if (typeof indDefaults==='function') return indDefaults(id); const d=cuDefs()[id], q={}; if (d && d.p) for (const k in d.p) q[k]=d.p[k].v; return q; }
// default colours stored on a new indicator; up / down outputs (dir ±1) are left out so they follow the theme (colour-blind mode)
function cuC0(id){ const d=cuDefs()[id], q={}; if (d && d.out) for (const k in d.out) if (!d.out[k].dir) q[k]=d.out[k].c; return q; }
function cuLabel(ind){ if (!ind) return ''; if (typeof indLabel==='function'){ try { const s=indLabel(ind, ST.lang); if (s) return s; } catch (e){} } const d=cuDefs()[ind.id]; return d ? (d.sn || cuL(d.n)) : String(ind.id||''); }
const cuSn = (id, d) => (typeof indShort==='function' && indShort(id, ST.lang)) || (d && d.sn) || id;
// colour of an output as the chart draws it (up / down outputs follow the theme's --gain / --loss unless the user picked one)
const cuIc = (x, d, o) => cuHex(typeof chCol==='function' ? chCol(x, d, o) : (x.c && x.c[o]) || d.out[o].c, d.out[o].c);
function cuName(id){ const d=cuDefs()[id]; return d ? cuL(d.n) : String(id||''); }
function cuPaneTxt(id){ const d=cuDefs()[id]; return d && d.pane==='sub' ? L2('Own pane','Ayrı panel') : L2('On price','Fiyat üstü'); }
function cuFind(k){ return cuS().inds.find(x=>x && x.k===k) || null; }
function cuHex(c, dflt){ c=String(c||'').trim(); if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase(); const m=/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c); if (m) return ('#'+m[1]+m[1]+m[2]+m[2]+m[3]+m[3]).toLowerCase(); if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7).toLowerCase(); return dflt ? cuHex(dflt) : '#888888'; }
const cuNorm = s => String(s||'').replace(/İ/g, 'i').toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const cuTfName = id => { const t=CU_TFS.find(x=>x.id===id); return t ? cuL(t.s) : id; };

function cuKey(){ let n=CU.n; for (const x of cuS().inds){ const m=/^i(\d+)$/.exec(x && x.k || ''); if (m) n=Math.max(n, +m[1]); } CU.n=n+1; return 'i'+CU.n; }
function cuNewInd(id, p, c, hide){
  const d=cuDefs()[id]; if (!d) return null;
  const P=Object.assign(cuP0(id), p && typeof p==='object' ? JSON.parse(JSON.stringify(p)) : {}), C=Object.assign(cuC0(id), c && typeof c==='object' ? JSON.parse(JSON.stringify(c)) : {});
  return { k:cuKey(), id, p:P, c:C, hide:!!hide };
}

/* ---------- actions ---------- */
function cuCommit(sel){ save(); render(); cuRefocus(sel); }
// the toolbar is rebuilt on the next render() frame when its state changes: put the focus back on the same control
function cuRefocus(sel){ if (!sel) return; requestAnimationFrame(()=>requestAnimationFrame(()=>{ const a=document.activeElement; if (a && a!==document.body && a.isConnected) return; const el=document.querySelector(sel); if (el) try { el.focus({ preventScroll:true }); } catch (e){} })); }
function cuSetTf(tf){
  if (!CU_TFS.some(x=>x.id===tf)) return; const S=cuS();
  S.tf=tf; ST.tf=['1d','1w'].includes(tf) ? 'daily' : 'intra';
  if (typeof CH==='object' && CH && CH.view && typeof CH.view==='object') CH.view.end=0;
  cuCommit(`[data-ctf="${tf}"]`);
}
function cuSetType(t){ if (!CU_TYPES.some(x=>x.id===t)) return; cuS().type=t; save(); render(); }
function cuAddInd(id, quiet){
  const S=cuS(), d=cuDefs()[id]; if (!d) return null;
  const ind=cuNewInd(id); if (!ind) return null;
  // a second EMA (etc.) gets its own colour
  const same=S.inds.filter(x=>x.id===id), outs=Object.keys(d.out||{});
  if (same.length && outs.length===1){ const used=new Set(same.map(x=>cuIc(x, d, outs[0]))); const pick=CU_PAL.find(c=>!used.has(c)); if (pick) ind.c[outs[0]]=pick; }
  S.inds.push(ind); save(); render();
  if (!quiet) cuSay(L2(`${cuLabel(ind)} added to the chart`, `${cuLabel(ind)} grafiğe eklendi`));
  return ind;
}
function cuRemoveInd(k){ const S=cuS(), i=S.inds.findIndex(x=>x && x.k===k); if (i<0) return; const lb=cuLabel(S.inds[i]); S.inds.splice(i, 1); save(); render(); cuSay(L2(`${lb} removed`, `${lb} kaldırıldı`)); }
function cuMoveInd(k, to){ const S=cuS(), i=S.inds.findIndex(x=>x && x.k===k); if (i<0) return false; to=Math.max(0, Math.min(S.inds.length-1, to)); if (to===i) return false; const [x]=S.inds.splice(i, 1); S.inds.splice(to, 0, x); save(); render(); return true; }
function cuToggleInd(k){ const x=cuFind(k); if (!x) return; x.hide=!x.hide; save(); render(); cuSay(x.hide ? L2(`${cuLabel(x)} hidden`, `${cuLabel(x)} gizlendi`) : L2(`${cuLabel(x)} shown`, `${cuLabel(x)} gösteriliyor`)); }
function cuTplInds(t){ return (Array.isArray(t) ? t : []).filter(x=>x && cuDefs()[x.id]); }
function cuApplyTpl(ref){
  // ref: 'b:<builtin id>' or 'u:<index into Object.keys(ST.chart.tpl)>'
  const S=cuS(); let list=null, name='';
  if (/^b:/.test(ref)){ const t=CU_TPL.find(x=>'b:'+x.id===ref); if (t){ list=t.inds; name=cuL(t.n); } }
  else if (/^u:\d+$/.test(ref)){ const nm=Object.keys(S.tpl)[+ref.slice(2)]; if (nm!=null){ list=S.tpl[nm]; name=nm; } }
  if (!list) return false;
  const inds=cuTplInds(list).map(x=>cuNewInd(x.id, x.p, x.c, x.hide)).filter(Boolean);
  S.inds=inds; save(); render();
  toast(L2(`Template applied: ${name}`, `Şablon uygulandı: ${name}`));
  return true;
}
function cuSaveTpl(name){
  const S=cuS(); name=String(name||'').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return L2('Give the template a name.', 'Şablona bir ad verin.');
  if (name==='__proto__' || name==='constructor' || name==='prototype') return L2('That name is reserved: choose another one.', 'Bu ad ayrılmış: başka bir ad seçin.');
  if (!S.inds.length) return L2('Add some indicators to the chart first.', 'Önce grafiğe gösterge ekleyin.');
  const had=Object.prototype.hasOwnProperty.call(S.tpl, name);
  S.tpl[name]=S.inds.map(x=>({ id:x.id, p:JSON.parse(JSON.stringify(x.p||{})), c:JSON.parse(JSON.stringify(x.c||{})), hide:!!x.hide }));
  save(); toast(had ? L2(`Template updated: ${name}`, `Şablon güncellendi: ${name}`) : L2(`Template saved: ${name}`, `Şablon kaydedildi: ${name}`));
  return '';
}
function cuDelTpl(i){ const S=cuS(), nm=Object.keys(S.tpl)[i]; if (nm==null) return; delete S.tpl[nm]; save(); toast(L2(`Template deleted: ${nm}`, `Şablon silindi: ${nm}`)); }

/* ---------- fullscreen ---------- */
function cuFull(on){
  const h=document.documentElement; on = on==null ? !h.classList.contains('ch-full') : !!on;
  for (const e of document.querySelectorAll('.cu-fullhost')) e.classList.remove('cu-fullhost');
  h.classList.toggle('ch-full', on);
  if (on){ const host=document.getElementById('tr-chart'), card=host && (host.closest('.pn') || host.parentElement); if (card) card.classList.add('cu-fullhost'); }
  render(); cuRefocus('[data-cu="full"]');
  setTimeout(()=>{ try { dispatchEvent(new Event('resize')); } catch (e){} }, 30);
}
addEventListener('hashchange', ()=>{ if (document.documentElement.classList.contains('ch-full')) cuFull(false); });

/* ---------- screenshot: the chart svg with computed styles inlined → canvas at 2× → PNG download ---------- */
const CU_SHOT_PROPS = ['stop-color', 'stop-opacity', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'visibility', 'display', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'paint-order', 'shape-rendering', 'vector-effect'];
function cuInline(src, dst){
  const a=[src, ...src.querySelectorAll('*')], b=[dst, ...dst.querySelectorAll('*')];
  for (let i=0;i<a.length && i<b.length;i++){
    const cs=getComputedStyle(a[i]); let st='';
    for (const p of CU_SHOT_PROPS){ const v=cs.getPropertyValue(p); if (!v || /url\(/.test(v)) continue; st+=`${p}:${v};`; }
    // keep the element's own inline style first (url() fills / clip paths survive), computed values override the rest
    const own=b[i].getAttribute('style'); if (st) b[i].setAttribute('style', (own ? own.replace(/;?\s*$/, ';') : '') + st);
  }
}
function cuBg(el){ for (let e=el; e && e.nodeType===1; e=e.parentElement){ const c=getComputedStyle(e).backgroundColor; if (c && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(c)) return c; } return getComputedStyle(document.documentElement).getPropertyValue('--surface-1').trim() || '#14171c'; }
function cuShot(){
  const svg=document.querySelector('#tr-chart svg.chart');
  if (!svg){ toast(L2('There is no chart to save yet.', 'Kaydedilecek bir grafik henüz yok.')); return Promise.resolve(false); }
  const r=svg.getBoundingClientRect(), W=Math.max(1, Math.round(r.width)), H=Math.max(1, Math.round(r.height));
  const S=cuS(), root=getComputedStyle(document.documentElement), ink=root.getPropertyValue('--ink').trim() || '#f5f7fa', ink3=root.getPropertyValue('--ink-3').trim() || '#959dab', bg=cuBg(document.getElementById('tr-chart')), font=getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const clone=svg.cloneNode(true); cuInline(svg, clone);
  for (const e of clone.querySelectorAll('.ch-noshot,[data-noshot]')) e.remove();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const xml=new XMLSerializer().serializeToString(clone), url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
  const inds=S.inds.filter(x=>!x.hide).map(cuLabel).filter(Boolean), head=inds.length ? 50 : 32, foot=20, K=2;
  const sym=String(ST.sel||''), q=typeof quote==='function' ? (()=>{ try { return quote(sym); } catch (e){ return null; } })() : null;
  const ty=CU_TYPES.find(x=>x.id===S.type) || CU_TYPES[0], d=new Date(), p2=n=>String(n).padStart(2, '0');
  const stamp=`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      try {
        const cv=document.createElement('canvas'); cv.width=W*K; cv.height=(H+head+foot)*K;
        const g=cv.getContext('2d'); g.scale(K, K); g.fillStyle=bg; g.fillRect(0, 0, W, H+head+foot);
        g.textBaseline='middle'; g.fillStyle=ink; g.font=`700 14px ${font}`;
        const t1=`${sym} · ${cuTfName(S.tf)} · ${cuL(ty.n)}${S.log ? ' · log' : ''}`; g.fillText(t1, 10, 16);
        if (q && typeof q.last==='number' && isFinite(q.last)){ const w=g.measureText(t1).width; g.font=`600 13px ${font}`; g.fillText('  '+(typeof fpx==='function' ? fpx(q.last) : q.last), 10+w, 16); }
        g.textAlign='right'; g.font=`600 12px ${font}`; g.fillStyle=ink3; g.fillText(stamp, W-10, 16); g.textAlign='left';
        if (inds.length){ g.font=`500 12px ${font}`; let s=inds.join(' · '); while (s.length>4 && g.measureText(s).width>W-20) s=s.slice(0, -2); if (s.length<inds.join(' · ').length) s=s.replace(/.$/, '…'); g.fillText(s, 10, 38); }
        g.drawImage(img, 0, head, W, H);
        g.font=`500 11px ${font}`; g.fillStyle=ink3; g.textAlign='right'; g.fillText(L2('Phoenix Finance Club · paper trading', 'Phoenix Finance Club · sanal işlem'), W-10, head+H+foot/2);
        const name=`tidewater-${sym.replace(/[^\w.-]+/g, '') || 'chart'}-${S.tf}-${stamp.replace(/[-: ]/g, '').replace(/^(\d{8})/, '$1-')}.png`;
        const done=blob=>{ const a=document.createElement('a'); a.download=name; a.href=blob ? URL.createObjectURL(blob) : cv.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove(); if (blob) setTimeout(()=>URL.revokeObjectURL(a.href), 4000); CU.lastShot={ name, w:cv.width, h:cv.height }; toast(L2('Chart saved as a PNG image', 'Grafik PNG resmi olarak kaydedildi')); res(true); };
        if (cv.toBlob) cv.toBlob(done, 'image/png'); else done(null);
      } catch (e){ console.error(e); toast(L2('Could not save the chart image.', 'Grafik resmi kaydedilemedi.')); res(false); }
    };
    img.onerror=()=>{ toast(L2('Could not save the chart image.', 'Grafik resmi kaydedilemedi.')); res(false); };
    img.src=url;
  });
}

/* ---------- toolbar ---------- */
function cuToolbar(){
  const S=cuS(), full=document.documentElement.classList.contains('ch-full'), ty=CU_TYPES.find(x=>x.id===S.type) || CU_TYPES[0], nI=S.inds.length, op=CU.open && CU.open.kind;
  const coin=(()=>{ try{ return typeof liveDef==='function' && !!liveDef(ST.sel); }catch(e){ return true; } })();
  const tfs=CU_TFS.map(t=>`<button type="button" class="cu-b cu-tf" data-ctf="${t.id}" aria-pressed="${S.tf===t.id}"${t.id==='1s' && !coin ? ' disabled' : ''} title="${esc(t.id==='1s' && !coin ? cuL(['1-second candles exist for coins only; this stock shows 1-minute candles','1 saniyelik mum sadece kriptoda var; bu hisse 1 dakikalık mum gösterir']) : cuL(t.n))}">${esc(cuL(t.s))}<span class="sr"> (${esc(cuL(t.n))})</span></button>`).join('');
  const dr=typeof drOpen==='function', drOn=dr && typeof DR==='object' && DR && typeof DR.open==='boolean' ? DR.open : null;
  return `<div class="cu-wrap"><div class="cu-bar" role="toolbar" aria-label="${esc(L2('Chart tools', 'Grafik araçları'))}">`
    + `<div class="cu-g cu-tfs" role="group" aria-label="${esc(L2('Timeframe', 'Zaman aralığı'))}">${tfs}</div>`
    + `<div class="cu-g">`
    + `<button type="button" class="cu-b cu-dd" data-cu="type" aria-haspopup="menu" aria-expanded="${op==='type'}" aria-label="${esc(L2('Chart type', 'Grafik türü'))}: ${esc(cuL(ty.n))}" title="${esc(L2('Chart type', 'Grafik türü'))}">${CU_IC[ty.id]}<span class="cu-l">${esc(cuL(ty.n))}</span>${CU_IC.caret}</button>`
    + `<button type="button" class="cu-b" data-cu="ind" aria-haspopup="dialog" aria-label="${esc(L2('Indicators', 'Göstergeler'))}${nI ? ' ('+esc(L2(`${nI} on the chart`, `grafikte ${nI}`))+')' : ''}" title="${esc(L2('Indicators', 'Göstergeler'))}"><span class="cu-fx" aria-hidden="true">ƒx</span><span class="cu-l cu-lk">${esc(L2('Indicators', 'Göstergeler'))}</span>${nI ? `<span class="cu-n" aria-hidden="true">${nI}</span>` : ''}</button>`
    + `<button type="button" class="cu-b" data-cu="tpl" aria-haspopup="dialog" aria-label="${esc(L2('Indicator templates', 'Gösterge şablonları'))}" title="${esc(L2('Indicator templates', 'Gösterge şablonları'))}">${CU_IC.tpl}<span class="cu-l">${esc(L2('Templates', 'Şablonlar'))}</span></button>`
    + `<button type="button" class="cu-b" data-cu="draw" ${dr ? '' : 'disabled'} ${drOn==null ? '' : `aria-pressed="${drOn}"`} aria-label="${esc(L2('Drawing tools', 'Çizim araçları'))}" title="${esc(L2('Drawing tools', 'Çizim araçları'))}">${CU_IC.draw}<span class="cu-l">${esc(L2('Draw', 'Çiz'))}</span></button>`
    + `</div><div class="cu-g">`
    + `<button type="button" class="cu-b cu-tx" data-cu="log" aria-pressed="${!!S.log}" aria-label="${esc(L2('Log scale', 'Logaritmik ölçek'))}" title="${esc(L2('Logarithmic price scale', 'Logaritmik fiyat ölçeği'))}">Log</button>`
    + `<button type="button" class="cu-b" data-cu="marks" aria-pressed="${!!S.marks}" aria-label="${esc(L2('My trades on the chart', 'İşlemlerim grafikte'))}" title="${esc(L2('Show my buys and sells on the chart', 'Alış ve satışlarımı grafikte göster'))}">${CU_IC.marks}<span class="cu-l">${esc(L2('My trades', 'İşlemlerim'))}</span></button>`
    + `</div><div class="cu-g cu-end">`
    + `<button type="button" class="cu-b" data-cu="shot" aria-label="${esc(L2('Save the chart as a PNG image', 'Grafiği PNG resmi olarak kaydet'))}" title="${esc(L2('Save the chart as a PNG image', 'Grafiği PNG resmi olarak kaydet'))}">${CU_IC.shot}</button>`
    + `<button type="button" class="cu-b" data-cu="full" aria-pressed="${full}" aria-label="${esc(L2('Full screen chart', 'Tam ekran grafik'))}" title="${esc(full ? L2('Leave full screen (Esc)', 'Tam ekrandan çık (Esc)') : L2('Full screen chart', 'Tam ekran grafik'))}">${full ? CU_IC.unfull : CU_IC.full}</button>`
    + `</div></div></div>`;
}

/* ---------- layer: dialogs and menus ---------- */
function cuLayer(){
  let el=document.getElementById('cu-layer');
  if (!el){
    el=document.createElement('div'); el.id='cu-layer'; el.hidden=true; document.body.appendChild(el);
    el.addEventListener('keydown', e=>{ e.stopPropagation(); cuKeyDlg(e); });
  }
  return el;
}
const cuPanel = () => { const el=document.getElementById('cu-layer'); return el && !el.hidden ? el.querySelector('.cu-pnl') : null; };
function cuFocusables(root){ return root ? [...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(e=>!e.disabled && e.tabIndex>=0 && !e.hidden && e.getClientRects().length) : []; }
function cuSelOf(el){ if (!el || !el.getAttribute) return null; for (const a of ['data-cu', 'data-cu-ind', 'data-ctf', 'data-cu-set']){ const v=el.getAttribute(a); if (v!=null) return `[${a}="${v}"]`; } return el.id ? '#'+el.id : null; }
function cuSay(msg){ CU.live=msg; const el=document.getElementById('cu-live'); if (el){ el.textContent=''; setTimeout(()=>{ el.textContent=msg; }, 30); } }

function cuOpen(kind, o){
  o=o||{}; if (kind==='set' && !cuFind(o.k)) return;
  const cur=CU.open, from=o.from || document.activeElement;
  if (cur && cur.kind==='ind' && kind==='set'){ CU.stack.push(cur); }
  else if (cur){ CU.stack=[]; cuHide(); }
  const nested=CU.stack.length>0;
  CU.open={ kind, k:o.k, opener: nested ? null : (from && from!==document.body ? from : null), osel: nested ? null : cuSelOf(from) };
  if (kind==='ind' && o.cat) CU.cat=o.cat;
  cuPaint();
  if (kind==='type'){ const b=document.querySelector('[data-cu="type"]'); if (b) b.setAttribute('aria-expanded', 'true'); }
}
function cuHide(){ const el=document.getElementById('cu-layer'); if (el){ el.hidden=true; el.innerHTML=''; } document.documentElement.classList.remove('cu-lock'); const b=document.querySelector('[data-cu="type"]'); if (b) b.setAttribute('aria-expanded', 'false'); }
function cuClose(){
  const cur=CU.open; if (!cur) return;
  if (CU.stack.length){ const prev=CU.stack.pop(); CU.open=prev; cuPaint(); if (cur.k){ const g=document.querySelector(`#cu-layer [data-cu-set="${cur.k}"]`); if (g) g.focus(); } return; }
  CU.open=null; cuHide();
  if (cur.kind==='type') render();     // the toolbar string carries aria-expanded
  const el=cur.opener && cur.opener.isConnected ? cur.opener : (cur.osel ? document.querySelector(cur.osel) : null);
  if (el) try { el.focus({ preventScroll:true }); } catch (e){}
  // the toolbar may be rebuilt on the next frame: put the focus back on the new button then
  if (cur.osel) cuRefocus(cur.osel);
}

function cuPaint(){
  const L=cuLayer(), o=CU.open; if (!o) return;
  const k=o.kind; let h='';
  if (k==='type') h=cuTypeHTML(); else if (k==='ind') h=cuPickHTML(); else if (k==='set') h=cuSetHTML(); else if (k==='tpl') h=cuTplHTML();
  L.className='cu-k-'+k; L.innerHTML=`<div class="cu-scrim" data-cu-scrim></div>${h}`; L.hidden=false;
  if (k!=='type') document.documentElement.classList.add('cu-lock'); else document.documentElement.classList.remove('cu-lock');
  if (k==='type') cuPlaceMenu();
  const p=cuPanel(); let f=null;
  if (k==='type') f=p.querySelector('[aria-checked="true"]') || p.querySelector('[role="menuitemradio"]');
  else if (k==='ind') f=p.querySelector('#cu-q');
  else if (k==='set') f=p.querySelector('[data-cu-p],[data-cu-c]');
  else if (k==='tpl') f=p.querySelector('[data-cu-tpl-apply]');
  (f || cuFocusables(p)[0] || p).focus();
}
function cuPlaceMenu(){
  const p=cuPanel(), b=document.querySelector('[data-cu="type"]'); if (!p) return;
  if (innerWidth<=560 || !b){ p.style.left=''; p.style.top=''; return; }
  const r=b.getBoundingClientRect(), w=p.offsetWidth || 220, hh=p.offsetHeight || 260;
  let x=Math.max(8, Math.min(r.left, innerWidth-w-8)), y=r.bottom+4; if (y+hh>innerHeight-8) y=Math.max(8, r.top-hh-4);
  p.style.left=x+'px'; p.style.top=y+'px';
}
const cuHd = (id, title, back) => `<div class="cu-hd">${back ? `<button type="button" class="cu-ib" data-cu-back aria-label="${esc(L2('Back to indicators', 'Göstergelere dön'))}">${CU_IC.back}</button>` : ''}<h2 id="${id}">${esc(title)}</h2><button type="button" class="cu-ib cu-x" data-cu-x aria-label="${esc(L2('Close', 'Kapat'))}">${CU_IC.x}</button></div>`;

// chart type menu
function cuTypeHTML(){
  const S=cuS();
  return `<div class="cu-pnl cu-menu" role="menu" tabindex="-1" aria-label="${esc(L2('Chart type', 'Grafik türü'))}">`
    + CU_TYPES.map(t=>`<button type="button" role="menuitemradio" tabindex="-1" aria-checked="${S.type===t.id}" data-ctype="${t.id}">${CU_IC[t.id]}<span>${esc(cuL(t.n))}</span>${S.type===t.id ? CU_IC.check : ''}</button>`).join('')
    + `</div>`;
}

// indicator picker
function cuPickHTML(){
  return `<div class="cu-pnl cu-dlg cu-pick" role="dialog" aria-modal="true" aria-labelledby="cu-pick-h" tabindex="-1">`
    + cuHd('cu-pick-h', L2('Indicators', 'Göstergeler'))
    + `<div class="cu-search">${CU_IC.search}<label class="sr" for="cu-q">${esc(L2('Search indicators', 'Gösterge ara'))}</label><input id="cu-q" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(L2('Search: RSI, MACD, Bollinger…', 'Ara: RSI, MACD, Bollinger…'))}" value="${esc(CU.q)}" aria-controls="cu-list"></div>`
    + `<div class="cu-body"><div class="cu-cats" role="group" aria-label="${esc(L2('Categories', 'Kategoriler'))}" id="cu-cats">${cuCatsHTML()}</div><div class="cu-list" id="cu-list">${cuListHTML()}</div></div>`
    + `<p class="sr" id="cu-live" aria-live="polite"></p></div>`;
}
function cuMatch(id){ const q=cuNorm(CU.q).trim(); if (!q) return true; const d=cuDefs()[id]; const hay=cuNorm([id, d.sn, d.snTr||'', ...(d.n||[]), ...(d.d||[])].join(' ')); return q.split(/\s+/).every(w=>hay.includes(w)); }
function cuCatsHTML(){
  const S=cuS(), ids=cuIds(), q=CU.q.trim(), cnt=c=>ids.filter(id=>(c==='all' || cuCat(id)===c) && cuMatch(id)).length;
  const btn=(id, name, n)=>`<button type="button" class="cu-cat" data-cu-cat="${id}" aria-pressed="${CU.cat===id}"><span>${esc(name)}</span><span class="cu-c">${n}</span></button>`;
  return btn('on', L2('On the chart', 'Grafikte'), S.inds.length) + btn('all', q ? L2('All results', 'Tüm sonuçlar') : L2('All', 'Tümü'), cnt('all')) + cuCats().map(c=>btn(c.id, cuL(c.n), cnt(c.id))).join('');
}
function cuListHTML(){
  const S=cuS();
  if (CU.cat==='on') return cuActiveHTML();
  const ids=cuIds().filter(cuMatch), cnt={}; for (const x of S.inds) cnt[x.id]=(cnt[x.id]||0)+1;
  const cats=CU.cat==='all' ? cuCats() : cuCats().filter(c=>c.id===CU.cat);
  let first=true, h='';
  const row=id=>{ const d=cuDefs()[id], n=cnt[id]||0, ti=(CU.rove ? CU.rove===id : first) ? 0 : -1; first=false;
    return `<li><button type="button" class="cu-add" data-cu-add="${esc(id)}" tabindex="${ti}" aria-label="${esc(L2('Add', 'Ekle'))} ${esc(cuSn(id, d))} – ${esc(cuL(d.n))}${n ? ' ('+esc(L2(`${n} on the chart`, `grafikte: ${n}`))+')' : ''}" aria-describedby="cu-d-${esc(id)}">`
      + `<span class="cu-r1"><b>${esc(cuSn(id, d))}</b><span class="cu-nm">${esc(cuL(d.n))}</span></span>`
      + `<span class="cu-d" id="cu-d-${esc(id)}">${esc(cuL(d.d||''))}</span>`
      + `<span class="cu-meta"><span class="cu-pn">${esc(cuPaneTxt(id))}</span>${n ? `<span class="cu-on">${esc(L2(`${n} on chart`, `grafikte: ${n}`))}</span>` : ''}</span>`
      + `<span class="cu-plus" aria-hidden="true">${CU_IC.plus}</span></button></li>`; };
  for (const c of cats){
    const xs=ids.filter(id=>cuCat(id)===c.id); if (!xs.length) continue;
    h+=`<h3 class="cu-gh">${esc(cuL(c.n))}</h3><ul class="cu-ul">${xs.map(row).join('')}</ul>`;
  }
  if (CU.rove && !ids.includes(CU.rove)){ CU.rove=null; return cuListHTML(); }
  return h || `<p class="cu-empty">${esc(L2('No indicator matches that search.', 'Bu aramaya uyan gösterge yok.'))}</p>`;
}
function cuActiveHTML(){
  const S=cuS(), n=S.inds.length;
  if (!n) return `<p class="cu-empty">${esc(L2('No indicators on the chart yet. Pick one from “All” or apply a template.', 'Grafikte henüz gösterge yok. “Tümü” listesinden birini seçin ya da bir şablon uygulayın.'))}</p><p class="cu-empty"><button type="button" class="cu-btn" data-cu-cat="all">${esc(L2('Browse all indicators', 'Tüm göstergelere göz at'))}</button></p>`;
  const rows=S.inds.map((x, i)=>{
    const d=cuDefs()[x.id], lb=cuLabel(x), outs=d ? Object.keys(d.out||{}).slice(0, 4) : [];
    const sw=outs.map(o=>`<i style="background:${cuIc(x, d, o)}"></i>`).join('');
    const ib=(attr, ico, label, dis, extra)=>`<button type="button" class="cu-ib" ${attr}="${esc(x.k)}" aria-label="${esc(label)}" title="${esc(label)}" ${dis ? 'aria-disabled="true"' : ''} ${extra||''}>${ico}</button>`;
    return `<li class="cu-ai${x.hide ? ' is-off' : ''}" draggable="true" data-cu-k="${esc(x.k)}">`
      + `<span class="cu-grip" aria-hidden="true" title="${esc(L2('Drag to reorder', 'Sıralamak için sürükleyin'))}">${CU_IC.grip}</span>`
      + `<span class="cu-sw" aria-hidden="true">${sw}</span>`
      + `<span class="cu-lbl"><b>${esc(lb)}</b><span>${esc(d ? cuL(d.n) : x.id)} · ${esc(cuPaneTxt(x.id))}</span></span>`
      + `<span class="cu-acts">`
      + ib('data-cu-up', CU_IC.up, L2(`Move ${lb} up`, `${lb} yukarı taşı`), i===0)
      + ib('data-cu-dn', CU_IC.dn, L2(`Move ${lb} down`, `${lb} aşağı taşı`), i===n-1)
      + ib('data-cu-eye', x.hide ? CU_IC.eyeoff : CU_IC.eye, L2(`Show ${lb}`, `${lb} göster`), false, `aria-pressed="${!x.hide}"`)
      + ib('data-cu-set', CU_IC.gear, L2(`Settings for ${lb}`, `${lb} ayarları`))
      + ib('data-cu-rm', CU_IC.x, L2(`Remove ${lb}`, `${lb} kaldır`))
      + `</span></li>`;
  }).join('');
  return `<h3 class="cu-gh">${esc(L2('On the chart, top to bottom', 'Grafikte, yukarıdan aşağıya'))}</h3><ol class="cu-act">${rows}</ol>`
    + `<p class="cu-hint2">${esc(L2('Drag rows or use the arrows to change the order (Alt+↑/↓ on a row).', 'Sırayı değiştirmek için satırları sürükleyin ya da okları kullanın (satırda Alt+↑/↓).'))}</p>`
    + `<div class="cu-ft"><button type="button" class="cu-btn" data-cu-tplopen>${CU_IC.tpl}<span>${esc(L2('Save as template…', 'Şablon olarak kaydet…'))}</span></button><button type="button" class="cu-btn cu-danger" data-cu-clear>${CU_IC.trash}<span>${esc(L2('Remove all', 'Tümünü kaldır'))}</span></button></div>`;
}
// rebuild the categories and the list, keeping the focus on the same control (or its neighbour)
function cuPickRefresh(){
  const p=cuPanel(); if (!p || !CU.open || CU.open.kind!=='ind') return;
  const a=document.activeElement, sel=a && p.contains(a) && a.id!=='cu-q' ? (()=>{ for (const at of ['data-cu-add', 'data-cu-cat', 'data-cu-up', 'data-cu-dn', 'data-cu-eye', 'data-cu-set', 'data-cu-rm']){ const v=a.getAttribute(at); if (v!=null) return { at, v }; } return null; })() : null;
  const li=a && a.closest ? a.closest('.cu-ai') : null, idx=li ? [...li.parentNode.children].indexOf(li) : -1;
  const lst=p.querySelector('#cu-list'), top=lst ? lst.scrollTop : 0;
  setHTML(p.querySelector('#cu-cats'), cuCatsHTML()); setHTML(lst, cuListHTML()); if (lst) lst.scrollTop=top;
  if (sel){
    let el=p.querySelector(`[${sel.at}="${sel.v}"]`);
    if (el && el.getAttribute('aria-disabled')==='true'){ const alt=sel.at==='data-cu-up' ? 'data-cu-dn' : sel.at==='data-cu-dn' ? 'data-cu-up' : null; if (alt) el=p.querySelector(`[${alt}="${sel.v}"]`) || el; }
    if (!el && idx>=0){ const rows=p.querySelectorAll('.cu-ai'), r=rows[Math.min(idx, rows.length-1)]; el=r ? r.querySelector(`[${sel.at}]`) : null; }
    if (!el) el=p.querySelector('.cu-add[tabindex="0"]') || p.querySelector('.cu-ai button') || p.querySelector(`[data-cu-cat="${CU.cat}"]`) || p.querySelector('#cu-q');
    if (el) el.focus();
  }
}

// settings dialog for one indicator instance
function cuSetHTML(){
  const x=cuFind(CU.open.k), d=x && cuDefs()[x.id]; if (!d) return '';
  const back=CU.stack.length>0, P=d.p||{}, O=d.out||{};
  const num=v=>String(+(+v).toFixed(6));
  const params=Object.keys(P).map(k=>{ const s=P[k], v=x.p && x.p[k]!=null ? x.p[k] : s.v, id=`cu-p-${esc(k)}`, rng=(s.min!=null && s.max!=null) ? `${num(s.min)} – ${num(s.max)}` : s.min!=null ? `≥ ${num(s.min)}` : s.max!=null ? `≤ ${num(s.max)}` : '';
    return `<div class="cu-f"><label for="${id}">${esc(cuL(s.n) || k)}</label><span class="cu-in"><input type="number" id="${id}" data-cu-p="${esc(k)}" value="${esc(num(v))}"${s.min!=null ? ` min="${s.min}"` : ''}${s.max!=null ? ` max="${s.max}"` : ''} step="${s.step!=null ? s.step : 'any'}" inputmode="${Number.isInteger(s.step) ? 'numeric' : 'decimal'}"${rng ? ` aria-describedby="${id}-h"` : ''}>${rng ? `<span class="cu-rng" id="${id}-h">${esc(rng)}</span>` : ''}</span></div>`; }).join('');
  const cols=Object.keys(O).map(o=>{ const v=cuIc(x, d, o), id=`cu-c-${esc(o)}`;
    return `<div class="cu-f"><label for="${id}">${esc(cuL(O[o].n) || o)}</label><span class="cu-col"><input type="color" id="${id}" data-cu-c="${esc(o)}" value="${v}"><code aria-hidden="true">${v}</code></span></div>`; }).join('');
  return `<div class="cu-pnl cu-dlg cu-set" role="dialog" aria-modal="true" aria-labelledby="cu-set-h" aria-describedby="cu-set-d" tabindex="-1">`
    + cuHd('cu-set-h', cuLabel(x), back)
    + `<div class="cu-sbody"><p class="cu-sub" id="cu-set-d"><b>${esc(cuL(d.n))}</b> · ${esc(cuPaneTxt(x.id))}${d.d ? ' — '+esc(cuL(d.d)) : ''}</p>`
    + (params ? `<fieldset class="cu-fs"><legend>${esc(L2('Inputs', 'Girdiler'))}</legend>${params}</fieldset>` : `<p class="cu-sub">${esc(L2('This indicator has no inputs.', 'Bu göstergenin girdisi yok.'))}</p>`)
    + (cols ? `<fieldset class="cu-fs"><legend>${esc(L2('Colours', 'Renkler'))}</legend>${cols}</fieldset>` : '')
    + `<label class="cu-chk"><input type="checkbox" data-cu-vis ${x.hide ? '' : 'checked'}><span>${esc(L2('Show on the chart', 'Grafikte göster'))}</span></label>`
    + `<p class="sr" id="cu-live" aria-live="polite"></p></div>`
    + `<div class="cu-ft"><button type="button" class="cu-btn" data-cu-reset>${esc(L2('Reset to defaults', 'Varsayılanlara dön'))}</button><button type="button" class="cu-btn cu-danger" data-cu-rm="${esc(x.k)}">${esc(L2('Remove', 'Kaldır'))}</button><span class="cu-sp"></span><button type="button" class="cu-btn cu-pri" data-cu-done>${esc(L2('Done', 'Tamam'))}</button></div></div>`;
}

// templates dialog
function cuTplHTML(){
  const S=cuS(), names=Object.keys(S.tpl);
  const sum=list=>cuTplInds(list).map(x=>cuLabel({ id:x.id, p:Object.assign(cuP0(x.id), x.p||{}) })).join(' · ') || '—';
  const bi=CU_TPL.map(t=>`<li class="cu-ti"><span class="cu-lbl"><b>${esc(cuL(t.n))}</b><span>${esc(sum(t.inds))}</span></span><button type="button" class="cu-btn" data-cu-tpl-apply="b:${t.id}" aria-label="${esc(L2('Apply', 'Uygula'))} ${esc(cuL(t.n))}">${esc(L2('Apply', 'Uygula'))}</button></li>`).join('');
  const mine=names.length ? names.map((nm, i)=>`<li class="cu-ti"><span class="cu-lbl"><b>${esc(nm)}</b><span>${esc(sum(S.tpl[nm]))}</span></span><button type="button" class="cu-btn" data-cu-tpl-apply="u:${i}" aria-label="${esc(L2('Apply', 'Uygula'))} ${esc(nm)}">${esc(L2('Apply', 'Uygula'))}</button><button type="button" class="cu-ib" data-cu-tpl-del="${i}" aria-label="${esc(L2('Delete', 'Sil'))} ${esc(nm)}" title="${esc(L2('Delete', 'Sil'))}">${CU_IC.trash}</button></li>`).join('') : `<li class="cu-empty">${esc(L2('None saved yet.', 'Henüz kayıtlı şablon yok.'))}</li>`;
  const cur=S.inds.map(cuLabel).join(' · ');
  return `<div class="cu-pnl cu-dlg cu-tpl" role="dialog" aria-modal="true" aria-labelledby="cu-tpl-h" tabindex="-1">`
    + cuHd('cu-tpl-h', L2('Indicator templates', 'Gösterge şablonları'))
    + `<div class="cu-sbody"><p class="cu-sub">${esc(L2('Applying a template replaces the indicators on the chart.', 'Şablon uygulamak grafikteki göstergelerin yerini alır.'))}</p>`
    + `<h3 class="cu-gh">${esc(L2('Ready-made', 'Hazır şablonlar'))}</h3><ul class="cu-tl">${bi}</ul>`
    + `<h3 class="cu-gh">${esc(L2('My templates', 'Şablonlarım'))}</h3><ul class="cu-tl">${mine}</ul>`
    + `<form class="cu-save" data-cu-tpl-form novalidate><label for="cu-tn">${esc(L2('Save the current indicators as a template', 'Mevcut göstergeleri şablon olarak kaydet'))}</label>`
    + `<div class="cu-row2"><input id="cu-tn" type="text" maxlength="40" autocomplete="off" placeholder="${esc(L2('Name, e.g. My setup', 'Ad, ör. Benim düzenim'))}" aria-describedby="cu-tn-h"><button type="submit" class="cu-btn cu-pri">${esc(L2('Save', 'Kaydet'))}</button></div>`
    + `<p class="cu-hint2" id="cu-tn-h">${cur ? esc(L2('Now on the chart: ', 'Şu an grafikte: ')+cur) : esc(L2('Add some indicators to the chart first.', 'Önce grafiğe gösterge ekleyin.'))}</p><p class="cu-err" id="cu-tn-e" role="alert"></p></form>`
    + `<p class="sr" id="cu-live" aria-live="polite"></p></div></div>`;
}

/* ---------- events ---------- */
document.addEventListener('click', e=>{
  const t=e.target; if (!t || !t.closest) return;
  const tf=t.closest('[data-ctf]'); if (tf){ cuSetTf(tf.dataset.ctf); return; }
  const ty=t.closest('[data-ctype]'); if (ty){ cuSetType(ty.dataset.ctype); cuClose(); cuRefocus('[data-cu="type"]'); return; }
  const a=t.closest('[data-cu]'); if (a){ if (a.disabled) return; cuAct(a.dataset.cu, a); return; }
  const lg=t.closest('[data-cu-ind]'); if (lg && !t.closest('#cu-layer')){ e.preventDefault(); cuOpen('set', { k:lg.getAttribute('data-cu-ind'), from:lg }); return; }
  if (!t.closest('#cu-layer')) return;
  if (t.closest('[data-cu-scrim]') || t.closest('[data-cu-x]')){ CU.stack=[]; cuClose(); return; }
  if (t.closest('[data-cu-back]') || t.closest('[data-cu-done]')){ cuClose(); return; }
  const g=k=>{ const el=t.closest(`[${k}]`); return el ? el.getAttribute(k) : null; };
  let v;
  if ((v=g('data-cu-add'))!=null){ CU.rove=v; cuAddInd(v); cuPickRefresh(); return; }
  if ((v=g('data-cu-cat'))!=null){ CU.cat=v; CU.rove=null; cuPickRefresh(); const b=document.querySelector(`#cu-layer .cu-cats [data-cu-cat="${v}"]`); if (b) b.focus(); const l=document.getElementById('cu-list'); if (l) l.scrollTop=0; return; }
  const dis=t.closest('[aria-disabled="true"]'); if (dis) return;
  if ((v=g('data-cu-up'))!=null){ const S=cuS(); cuMoveInd(v, S.inds.findIndex(x=>x.k===v)-1); cuPickRefresh(); return; }
  if ((v=g('data-cu-dn'))!=null){ const S=cuS(); cuMoveInd(v, S.inds.findIndex(x=>x.k===v)+1); cuPickRefresh(); return; }
  if ((v=g('data-cu-eye'))!=null){ cuToggleInd(v); cuPickRefresh(); return; }
  if ((v=g('data-cu-set'))!=null){ cuOpen('set', { k:v, from:t.closest('[data-cu-set]') }); return; }
  if ((v=g('data-cu-rm'))!=null){ cuRemoveInd(v); if (CU.open && CU.open.kind==='set') cuClose(); else cuPickRefresh(); return; }
  if (t.closest('[data-cu-clear]')){ const S=cuS(), n=S.inds.length; S.inds=[]; save(); render(); cuSay(L2(`${n} indicators removed`, `${n} gösterge kaldırıldı`)); cuPickRefresh(); const b=document.querySelector('#cu-layer [data-cu-cat="all"].cu-btn') || document.getElementById('cu-q'); if (b) b.focus(); return; }
  if (t.closest('[data-cu-tplopen]')){ CU.stack=[]; const op=CU.open; cuOpen('tpl'); if (op && CU.open){ CU.open.opener=op.opener; CU.open.osel=op.osel; } const i=document.getElementById('cu-tn'); if (i) i.focus(); return; }
  if (t.closest('[data-cu-reset]')){ const x=cuFind(CU.open && CU.open.k); if (!x) return; x.p=cuP0(x.id); x.c=cuC0(x.id); save(); render(); cuPaint(); const r=document.querySelector('#cu-layer [data-cu-reset]'); if (r) r.focus(); cuSay(L2('Back to the default settings', 'Varsayılan ayarlara dönüldü')); return; }
  if ((v=g('data-cu-tpl-apply'))!=null){ if (cuApplyTpl(v)) cuClose(); return; }
  if ((v=g('data-cu-tpl-del'))!=null){ cuDelTpl(+v); cuPaint(); const n=Object.keys(cuS().tpl).length, b=document.querySelector(`#cu-layer [data-cu-tpl-del="${Math.min(+v, n-1)}"]`) || document.getElementById('cu-tn'); if (b) b.focus(); return; }
});
function cuAct(a, el){
  const S=cuS();
  if (a==='type'){ if (CU.open && CU.open.kind==='type') cuClose(); else cuOpen('type', { from:el }); return; }
  if (a==='ind'){ cuOpen('ind', { from:el }); return; }
  if (a==='tpl'){ cuOpen('tpl', { from:el }); return; }
  if (a==='draw'){ if (typeof drOpen==='function'){ try { drOpen(); } catch (e){ console.error(e); } render(); cuRefocus('[data-cu="draw"]'); } return; }
  if (a==='log'){ S.log=!S.log; cuCommit('[data-cu="log"]'); return; }
  if (a==='marks'){ S.marks=!S.marks; cuCommit('[data-cu="marks"]'); return; }
  if (a==='full'){ cuFull(); return; }
  if (a==='shot'){ cuShot(); return; }
}
document.addEventListener('input', e=>{
  const t=e.target; if (!t || !t.closest || !t.closest('#cu-layer')) return;
  if (t.id==='cu-q'){ CU.q=t.value; CU.rove=null; if (CU.cat==='on' && CU.q.trim()) CU.cat='all'; cuPickRefresh(); return; }
  const x=CU.open && CU.open.kind==='set' ? cuFind(CU.open.k) : null; if (!x) return; const d=cuDefs()[x.id];
  if (t.hasAttribute('data-cu-p')){
    const k=t.getAttribute('data-cu-p'), s=d.p[k], v=t.value==='' ? NaN : Number(t.value);
    const ok=isFinite(v) && (s.min==null || v>=s.min) && (s.max==null || v<=s.max);
    t.setAttribute('aria-invalid', String(!ok));
    if (ok){ x.p=x.p||{}; x.p[k]=Number.isInteger(s.step) ? Math.round(v) : v; save(); render(); const h=document.getElementById('cu-set-h'); if (h) h.textContent=cuLabel(x); }
    return;
  }
  if (t.hasAttribute('data-cu-c')){ const o=t.getAttribute('data-cu-c'); x.c=x.c||{}; x.c[o]=cuHex(t.value, d.out[o].c); const cd=t.parentNode.querySelector('code'); if (cd) cd.textContent=x.c[o]; save(); render(); return; }
});
document.addEventListener('change', e=>{
  const t=e.target; if (!t || !t.closest || !t.closest('#cu-layer')) return;
  const x=CU.open && CU.open.kind==='set' ? cuFind(CU.open.k) : null; if (!x) return; const d=cuDefs()[x.id];
  if (t.hasAttribute('data-cu-p')){ // on commit: snap to a valid value
    const k=t.getAttribute('data-cu-p'), s=d.p[k]; let v=Number(t.value); if (t.value==='' || !isFinite(v)) v=x.p && x.p[k]!=null ? x.p[k] : s.v;
    if (s.min!=null) v=Math.max(s.min, v); if (s.max!=null) v=Math.min(s.max, v); if (Number.isInteger(s.step)) v=Math.round(v);
    x.p=x.p||{}; x.p[k]=v; t.value=String(+(+v).toFixed(6)); t.setAttribute('aria-invalid', 'false'); save(); render();
    const h=document.getElementById('cu-set-h'); if (h) h.textContent=cuLabel(x); return;
  }
  if (t.hasAttribute('data-cu-vis')){ x.hide=!t.checked; save(); render(); return; }
});
document.addEventListener('submit', e=>{
  const f=e.target; if (!f || !f.hasAttribute || !f.hasAttribute('data-cu-tpl-form')) return; e.preventDefault();
  const inp=f.querySelector('#cu-tn'), err=cuSaveTpl(inp ? inp.value : '');
  if (err){ const el=f.querySelector('#cu-tn-e'); if (el) el.textContent=err; if (inp){ inp.setAttribute('aria-invalid', 'true'); inp.focus(); } return; }
  cuPaint(); const i=document.getElementById('cu-tn'); if (i) i.focus(); cuSay(L2('Template saved', 'Şablon kaydedildi'));
});
// drag to reorder (mouse); touch and keyboard use the arrow buttons
document.addEventListener('dragstart', e=>{ const li=e.target && e.target.closest && e.target.closest('#cu-layer .cu-ai'); if (!li) return; CU.drag=li.getAttribute('data-cu-k'); li.classList.add('is-drag'); try { e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', CU.drag); } catch (x){} });
document.addEventListener('dragover', e=>{ if (!CU.drag) return; const li=e.target && e.target.closest && e.target.closest('#cu-layer .cu-ai'); if (!li) return; e.preventDefault(); for (const r of document.querySelectorAll('#cu-layer .cu-ai.is-over')) if (r!==li) r.classList.remove('is-over'); li.classList.add('is-over'); });
document.addEventListener('drop', e=>{ if (!CU.drag) return; const li=e.target && e.target.closest && e.target.closest('#cu-layer .cu-ai'); if (!li) return; e.preventDefault(); const S=cuS(), to=S.inds.findIndex(x=>x.k===li.getAttribute('data-cu-k')), k=CU.drag; CU.drag=null; if (to>=0 && cuMoveInd(k, to)){ const x=cuFind(k); cuSay(L2(`${cuLabel(x)} moved to position ${to+1}`, `${cuLabel(x)} ${to+1}. sıraya taşındı`)); } cuPickRefresh(); });
document.addEventListener('dragend', ()=>{ CU.drag=null; for (const r of document.querySelectorAll('#cu-layer .is-drag,#cu-layer .is-over')) r.classList.remove('is-drag', 'is-over'); });

// keys inside the layer (they never reach the Trade-screen shortcuts)
function cuKeyDlg(e){
  const o=CU.open; if (!o) return; const p=cuPanel(); if (!p) return; const t=e.target;
  if (e.key==='Escape'){ e.preventDefault(); if (typeof chEscMark==='function') chEscMark(); if (o.kind==='type'){ cuClose(); return; } CU.stack.length && o.kind==='set' ? cuClose() : (CU.stack=[], cuClose()); return; }
  if (o.kind==='type'){
    const its=[...p.querySelectorAll('[role="menuitemradio"]')], i=its.indexOf(t);
    if (e.key==='ArrowDown' || e.key==='ArrowUp'){ e.preventDefault(); its[(i+(e.key==='ArrowDown' ? 1 : -1)+its.length)%its.length].focus(); }
    else if (e.key==='Home' || e.key==='End'){ e.preventDefault(); its[e.key==='Home' ? 0 : its.length-1].focus(); }
    else if (e.key==='Tab'){ e.preventDefault(); cuClose(); }
    return;
  }
  if (e.key==='Tab'){
    const f=cuFocusables(p); if (!f.length){ e.preventDefault(); return; }
    const i=f.indexOf(document.activeElement);
    if (e.shiftKey && (i<=0)){ e.preventDefault(); f[f.length-1].focus(); }
    else if (!e.shiftKey && (i===f.length-1 || i<0)){ e.preventDefault(); f[0].focus(); }
    return;
  }
  if (o.kind==='ind'){
    const adds=[...p.querySelectorAll('.cu-add')];
    if (t.id==='cu-q'){
      if (e.key==='ArrowDown'){ const f=p.querySelector('.cu-add[tabindex="0"]') || adds[0] || p.querySelector('.cu-ai button'); if (f){ e.preventDefault(); f.focus(); } }
      else if (e.key==='Enter'){ e.preventDefault(); if (adds[0]) adds[0].click(); }
      return;
    }
    if (t.classList.contains('cu-add')){
      const i=adds.indexOf(t); let j=-1;
      if (e.key==='ArrowDown') j=Math.min(adds.length-1, i+1); else if (e.key==='ArrowUp') j=i-1; else if (e.key==='Home') j=0; else if (e.key==='End') j=adds.length-1; else return;
      e.preventDefault(); if (j<0){ p.querySelector('#cu-q').focus(); return; }
      for (const b of adds) b.tabIndex=-1; adds[j].tabIndex=0; CU.rove=adds[j].getAttribute('data-cu-add'); adds[j].focus(); adds[j].scrollIntoView({ block:'nearest' });
      return;
    }
    const li=t.closest && t.closest('.cu-ai');
    if (li && e.altKey && (e.key==='ArrowUp' || e.key==='ArrowDown')){ e.preventDefault(); const S=cuS(), k=li.getAttribute('data-cu-k'), i=S.inds.findIndex(x=>x.k===k); if (cuMoveInd(k, i+(e.key==='ArrowUp' ? -1 : 1))){ const x=cuFind(k); cuSay(L2(`${cuLabel(x)} moved to position ${S.inds.indexOf(x)+1}`, `${cuLabel(x)} ${S.inds.indexOf(x)+1}. sıraya taşındı`)); } cuPickRefresh(); return; }
    const cats=[...p.querySelectorAll('.cu-cats [data-cu-cat]')], ci=cats.indexOf(t);
    if (ci>=0 && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)){ e.preventDefault(); const d=(e.key==='ArrowDown' || e.key==='ArrowRight') ? 1 : -1; cats[(ci+d+cats.length)%cats.length].focus(); }
  }
}
// Esc outside the layer: close an open dialog, or leave full screen (before term.js would cancel an order)
addEventListener('keydown', e=>{
  if (e.key!=='Escape') return;
  const inLayer=e.target && e.target.closest && e.target.closest('#cu-layer');
  if (CU.open){ if (!inLayer){ e.preventDefault(); e.stopPropagation(); if (typeof chEscMark==='function') chEscMark(); CU.stack=[]; cuClose(); } return; }
  if (!document.documentElement.classList.contains('ch-full')) return;
  if (typeof UI==='object' && UI && (UI.pal || UI.help)) return;
  const rp=document.getElementById('replay'); if (rp && !rp.hidden) return;
  if (typeof drBusy==='function'){ try { if (drBusy()) return; } catch (x){} }
  if (typeof DR==='object' && DR && DR.tmp) return;     // a Shift-drag measurement: draw.js clears it first
  e.preventDefault(); e.stopPropagation(); if (typeof chEscMark==='function') chEscMark(); cuFull(false);
}, true);
// keep the focus inside an open dialog
document.addEventListener('focusin', e=>{ if (!CU.open) return; const p=cuPanel(); if (p && !p.contains(e.target)){ const f=cuFocusables(p)[0]; (f || p).focus(); } });
// toolbar: arrow keys move between its buttons
document.addEventListener('keydown', e=>{
  if (e.key!=='ArrowLeft' && e.key!=='ArrowRight') return; const t=e.target; if (!t || !t.closest) return;
  const bar=t.closest('.cu-bar'); if (!bar || t.tagName!=='BUTTON') return;
  const bs=[...bar.querySelectorAll('button')].filter(b=>!b.disabled), i=bs.indexOf(t); if (i<0) return;
  e.preventDefault(); e.stopPropagation(); bs[(i+(e.key==='ArrowRight' ? 1 : -1)+bs.length)%bs.length].focus();
}, true);
addEventListener('resize', ()=>{ if (CU.open && CU.open.kind==='type') cuPlaceMenu(); });
// the desktop type menu is anchored to its button: close it when the page itself scrolls (phones show a bottom sheet)
addEventListener('scroll', e=>{ const t=e.target; if (!CU.open || CU.open.kind!=='type' || innerWidth<=560) return; if (t!==document && t!==document.documentElement && t!==document.body) return; cuClose(); }, true);

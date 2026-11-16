/* ---------- Tidewater Live: drawing tools on the pro chart (piece 5 of the pro chart, prefix DR / dr) ----------
   Drawings live per instrument in ST.chart.draw[sym] as { id, tool, a:{ t, px }, b?:{ t, px }, c?:{ t, px }, txt?, col, w?, dash? }
   (bar time + price, so they survive zoom, pan, log scale and timeframe changes).
   tool: 'trend' | 'ray' | 'ext' (extended both ways) | 'hline' | 'hray' | 'vline' | 'chan' (parallel channel: a-b is the
   base line, c is any point on the parallel line) | 'rect' | 'fib' (retracement: level 1 at a, level 0 at b) | 'text' (txt)
   | 'measure' (Δ price, Δ %, bars, time) | 'long' / 'short' (position: a = entry, b.px = target, c.px = stop, b.t = right edge).
   w: line width 1-3 (text: size), dash: dashed line.
   Globals: DR (state; DR.open is read by chui.js), drOpen(on?) toggles the tool palette (shown right above #tr-chart),
   drBusy() (true while a tool, a placement, a drag, a selection or the note editor owns the pointer / keys: chart.js does not
   pan then), drRender() → SVG markup for the main price pane (chart.js puts it into its clipped .ch-dr group), drTool(id).
   Pointer: one capturing document pointerdown listener (cheap: it only looks at presses on the chart); pointermove / up
   listeners are attached only while a tool is active, a drawing is selected or something is being dragged.
   Click-click, tap-tap or drag places a drawing; a press on a drawing selects it and drags it (or the handle under the
   pointer); Delete / Backspace or the × button removes it; Esc cancels. Magnet (ST.chart.magnet) snaps to the bar's
   O/H/L/C (Ctrl / ⌘ held flips it). Shift+drag on the chart measures without a tool (gone on the next press).
   Ctrl+Z / Ctrl+Shift+Z undo / redo. Alt+T trend, Alt+H horizontal, Alt+V vertical, Alt+R rectangle, Alt+C channel,
   Alt+F Fibonacci, Alt+N note, Alt+M measure, Alt+L long, Alt+S short. Horizontal lines can set a price alert (watch.js alAdd). */
const DR_TOOLS = [
  { id:'trend', n:['Trend line','Trend çizgisi'], pts:2, key:'T', g:1 },
  { id:'ray', n:['Ray','Işın'], pts:2, g:1 },
  { id:'ext', n:['Extended line','Uzatılmış çizgi'], pts:2, g:1 },
  { id:'hline', n:['Horizontal line','Yatay çizgi'], pts:1, key:'H', g:1 },
  { id:'hray', n:['Horizontal ray','Yatay ışın'], pts:1, g:1 },
  { id:'vline', n:['Vertical line','Dikey çizgi'], pts:1, key:'V', g:1 },
  { id:'chan', n:['Parallel channel','Paralel kanal'], pts:3, key:'C', g:2 },
  { id:'rect', n:['Rectangle','Dikdörtgen'], pts:2, key:'R', g:2 },
  { id:'fib', n:['Fibonacci retracement','Fibonacci düzeltmesi'], pts:2, key:'F', g:2 },
  { id:'text', n:['Text note','Metin notu'], pts:1, key:'N', g:3 },
  { id:'measure', n:['Measure (price, %, bars, time)','Ölçüm (fiyat, %, mum, süre)'], pts:2, key:'M', g:3 },
  { id:'long', n:['Long position (target and stop)','Uzun pozisyon (hedef ve stop)'], pts:1, key:'L', g:3 },
  { id:'short', n:['Short position (target and stop)','Kısa pozisyon (hedef ve stop)'], pts:1, key:'S', g:3 },
];
const DR_TOOL = Object.fromEntries(DR_TOOLS.map(t=>[t.id, t]));
const DR_KEYS = Object.fromEntries(DR_TOOLS.filter(t=>t.key).map(t=>['Key'+t.key, t.id]));
const DR_COLS = [['#3b82f6','blue','mavi'], ['#f5a524','amber','kehribar'], ['#a855f7','purple','mor'], ['#06b6d4','cyan','turkuaz'], ['#ec4899','pink','pembe'], ['#8a94a6','grey','gri']];
const DR_FIB = [[0,'#8a94a6'], [0.236,'#e5534b'], [0.382,'#e8890c'], [0.5,'#2ea44f'], [0.618,'#14a38b'], [0.786,'#0ea5c6'], [1,'#8a94a6']];
const DR_SW = { 1:1, 2:1.7, 3:2.8 };
const DR = {
  open:false, tool:null, keep:false, sel:null, place:null, drag:null, tmp:null, ed:null,
  ver:0, cM:null, cSig:'', cache:'', bb:null, undo:[], redo:[], palSig:'', tbSig:'', listen:false, raf:0,
  ptr:'mouse', touch:new Set(), just:0, lastTap:null, hintTxt:'',
};
// ---------------------------------------------------------------- small helpers
const drEsc = s => String(s==null ? '' : s).replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const drL = (en, tr) => typeof L2==='function' ? L2(en, tr) : en;
const drF = v => Math.round(Math.max(-1e5, Math.min(1e5, v))*10)/10;
const drOk = v => typeof v==='number' && isFinite(v);
const drCol = c => /^#[0-9a-f]{6}$/i.test(String(c||'')) ? c : DR_COLS[0][0];
function drM(){ return typeof CHM!=='undefined' && CHM && typeof CHM.t2x==='function' && typeof CHM.y==='function' ? CHM : null; }
function drHost(){ return (typeof CH==='object' && CH && CH.host && CH.host.isConnected) ? CH.host : document.getElementById('tr-chart'); }
function drSvg(){ const s=typeof CH==='object' && CH && CH.svg; if (s && s.isConnected) return s; const h=drHost(); return h ? h.querySelector('svg.chart') : null; }
function drSym(M){ return (M && M.sym) || (typeof ST==='object' && ST ? ST.sel : '') || ''; }
function drC(){ return typeof ST==='object' && ST && ST.chart && typeof ST.chart==='object' ? ST.chart : null; }
function drP(v){ if (!drOk(v)) return '—'; if (typeof chFmtP==='function' && typeof chDec==='function') return chFmtP(v, chDec(Math.abs(v))); if (typeof fpx==='function' && v>0) return fpx(v); return String(+v.toPrecision(7)); }
function drPct(r){ if (!drOk(r)) return '—'; return (r>=0 ? '+' : '−')+Math.abs(r*100).toFixed(2)+'%'; }
function drTime(t, M){ if (typeof chTimeFull==='function') return chTimeFull(t, (M && M.tfms) || 6e4); try { return new Date(t).toLocaleString(); } catch (e){ return String(t); } }
function drDur(ms){ ms=Math.abs(ms); const m=Math.round(ms/6e4), d=Math.floor(m/1440), h=Math.floor(m%1440/60), mi=m%60;
  if (d>0) return d+drL('d','g')+(h ? ' '+h+drL('h','sa') : ''); if (h>0) return h+drL('h','sa')+(mi ? ' '+mi+drL('m','dk') : ''); return mi+drL('m','dk'); }
function drOn(c){ if (typeof chOn==='function') return chOn(c); return '#ffffff'; }
function drCw(M){ return M.cw || Math.abs(M.x(1)-M.x(0)) || 6; }
function drTfms(M){ return M.tfms || 6e4; }
function drId(){ return 'd'+Date.now().toString(36)+Math.random().toString(36).slice(2, 6); }
function drList(sym, make){ const C=drC(); if (!C) return [];
  if (!C.draw || typeof C.draw!=='object') C.draw={};
  let L=C.draw[sym];
  if (!Array.isArray(L)){ if (!make) return []; L=C.draw[sym]=[]; }
  if (L.some(d=>!drValid(d))) L=C.draw[sym]=L.filter(drValid);
  return L; }
function drValid(d){ const pt=p=>p && typeof p==='object' && drOk(p.t) && drOk(p.px);
  return d && typeof d==='object' && DR_TOOL[d.tool] && pt(d.a) && (DR_TOOL[d.tool].pts<2 || pt(d.b)) && (!['long','short'].includes(d.tool) || (pt(d.b) && pt(d.c))) && (d.tool!=='chan' || pt(d.c)); }
function drFind(id, sym){ return drList(sym || drSym(drM()), false).find(d=>d.id===id) || null; }
function drVisible(){ const h=drHost(); return !!(h && h.getClientRects().length); }
// time shifted by whole bars, and points shifted on screen
function drShiftT(M, t, db){ if (!db) return t; if (M.t2a && M.a2t) return M.a2t(M.t2a(t)+db); return t+db*drTfms(M); }
function drShift(M, p, db, dy){ let px=dy ? M.px(M.y(p.px)+dy) : p.px; if (!(px>0) || !isFinite(px)) px=p.px; return { t:drShiftT(M, p.t, db), px }; }
function drBars(M, t0, t1){ return M.t2a ? Math.round(M.t2a(t1)-M.t2a(t0)) : Math.round((t1-t0)/drTfms(M)); }
// pointer → svg coordinates (viewBox units)
function drPt(e, svg, M){ const r=svg.getBoundingClientRect(), vb=svg.viewBox && svg.viewBox.baseVal, W=(vb && vb.width) || M.W, H=(vb && vb.height) || M.H;
  return { x:(e.clientX-r.left)*W/(r.width || 1), y:(e.clientY-r.top)*H/(r.height || 1) }; }
// snap to a bar (and with the magnet to its open / high / low / close)
function drBarAt(M, a, x){
  if (a==null && Array.isArray(M.bars) && typeof M.x==='function'){ let bi=-1, bd=Infinity; M.bars.forEach((b, i)=>{ const d=Math.abs(M.x(i)-x); if (d<bd){ bd=d; bi=i; } }); return bi>=0 ? M.bars[bi] : null; }
  if (a==null) return null; const i=a-(M.i0 || 0);
  if (Array.isArray(M.bars) && i>=0 && i<M.bars.length) return M.bars[i];
  if (Array.isArray(M.raw) && a>=0 && a<M.raw.length) return M.raw[a];
  return null; }
function drSnap(p, e, M){
  let a=null, t;
  if (M.x2a && M.a2t){ a=Math.round(M.x2a(p.x)); t=M.a2t(a); } else t=M.x2t(p.x);
  let px=M.px(p.y); if (!(px>0) || !isFinite(px)) px=M.px(Math.max(0, Math.min(M.mainH, p.y)));
  const C=drC(), mag=!!(C && C.magnet) !== !!(e && (e.ctrlKey || e.metaKey));
  if (mag){ const b=drBarAt(M, a, p.x); if (b){ let best=null, bd=Infinity; for (const v of [b.o, b.h, b.l, b.c]){ if (!drOk(v)) continue; const d=Math.abs(M.y(v)-p.y); if (d<bd){ bd=d; best=v; } } if (best!=null) px=best; } }
  return { t, px, a }; }
// ---------------------------------------------------------------- undo / redo
function drSnapJ(sym){ return JSON.stringify(drList(sym, false)); }
// undo entries also keep the price alerts linked to the drawings (d.al = the alert id), so undo/redo restores the links
function drAlSnap(sym){ const ids=new Set(drList(sym, false).map(d=>d.al).filter(x=>x!=null)); return typeof ST==='object' && ST && Array.isArray(ST.alerts) ? JSON.stringify(ST.alerts.filter(a=>a && ids.has(a.id))) : '[]'; }
function drAlRestore(sym, before, al){ if (al==null || typeof ST!=='object' || !ST || !Array.isArray(ST.alerts)) return;
  const ids=new Set(before.concat(drList(sym, false)).map(d=>d.al).filter(x=>x!=null)); let keep=[]; try { keep=JSON.parse(al); } catch (e){ keep=[]; }
  ST.alerts=ST.alerts.filter(a=>!(a && ids.has(a.id))).concat(keep.filter(a=>a && ids.has(a.id))); }
function drPushUndo(sym, j){ DR.undo.push({ sym, j:j!=null ? j : drSnapJ(sym), al:drAlSnap(sym) }); if (DR.undo.length>60) DR.undo.shift(); DR.redo=[]; }
function drSetList(sym, arr){ const C=drC(); if (!C) return; if (!C.draw || typeof C.draw!=='object') C.draw={}; C.draw[sym]=Array.isArray(arr) ? arr.filter(drValid) : []; }
function drUndo(){ const u=DR.undo.pop(); if (!u) return false; const was=drList(u.sym, false).slice(); DR.redo.push({ sym:u.sym, j:drSnapJ(u.sym), al:drAlSnap(u.sym) }); drSetList(u.sym, JSON.parse(u.j)); drAlRestore(u.sym, was, u.al); DR.sel=null; drCommit(); drAlRender(); return true; }
function drRedo(){ const u=DR.redo.pop(); if (!u) return false; const was=drList(u.sym, false).slice(); DR.undo.push({ sym:u.sym, j:drSnapJ(u.sym), al:drAlSnap(u.sym) }); drSetList(u.sym, JSON.parse(u.j)); drAlRestore(u.sym, was, u.al); DR.sel=null; drCommit(); drAlRender(); return true; }
const drAlRender = () => { if (typeof render==='function'){ try { render(); } catch (e){} } };
function drCommit(){ if (typeof save==='function') save(); drKick(); drListen(); }
// ---------------------------------------------------------------- public API
function drBusy(){ return !!(DR.tool || DR.place || DR.drag || DR.sel || DR.ed); }
function drOpen(on){ DR.open = on==null ? !DR.open : !!on;
  if (!DR.open){ DR.tool=null; DR.place=null; }
  drKick(); drListen(); return DR.open; }
function drTool(id){ id=id && DR_TOOL[id] ? id : null;
  if (id && DR.tool===id && !DR.place) id=null;      // pressing the active tool again puts it away
  DR.tool=id; DR.place=null; DR.sel=null; DR.tmp=null;
  if (id){ DR.open=true; const C=drC(); if (C && C.drHide){ C.drHide=false; if (typeof save==='function') save(); } }
  drKick(); drListen(); }
function drDelete(id){ const M=drM(), sym=drSym(M), L=drList(sym, false), d=L.find(x=>x.id===id); if (!d) return;
  drPushUndo(sym); const gone=drAlDrop(sym, [d]); drSetList(sym, L.filter(x=>x.id!==id)); if (DR.sel===id) DR.sel=null; if (DR.ed && DR.ed.id===id) DR.ed=null; drCommit();
  if (gone){ if (typeof toast==='function') toast(drL('Line and its price alert removed. Undo (Ctrl+Z) brings both back.', 'Çizgi ve fiyat alarmı silindi. Geri al (Ctrl+Z) ikisini de geri getirir.')); drAlRender(); } }
function drClear(){ const M=drM(), sym=drSym(M), L=drList(sym, false); if (!L.length) return;
  drPushUndo(sym); const gone=drAlDrop(sym, L); drSetList(sym, []); DR.sel=null; drCommit(); if (gone) drAlRender();
  if (typeof toast==='function') toast(drL(`All drawings on ${sym} removed. Undo (Ctrl+Z) brings them back.`, `${sym} üzerindeki tüm çizimler silindi. Geri al (Ctrl+Z) geri getirir.`)); }
// repaint just the drawings (chart.js chDraw), the palette and the toolbar, once per frame
function drKick(){ DR.ver++; if (DR.raf) return;
  DR.raf=requestAnimationFrame(()=>{ DR.raf=0;
    try {
      if (typeof CH==='object' && CH && CH.L && CH.svg && CH.svg.isConnected && typeof chDraw==='function') chDraw();
      else if (typeof chQueue==='function') chQueue();
      drSync(drM());
    } catch (e){ try { console.error(e); } catch (z){} } }); }
function drListen(){ const on=!!(DR.tool || DR.sel || DR.drag || DR.place); if (on===DR.listen) return; DR.listen=on;
  const f=on ? 'addEventListener' : 'removeEventListener';
  document[f]('pointermove', drMove, true); document[f]('pointerup', drUp, true); document[f]('pointercancel', drUp, true); }
// ---------------------------------------------------------------- rendering (SVG for the main pane)
function drRender(){
  const M=drM(); if (!M) return '';
  const C=drC(); if (!C){ return ''; }
  const sym=drSym(M), hide=!!C.drHide;
  if (DR.place && DR.place.sym!==sym){ DR.place=null; }
  const list=drList(sym, false);
  if (DR.sel && (hide || !list.some(d=>d.id===DR.sel))) DR.sel=null;
  if (DR.ed && !list.some(d=>d.id===DR.ed.id)) DR.ed=null;
  const sig=[DR.ver, hide, sym, drAlSig(sym), typeof ST==='object' && ST ? ST.lang : '', M.mainH, M.plotW].join('|');
  if (DR.cM!==M || DR.cSig!==sig){
    let out=''; DR.bb=null;
    if (!hide) for (const d of list){ try { out+=drShape(d, M, d.id===DR.sel, sym, null); } catch (e){} }
    if (DR.place){ try { out+=drShape(DR.place.d, M, true, sym, DR.place); } catch (e){} }
    if (DR.tmp){ try { out+=drShape(DR.tmp, M, false, sym, null, true); } catch (e){} }
    DR.cM=M; DR.cSig=sig; DR.cache=out;
  }
  try { drSync(M); } catch (e){ try { console.error(e); } catch (z){} }
  return DR.cache;
}
function drAlerts(sym){ return typeof ST==='object' && ST && Array.isArray(ST.alerts) ? ST.alerts.filter(a=>a && a.on && a.sym===sym && (a.kind==='above' || a.kind==='below')) : []; }
function drAlSig(sym){ return drAlerts(sym).map(a=>a.v).join(','); }
function drAlertAt(sym, px){ return drAlerts(sym).find(a=>Math.abs(a.v-px)<=Math.abs(px)*1e-6) || null; }
// the live alert of a horizontal line: the one it is linked to (d.al), else (older drawings) one at the line's price
function drAlertFor(sym, d, px){ if (d && d.al!=null){ const a=drAlerts(sym).find(x=>x.id===d.al); if (a) return a; } return d ? drAlertAt(sym, px!=null ? px : d.a.px) : null; }
// remove the alerts of these drawings; returns how many went
function drAlDrop(sym, ds){ if (typeof ST!=='object' || !ST || !Array.isArray(ST.alerts)) return 0; const gone=new Set();
  for (const d of ds){ if (!d || (d.tool!=='hline' && d.tool!=='hray')) continue; const a=drAlertFor(sym, d); if (a) gone.add(a); }
  if (gone.size){ ST.alerts=ST.alerts.filter(a=>!gone.has(a)); if (typeof save==='function') save(); } return gone.size; }
// a horizontal line with an alert was moved: the alert follows it (above / below worked out again against the price now)
function drAlMove(sym, d, oldPx){ if (!d || (d.tool!=='hline' && d.tool!=='hray')) return; const a=drAlertFor(sym, d, oldPx); if (!a) return;
  const v=+(+d.a.px).toPrecision(8); if (!(v>0)){ ST.alerts=ST.alerts.filter(x=>x!==a); delete d.al; return; }
  const q=typeof quote==='function' ? quote(sym) : null; a.v=v; if (q && q.last>0) a.kind=v>=q.last ? 'above' : 'below'; a.t=Date.now(); d.al=a.id;
  if (typeof toast==='function') toast(a.kind==='above' ? drL(`Alert moved: ${sym} rises above $${drP(v)}.`, `Alarm taşındı: ${sym} $${drP(v)} üstüne çıkarsa.`) : drL(`Alert moved: ${sym} falls below $${drP(v)}.`, `Alarm taşındı: ${sym} $${drP(v)} altına inerse.`)); }
// one drawing → markup. sel: selected (handles shown), P: the placement in progress, tmp: the quick measure
function drShape(d, M, sel, sym, P, tmp){
  const W=M.plotW || (M.W-M.pad), H=M.mainH, col=drCol(d.col), sw=DR_SW[d.w] || DR_SW[2], f=drF;
  const da=d.dash ? ' stroke-dasharray="6 4"' : '';
  const XY=p=>({ x:M.t2x(p.t), y:M.y(p.px) });
  const A=XY(d.a), B=d.b ? XY(d.b) : null;
  if (!drOk(A.x) || !drOk(A.y) || (B && (!drOk(B.x) || !drOk(B.y)))) return '';
  const hs=[], bb=[];          // handles [key, x, y], bounding points
  const ln=(x1, y1, x2, y2, cls, extra)=>`<path class="${cls || 'dr-ln'}" d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}" style="stroke:${col};--w:${sw}px"${da}${extra || ''}/>`;
  const hit=(x1, y1, x2, y2)=>`<path class="dr-hit" d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}"/>`;
  const tag=(x, y, txt, bg, fg, anchor, h2)=>{ const w=String(txt).length*6.4+10, hh=h2 || 16, x0=Math.max(2, Math.min(W-w-2, anchor==='end' ? x-w : anchor==='middle' ? x-w/2 : x));
    return `<rect class="dr-tag" x="${f(x0)}" y="${f(y-hh/2)}" width="${f(w)}" height="${hh}" rx="3" style="fill:${bg}"/><text class="dr-tt" x="${f(x0+w/2)}" y="${f(y+3.8)}" text-anchor="middle" style="fill:${fg}">${drEsc(txt)}</text>`; };
  const far=(P1, P2, k)=>{ const dx=P2.x-P1.x, dy=P2.y-P1.y, l=Math.hypot(dx, dy) || 1; return { x:P2.x+dx/l*k, y:P2.y+dy/l*k }; };
  let s='';
  switch (d.tool){
    case 'trend': case 'ray': case 'ext': {
      let S=A, E=B; if (d.tool!=='trend' && Math.hypot(B.x-A.x, B.y-A.y)>0.5){ E=far(A, B, 6000); if (d.tool==='ext') S=far(B, A, 6000); }
      s+=ln(S.x, S.y, E.x, E.y)+hit(S.x, S.y, E.x, E.y);
      if (d.tool==='trend' && sel && !P && Math.hypot(B.x-A.x, B.y-A.y)>40){ // slope readout while selected
        const ch=d.a.px ? (d.b.px-d.a.px)/d.a.px : 0, nb=drBars(M, d.a.t, d.b.t); s+=tag((A.x+B.x)/2, Math.min(A.y, B.y)-14, `${drPct(ch)} · ${nb} ${drL('bars','mum')}`, 'var(--surface-2)', 'var(--ink)', 'middle'); }
      hs.push(['a', A.x, A.y], ['b', B.x, B.y]); bb.push(A, B); break; }
    case 'hline': case 'hray': {
      const x1=d.tool==='hray' ? A.x : 0, al=drAlertFor(sym, d);
      s+=ln(x1, A.y, W+2, A.y)+hit(x1, A.y, W+2, A.y);
      s+=tag(W-3, A.y, drP(d.a.px)+(al ? ' 🔔' : ''), col, drOn(col), 'end');
      const hx=d.tool==='hray' ? A.x : Math.max(14, Math.min(W-90, A.x));
      hs.push(['a', hx, A.y]); bb.push({ x:d.tool==='hray' ? A.x : W*0.3, y:A.y }, { x:d.tool==='hray' ? W : W*0.7, y:A.y }); break; }
    case 'vline': {
      s+=ln(A.x, -2, A.x, H+2)+hit(A.x, -2, A.x, H+2);
      const tx=drTime(d.a.t, M); s+=tag(Math.max(4, Math.min(W-tx.length*6.4-14, A.x-(tx.length*6.4+10)/2)), H-11, tx, col, drOn(col), 'start');
      const hy=Math.max(12, Math.min(H-28, A.y)); hs.push(['a', A.x, hy]); bb.push({ x:A.x, y:H*0.35 }, { x:A.x, y:H*0.35 }); break; }
    case 'rect': {
      const x0=Math.min(A.x, B.x), y0=Math.min(A.y, B.y), w=Math.abs(B.x-A.x), h=Math.abs(B.y-A.y);
      s+=`<path class="dr-fill" d="M${f(x0)} ${f(y0)}h${f(w)}v${f(h)}h${f(-w)}Z" style="fill:${col}"/>`;
      s+=`<path class="dr-ln" d="M${f(x0)} ${f(y0)}h${f(w)}v${f(h)}h${f(-w)}Z" style="stroke:${col};--w:${sw}px" fill="none"${da}/>`;
      s+=`<path class="dr-hit" d="M${f(x0)} ${f(y0)}h${f(w)}v${f(h)}h${f(-w)}Z"/>`;
      hs.push(['a', A.x, A.y], ['b', B.x, B.y], ['ab', A.x, B.y], ['ba', B.x, A.y]); bb.push(A, B); break; }
    case 'chan': {
      const C0=d.c ? XY(d.c) : null; let dy=0;
      if (C0 && drOk(C0.x) && drOk(C0.y)){ const ly=Math.abs(B.x-A.x)>0.5 ? A.y+(B.y-A.y)*(C0.x-A.x)/(B.x-A.x) : A.y; dy=C0.y-ly; }
      if (C0 && !(P && P.step<2 && !d.c2)){
        s+=`<path class="dr-fill" d="M${f(A.x)} ${f(A.y)}L${f(B.x)} ${f(B.y)}L${f(B.x)} ${f(B.y+dy)}L${f(A.x)} ${f(A.y+dy)}Z" style="fill:${col}"/>`;
        s+=ln(A.x, A.y+dy/2, B.x, B.y+dy/2, 'dr-ln dr-mid')+ln(A.x, A.y+dy, B.x, B.y+dy)+hit(A.x, A.y+dy, B.x, B.y+dy);
        hs.push(['c', (A.x+B.x)/2, (A.y+B.y)/2+dy]); bb.push({ x:A.x, y:A.y+dy }, { x:B.x, y:B.y+dy }); }
      s+=ln(A.x, A.y, B.x, B.y)+hit(A.x, A.y, B.x, B.y);
      hs.push(['a', A.x, A.y], ['b', B.x, B.y]); bb.push(A, B); break; }
    case 'fib': {
      const x0=Math.min(A.x, B.x), x1=Math.max(A.x, B.x, x0+1), lv=DR_FIB.map(([l, c])=>({ l, c, px:d.b.px+(d.a.px-d.b.px)*l })).map(o=>({ ...o, y:M.y(o.px) }));
      for (let i=0; i<lv.length-1; i++){ const u=lv[i], v=lv[i+1]; if (drOk(u.y) && drOk(v.y)) s+=`<path class="dr-band" d="M${f(x0)} ${f(u.y)}H${f(x1)}V${f(v.y)}H${f(x0)}Z" style="fill:${v.c}"/>`; }
      s+=ln(A.x, A.y, B.x, B.y, 'dr-ln dr-diag');
      const lx=x0+4>W-60 ? x1-4 : x0+4, an=x0+4>W-60 ? 'end' : 'start';
      for (const o of lv){ if (!drOk(o.y)) continue; s+=`<path class="dr-ln" d="M${f(x0)} ${f(o.y)}H${f(x1)}" style="stroke:${o.c};--w:${sw}px"${da}/>`+hit(x0, o.y, x1, o.y);
        s+=`<text class="dr-lb" x="${f(Math.max(4, lx))}" y="${f(o.y-3)}" text-anchor="${an}">${drEsc(String(o.l))} (${drEsc(drP(o.px))})</text>`; }
      hs.push(['a', A.x, A.y], ['b', B.x, B.y]); bb.push(A, B); break; }
    case 'text': {
      const fs=10+(d.w || 2)*2, txt=d.txt || (P || (DR.ed && DR.ed.id===d.id) ? '…' : ''), w=Math.max(16, txt.length*fs*0.6+8), h=fs+8;
      s+=`<rect class="dr-fill dr-tbg" x="${f(A.x-4)}" y="${f(A.y-h+4)}" width="${f(w)}" height="${f(h)}" rx="4"/>`;
      if (sel) s+=`<rect class="dr-selbox" x="${f(A.x-5)}" y="${f(A.y-h+3)}" width="${f(w+2)}" height="${f(h+2)}" rx="4" style="stroke:${col}"/>`;
      s+=`<text class="dr-note" x="${f(A.x)}" y="${f(A.y)}" style="fill:${col};font-size:${fs}px">${drEsc(txt)}</text>`;
      bb.push({ x:A.x, y:A.y-h }, { x:A.x+w, y:A.y }); break; }
    case 'measure': {
      const up=d.b.px>=d.a.px, c=up ? 'var(--gain)' : 'var(--loss)', x0=Math.min(A.x, B.x), y0=Math.min(A.y, B.y), w=Math.abs(B.x-A.x), h=Math.abs(B.y-A.y), cx=(A.x+B.x)/2, cy=(A.y+B.y)/2;
      s+=`<path class="dr-fill dr-msr" d="M${f(x0)} ${f(y0)}h${f(w)}v${f(h)}h${f(-w)}Z" style="fill:${c}"/>`;
      const ah=Math.min(6, h/2), aw=Math.min(6, w/2);
      s+=`<path class="dr-arw" d="M${f(cx)} ${f(A.y)}V${f(B.y)}M${f(cx-ah)} ${f(B.y+(up ? ah : -ah))}L${f(cx)} ${f(B.y)}L${f(cx+ah)} ${f(B.y+(up ? ah : -ah))}M${f(A.x)} ${f(cy)}H${f(B.x)}M${f(B.x+(B.x>A.x ? -aw : aw))} ${f(cy-aw)}L${f(B.x)} ${f(cy)}L${f(B.x+(B.x>A.x ? -aw : aw))} ${f(cy+aw)}" style="stroke:${c}"/>`;
      s+=`<path class="dr-hit" d="M${f(x0)} ${f(y0)}h${f(w)}v${f(h)}h${f(-w)}Z"/>`;
      const dp=d.b.px-d.a.px, r=d.a.px ? dp/d.a.px : 0, nb=drBars(M, d.a.t, d.b.t);
      const l1=`${dp>=0 ? '+' : '−'}${drP(Math.abs(dp))} (${drPct(r)})`, l2=`${Math.abs(nb)} ${drL('bars','mum')} · ${drDur(d.b.t-d.a.t)}`;
      const tw=Math.max(l1.length, l2.length)*6.4+14, below=up ? y0-38<2 : y0+h+40<H, ly=below ? y0+h+6 : y0-38, tx=Math.max(2, Math.min(W-tw-2, cx-tw/2));
      s+=`<rect class="dr-tag" x="${f(tx)}" y="${f(ly)}" width="${f(tw)}" height="32" rx="4" style="fill:${c}"/><text class="dr-tt" x="${f(tx+tw/2)}" y="${f(ly+13)}" text-anchor="middle" style="fill:var(--on-trade)">${drEsc(l1)}</text><text class="dr-tt" x="${f(tx+tw/2)}" y="${f(ly+26)}" text-anchor="middle" style="fill:var(--on-trade)">${drEsc(l2)}</text>`;
      if (!tmp) hs.push(['a', A.x, A.y], ['b', B.x, B.y]); bb.push(A, B, { x:cx, y:ly }, { x:cx, y:ly+32 }); break; }
    case 'long': case 'short': {
      const T=XY(d.b), Sx=XY(d.c), x0=Math.min(A.x, T.x), x1=Math.max(A.x+4, T.x), ye=A.y, yt=T.y, ys=Sx.y;
      if (!drOk(yt) || !drOk(ys)) return '';
      s+=`<path class="dr-fill dr-pz" d="M${f(x0)} ${f(Math.min(ye, yt))}H${f(x1)}V${f(Math.max(ye, yt))}H${f(x0)}Z" style="fill:var(--gain)"/>`;
      s+=`<path class="dr-fill dr-pz" d="M${f(x0)} ${f(Math.min(ye, ys))}H${f(x1)}V${f(Math.max(ye, ys))}H${f(x0)}Z" style="fill:var(--loss)"/>`;
      s+=`<path class="dr-ln" d="M${f(x0)} ${f(ye)}H${f(x1)}" style="stroke:var(--ink-2);--w:1.4px"/>`;
      s+=`<path class="dr-hit" d="M${f(x0)} ${f(Math.min(yt, ys))}H${f(x1)}V${f(Math.max(yt, ys))}H${f(x0)}Z"/>`;
      const e=d.a.px, rw=d.b.px-e, rk=d.c.px-e, rr=Math.abs(rk)>0 ? Math.abs(rw)/Math.abs(rk) : 0, cx=(x0+x1)/2;
      const tUp=yt<ye, sUp=ys<ye;
      s+=tag(cx, tUp ? Math.min(ye, yt)-10 : Math.max(ye, yt)+10, `${drL('Target','Hedef')} ${drP(d.b.px)} (${drPct(e ? rw/e : 0)})`, 'var(--gain)', 'var(--on-trade)', 'middle');
      s+=tag(cx, sUp ? Math.min(ye, ys)-10 : Math.max(ye, ys)+10, `${drL('Stop','Stop')} ${drP(d.c.px)} (${drPct(e ? rk/e : 0)})`, 'var(--loss)', 'var(--on-trade)', 'middle');
      s+=tag(x1+4>W-110 ? x0-4 : x1+4, ye, `${d.tool==='long' ? drL('Long','Uzun') : drL('Short','Kısa')} ${drP(e)} · ${drL('R:R','R/Ö')} ${rr.toFixed(2)}`, 'var(--surface-2)', 'var(--ink)', x1+4>W-110 ? 'end' : 'start');
      hs.push(['a', x0, ye], ['b', x0, yt], ['c', x0, ys], ['w', x1, ye]); bb.push({ x:x0, y:Math.min(yt, ys, ye)-20 }, { x:x1, y:Math.max(yt, ys, ye)+20 }); break; }
    default: return '';
  }
  if (P && P.step>=1 && DR_TOOL[d.tool].pts>=2 && Math.hypot((B || A).x-A.x, (B || A).y-A.y)<1) s+=`<circle class="dr-dot" cx="${f(A.x)}" cy="${f(A.y)}" r="3.5" style="fill:${col}"/>`;
  let h='';
  for (const [k, x, y] of hs){ if (!drOk(x) || !drOk(y)) continue; h+=`<circle class="dr-h" cx="${f(x)}" cy="${f(y)}" r="4.5" style="stroke:${col}"/><circle class="dr-hh" data-dr="${drEsc(d.id)}" data-dr-h="${k}" cx="${f(x)}" cy="${f(y)}" r="11"/>`; }
  if (sel && !P && bb.length){ const xs=bb.map(p=>p.x).filter(drOk), ys=bb.map(p=>p.y).filter(drOk); DR.bb={ x0:Math.max(0, Math.min(...xs)), x1:Math.min(W, Math.max(...xs)), y0:Math.max(0, Math.min(...ys)), y1:Math.min(H, Math.max(...ys)), tool:d.tool, hs:hs.map(q=>[q[1], q[2]]) }; }
  return `<g class="dr-g${sel ? ' dr-sel' : ''}${P ? ' dr-new' : ''}${tmp ? ' dr-tmp' : ''}" ${P || tmp ? '' : `data-dr="${drEsc(d.id)}"`}>${s}${h}</g>`;
}
// ---------------------------------------------------------------- placing, selecting, dragging
function drNewDrawing(tool, s, M){
  const C=drC(), d={ id:drId(), tool, a:{ t:s.t, px:s.px }, col:drCol(C && C.drCol), w:2 };
  if (tool==='hline' || tool==='hray') d.col=C && C.drCol ? drCol(C.drCol) : DR_COLS[1][0];
  if (DR_TOOL[tool].pts>=2) d.b={ t:s.t, px:s.px };
  if (tool==='long' || tool==='short'){ const span=Math.max(1e-12, (M.hi-M.lo) || s.px*0.02), risk=span*0.07, sg=tool==='long' ? 1 : -1;
    const nb=Math.max(8, Math.round(((M.bars && M.bars.length) || 80)*0.16));
    d.b={ t:drShiftT(M, s.t, nb), px:s.px+sg*risk*2 }; d.c={ t:s.t, px:Math.max(s.px*0.001, s.px-sg*risk) }; }
  return d; }
function drSetPt(P, s, M){ const d=P.d, k=['a','b','c'][P.step];
  if (d.tool==='long' || d.tool==='short'){ const o=P.o; d.a={ t:s.t, px:s.px }; d.b={ t:drShiftT(M, s.t, o.nb), px:s.px+o.db }; d.c={ t:s.t, px:Math.max(s.px*0.001, s.px+o.dc) }; return; }
  d[k]={ t:s.t, px:s.px }; if (k==='c') d.c2=1; }
function drPlaceDown(e, p, M, svg, tmp){
  const s=drSnap(p, e, M); let P=DR.place;
  try { svg.setPointerCapture(e.pointerId); } catch (z){}
  if (!P){ const tool=tmp ? 'measure' : DR.tool, d=drNewDrawing(tool, s, M);
    P=DR.place={ d, sym:drSym(M), step:DR_TOOL[tool].pts>=2 ? 1 : 0, down:true, pid:e.pointerId, x0:p.x, y0:p.y, moved:false, second:false, tmp:!!tmp };
    if (tool==='long' || tool==='short') P.o={ nb:drBars(M, d.a.t, d.b.t), db:d.b.px-d.a.px, dc:d.c.px-d.a.px };
  } else { P.down=true; P.pid=e.pointerId; P.x0=p.x; P.y0=p.y; P.moved=false; drSetPt(P, s, M); }
  drKick(); drListen(); }
function drFinish(){ const P=DR.place; if (!P) return; DR.place=null; const d=P.d; delete d.c2;
  if (P.tmp){ DR.tmp=d; drKick(); drListen(); return; }
  const list=drList(P.sym, true); drPushUndo(P.sym); list.push(d); DR.sel=d.id; DR.just=Date.now();
  if (!DR.keep) DR.tool=null;
  if (d.tool==='text') drEdOpen(d.id, true);
  drCommit(); }
function drAbort(){ if (DR.drag && DR.drag.moved){ const D=DR.drag, L=drList(D.sym, false), i=L.findIndex(x=>x.id===D.id); if (i>=0) L[i]=JSON.parse(D.orig); DR.undo.pop(); }
  DR.drag=null; DR.place=null; drKick(); drListen(); }
function drDown(e){
  const t=e.target; if (!t || !t.closest) return;
  if (e.pointerType==='touch') DR.touch.add(e.pointerId);
  if (DR.tmp && !DR.place){ DR.tmp=null; drKick(); }
  const host=drHost(); if (!host) return;
  if (!host.contains(t)){                       // a press elsewhere on the page lets go of the selection
    if (DR.ed && !t.closest('.dr-ed')) drEdDone(true);
    if (DR.sel && !t.closest('#dr-pal') && !t.closest('#cu-layer')){ DR.sel=null; drKick(); drListen(); }
    return; }
  const svg=drSvg(), M=drM(); if (!svg || !M || !svg.contains(t)) return;   // the legend, buttons and toolbar over the chart
  if (DR.ed){ drEdDone(true); return; }
  if (e.pointerType==='touch' && DR.touch.size>1){ if (DR.drag || (DR.place && DR.place.down)) drAbort(); return; }  // two fingers: the chart pinches
  if (e.pointerType==='mouse' && e.button!==0) return;
  DR.ptr=e.pointerType || 'mouse';
  const p=drPt(e, svg, M), W=M.plotW || (M.W-M.pad), inMain=p.x>=0 && p.x<=W && p.y>=0 && p.y<=M.mainH;
  if (DR.tool){ if (inMain) drPlaceDown(e, p, M, svg, false); return; }
  if (!inMain) return;
  if (e.shiftKey && DR.ptr==='mouse' && !t.closest('[data-dr]')){ drPlaceDown(e, p, M, svg, true); return; }
  const h=t.closest('[data-dr]');
  if (h && svg.contains(h)){ const sym=drSym(M), d=drFind(h.getAttribute('data-dr'), sym);
    if (d){ DR.sel=d.id; DR.drag={ id:d.id, sym, h:h.getAttribute('data-dr-h') || 'move', pid:e.pointerId, x0:p.x, y0:p.y, moved:false, orig:JSON.stringify(d), snap:drSnapJ(sym), touch:e.pointerType==='touch' };
      try { svg.setPointerCapture(e.pointerId); } catch (z){}
      drKick(); drListen(); return; } }
  if (DR.sel){ DR.sel=null; drKick(); drListen(); }   // an empty spot: let go, and the chart pans as usual
}
function drMove(e){
  const M=drM(), svg=drSvg(); if (!M || !svg) return;
  const D=DR.drag;
  if (D){ if (e.pointerId!==D.pid) return; const p=drPt(e, svg, M);
    if (!D.moved){ if (Math.hypot(p.x-D.x0, p.y-D.y0)<(D.touch ? 6 : 3)) return; D.moved=true; drPushUndo(D.sym, D.snap); }
    const d=drFind(D.id, D.sym); if (!d) return; drApply(d, D, p, e, M); drKick(); return; }
  const P=DR.place; if (!P) return;
  if (P.down ? e.pointerId!==P.pid : e.pointerType==='touch') return;
  if (!P.down && P.step===0) return;
  const p=drPt(e, svg, M);
  if (P.down && !P.moved && Math.hypot(p.x-P.x0, p.y-P.y0)>(e.pointerType==='touch' ? 8 : 4)) P.moved=true;
  drSetPt(P, drSnap(p, e, M), M); drKick(); }
function drApply(d, D, p, e, M){
  const o=JSON.parse(D.orig), h=D.h;
  if (h==='move'){ const db=Math.round((p.x-D.x0)/drCw(M)), dy=p.y-D.y0;
    for (const k of ['a','b','c']) if (o[k]) d[k]=drShift(M, o[k], db, dy);
    return; }
  const s=drSnap(p, e, M), pt={ t:s.t, px:s.px };
  if (d.tool==='long' || d.tool==='short'){
    if (h==='a'){ const nb=drBars(M, o.a.t, s.t); d.a=pt; d.b={ t:drShiftT(M, o.b.t, nb), px:o.b.px }; d.c={ t:s.t, px:o.c.px }; }
    else if (h==='b') d.b={ t:o.b.t, px:s.px };
    else if (h==='c') d.c={ t:o.c.t, px:s.px };
    else if (h==='w'){ const ia=M.t2a ? M.t2a(o.a.t) : 0, is=M.t2a ? M.t2a(s.t) : 1; d.b={ t:is<=ia+1 ? drShiftT(M, o.a.t, 1) : s.t, px:o.b.px }; }
    return; }
  if (h==='ab'){ d.a={ t:s.t, px:o.a.px }; d.b={ t:o.b.t, px:s.px }; return; }
  if (h==='ba'){ d.b={ t:s.t, px:o.b.px }; d.a={ t:o.a.t, px:s.px }; return; }
  if (h==='a' || h==='b' || h==='c') d[h]=pt; }
function drUp(e){
  if (e.pointerType==='touch') DR.touch.delete(e.pointerId);
  const D=DR.drag;
  if (D && e.pointerId===D.pid){ DR.drag=null;
    if (e.type==='pointercancel'){ if (D.moved){ const L=drList(D.sym, false), i=L.findIndex(x=>x.id===D.id); if (i>=0) L[i]=JSON.parse(D.orig); DR.undo.pop(); } drKick(); drListen(); return; }
    if (D.moved){ DR.just=Date.now(); const d=drFind(D.id, D.sym); let o=null; try { o=JSON.parse(D.orig); } catch (z){} if (d && o && o.a && o.a.px!==d.a.px) drAlMove(D.sym, d, o.a.px); drCommit(); if (d && d.al!=null) drAlRender(); return; }
    const d=drFind(D.id, D.sym), now=Date.now();
    if (d && d.tool==='text' && DR.lastTap && DR.lastTap.id===d.id && now-DR.lastTap.t<450){ DR.lastTap=null; drEdOpen(d.id, false); }
    else DR.lastTap={ id:D.id, t:now };
    drKick(); drListen(); return; }
  const P=DR.place;
  if (P && P.down && e.pointerId===P.pid){ P.down=false;
    if (e.type==='pointercancel'){ drAbort(); return; }
    const pts=DR_TOOL[P.d.tool].pts, M=drM();
    if (pts===1){ drFinish(); return; }
    if (P.step===1){
      const A=M ? { x:M.t2x(P.d.a.t), y:M.y(P.d.a.px) } : null, B=M ? { x:M.t2x(P.d.b.t), y:M.y(P.d.b.px) } : null, apart=A && B && Math.hypot(A.x-B.x, A.y-B.y)>=4;
      if (P.moved || P.second){ if (!apart){ P.second=true; drKick(); return; }       // the same spot twice: keep waiting for a real end point
        if (pts===2){ drFinish(); return; }
        P.step=2; P.second=false; P.d.c={ t:P.d.b.t, px:P.d.b.px }; drKick(); return; }
      P.second=true; drKick(); return; }
    if (P.step===2){ drFinish(); return; }
  }
}
document.addEventListener('pointerdown', drDown, true);
document.addEventListener('pointerup', e=>{ if (e.pointerType==='touch') DR.touch.delete(e.pointerId); }, true);
document.addEventListener('pointercancel', e=>{ if (e.pointerType==='touch') DR.touch.delete(e.pointerId); }, true);
// a quick second click while placing must not reset the chart (chart.js resets the view on double-click)
document.addEventListener('dblclick', e=>{ const t=e.target; if (!t || !t.closest || !t.closest('#tr-chart')) return;
  if (DR.tool || DR.place || Date.now()-DR.just<700 || t.closest('.ch-dr [data-dr]') || t.closest('.dr-ov')) e.stopPropagation(); }, true);
// ---------------------------------------------------------------- the note editor
function drEdOpen(id, isNew){ const a=document.activeElement; DR.ed={ id, isNew:!!isNew, ret:a && a!==document.body ? a : null, focus:true }; drKick(); drListen(); }
function drEdDone(ok){ const E=DR.ed; if (!E) return; DR.ed=null;
  const sym=drSym(drM()), d=drFind(E.id, sym), inp=document.getElementById('dr-ed-i'), v=inp ? inp.value.replace(/\s+/g, ' ').trim().slice(0, 140) : (d && d.txt) || '';
  if (d){ if (ok && v){ if (!E.isNew && d.txt!==v) drPushUndo(sym); d.txt=v; }
    else if (E.isNew){ drSetList(sym, drList(sym, false).filter(x=>x.id!==d.id)); DR.undo.pop(); DR.sel=null; }
    else if (ok && !v){ drPushUndo(sym); drSetList(sym, drList(sym, false).filter(x=>x.id!==d.id)); DR.sel=null; } }
  drCommit();
  const back=E.ret && E.ret.isConnected ? E.ret : (typeof CH==='object' && CH && CH.wrap);
  try { back && back.focus({ preventScroll:true }); } catch (z){} }
// ---------------------------------------------------------------- palette (above the chart), toolbar and editor (over it)
const DR_IC = (()=>{ const sv=(b, fill)=>`<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`, dot=(x, y)=>`<circle cx="${x}" cy="${y}" r="1.7" fill="currentColor" stroke="none"/>`;
  return {
    cursor:sv('<path d="M4.5 2.5l9 6.2-4.1.9 2.3 4.6-1.8.9-2.3-4.6-3.1 2.8z" fill="currentColor" stroke="none"/>'),
    trend:sv('<path d="M4 14L14 4"/>'+dot(4, 14)+dot(14, 4)),
    ray:sv('<path d="M4 14L17 3"/>'+dot(4, 14)+dot(10, 8.8)),
    ext:sv('<path d="M1 17L17 1"/>'+dot(6, 12)+dot(12, 6)),
    hline:sv('<path d="M1 9H17"/>'+dot(9, 9)),
    hray:sv('<path d="M4 9H17"/>'+dot(4, 9)),
    vline:sv('<path d="M9 1V17"/>'+dot(9, 9)),
    chan:sv('<path d="M2 11L11 3M7 15L16 7"/><path d="M4.5 13L13.5 5" stroke-dasharray="1.5 2"/>'),
    rect:sv('<rect x="3" y="4.5" width="12" height="9" rx="1"/>'),
    fib:sv('<path d="M2 3.5H16M2 7H16M2 10H16M2 14.5H16"/><path d="M4 14.5L14 3.5" stroke-dasharray="1.6 2"/>'),
    text:sv('<path d="M4 4.5H14M9 4.5V15"/>'),
    measure:sv('<path d="M9 2.5V15.5M6.5 5L9 2.5 11.5 5M6.5 13L9 15.5 11.5 13M2.5 9H15.5"/>'),
    long:sv('<rect x="3" y="2.5" width="12" height="6.5" rx="1"/><rect x="3" y="9" width="12" height="6.5" rx="1" stroke-dasharray="1.6 1.8"/><path d="M9 7.5V4M7.2 5.6L9 3.8l1.8 1.8"/>'),
    short:sv('<rect x="3" y="2.5" width="12" height="6.5" rx="1" stroke-dasharray="1.6 1.8"/><rect x="3" y="9" width="12" height="6.5" rx="1"/><path d="M9 10.5V14M7.2 12.4L9 14.2l1.8-1.8"/>'),
    magnet:sv('<path d="M4.5 3v6a4.5 4.5 0 0 0 9 0V3"/><path d="M4.5 6h3M10.5 6h3"/><path d="M7.5 3v6a1.5 1.5 0 0 0 3 0V3"/>'),
    keep:sv('<rect x="4" y="8" width="10" height="7.5" rx="1.5"/><path d="M6.2 8V5.8a2.8 2.8 0 0 1 5.6 0V8"/>'),
    eye:sv('<path d="M1.5 9S4.3 4 9 4s7.5 5 7.5 5-2.8 5-7.5 5S1.5 9 1.5 9z"/><circle cx="9" cy="9" r="2.2"/>'),
    eyex:sv('<path d="M1.5 9S4.3 4 9 4s7.5 5 7.5 5-2.8 5-7.5 5S1.5 9 1.5 9z"/><path d="M3 15L15 3"/>'),
    undo:sv('<path d="M6 4L2.5 7.5 6 11"/><path d="M3 7.5h7.5a4.5 4.5 0 0 1 0 9H8"/>'),
    redo:sv('<path d="M12 4l3.5 3.5L12 11"/><path d="M15 7.5H7.5a4.5 4.5 0 0 0 0 9H10"/>'),
    trash:sv('<path d="M3 5h12M7 5V3.2h4V5M4.5 5l.8 10.5h7.4L13.5 5M7.5 8v5M10.5 8v5"/>'),
    close:sv('<path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/>'),
    dash:sv('<path d="M2 9h3M7.5 9h3M13 9h3"/>'),
    copy:sv('<rect x="6" y="6" width="9" height="9" rx="1.5"/><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12"/>'),
    bell:sv('<path d="M5 12.5V8a4 4 0 0 1 8 0v4.5l1.5 1.5h-11z"/><path d="M7.5 15.5a1.6 1.6 0 0 0 3 0"/>'),
    edit:sv('<path d="M3 15l1-4L12 3l3 3-8 8z"/><path d="M10.5 4.5l3 3"/>'),
  }; })();
function drCoarse(){ try { return DR.ptr==='touch' || (typeof matchMedia==='function' && matchMedia('(pointer:coarse)').matches && DR.ptr!=='mouse'); } catch (e){ return false; } }
function drHint(){ const tch=drCoarse(), esc=tch ? '' : ' '+drL('Esc cancels.','Esc iptal eder.');
  if (DR.place){ const P=DR.place, tl=P.d.tool;
    if (P.step===1) return (P.second || !P.down) ? (tch ? drL('Now tap the end point.','Şimdi bitiş noktasına dokun.') : drL('Now click the end point.','Şimdi bitiş noktasına tıkla.'))+esc : drL('Let go at the end point.','Bitiş noktasında bırak.');
    if (P.step===2) return (tch ? drL('Now tap where the parallel line goes.','Şimdi paralel çizginin geçeceği yere dokun.') : drL('Move to set the channel width, then click.','Kanal genişliğini ayarlamak için imleci oynat, sonra tıkla.'))+esc;
    return ''; }
  if (DR.tool){ const T=DR_TOOL[DR.tool];
    if (T.id==='long' || T.id==='short') return (tch ? drL('Tap the entry price; then drag the target and stop handles.','Giriş fiyatına dokun; sonra hedef ve stop tutamaçlarını sürükle.') : drL('Click the entry price; then drag the target and stop handles.','Giriş fiyatına tıkla; sonra hedef ve stop tutamaçlarını sürükle.'))+esc;
    if (T.id==='text') return (tch ? drL('Tap where the note goes.','Notun gideceği yere dokun.') : drL('Click where the note goes.','Notun gideceği yere tıkla.'))+esc;
    if (T.pts===1) return (tch ? drL('Tap the chart to place it.','Yerleştirmek için grafiğe dokun.') : drL('Click the chart to place it.','Yerleştirmek için grafiğe tıkla.'))+esc;
    if (T.pts===3) return (tch ? drL('Tap two points for the base line, then a third for the width.','Taban çizgisi için iki noktaya, genişlik için üçüncüsüne dokun.') : drL('Click two points for the base line, then a third for the width.','Taban çizgisi için iki noktaya, genişlik için üçüncüsüne tıkla.'))+esc;
    return (tch ? drL('Tap the start point, then the end point.','Başlangıç noktasına, sonra bitiş noktasına dokun.') : drL('Click the start and end points, or drag.','Başlangıç ve bitiş noktalarına tıkla ya da sürükle.'))+esc; }
  if (DR.sel) return tch ? drL('Drag the drawing or its handles. × removes it.','Çizimi ya da tutamaçlarını sürükle. × siler.') : drL('Drag the drawing or its handles. Delete removes it.','Çizimi ya da tutamaçlarını sürükle. Delete tuşu siler.');
  return tch ? drL('Pick a tool, then tap the chart.','Bir araç seç, sonra grafiğe dokun.') : drL('Pick a tool. Shift+drag on the chart measures quickly.','Bir araç seç. Grafikte Shift+sürükle hızlı ölçer.'); }
function drPalHTML(sym){
  const C=drC() || {}, n=drList(sym, false).length;
  const b=(attr, ic, en, tr, pressed, dis)=>`<button type="button" class="dr-b" ${attr} aria-label="${drEsc(drL(en, tr))}" title="${drEsc(drL(en, tr))}"${pressed==null ? '' : ` aria-pressed="${pressed ? 'true' : 'false'}"`}${dis ? ' disabled' : ''}>${ic}</button>`;
  let h=b('data-dr-tool=""', DR_IC.cursor, 'Cursor: no tool', 'İmleç: araç yok', !DR.tool), g=0;
  for (const t of DR_TOOLS){ if (t.g!==g){ h+='<span class="dr-sp" aria-hidden="true"></span>'; g=t.g; } const k=t.key ? ` (Alt+${t.key})` : '';
    h+=b(`data-dr-tool="${t.id}"`, DR_IC[t.id], t.n[0]+k, t.n[1]+k, DR.tool===t.id); }
  h+='<span class="dr-sp" aria-hidden="true"></span>';
  h+=b('data-dr-act="magnet"', DR_IC.magnet, 'Magnet: snap to open, high, low, close (hold Ctrl to flip)', 'Mıknatıs: açılış, yüksek, düşük, kapanışa yapıştır (Ctrl ile tersine çevir)', !!C.magnet);
  h+=b('data-dr-act="keep"', DR_IC.keep, 'Keep the tool after drawing', 'Çizdikten sonra araç seçili kalsın', DR.keep);
  h+=b('data-dr-act="hide"', C.drHide ? DR_IC.eyex : DR_IC.eye, 'Hide the drawings', 'Çizimleri gizle', !!C.drHide);
  h+=b('data-dr-act="undo"', DR_IC.undo, 'Undo (Ctrl+Z)', 'Geri al (Ctrl+Z)', null, !DR.undo.length);
  h+=b('data-dr-act="redo"', DR_IC.redo, 'Redo (Ctrl+Shift+Z)', 'Yinele (Ctrl+Shift+Z)', null, !DR.redo.length);
  h+=b('data-dr-act="clear"', DR_IC.trash, `Remove all drawings on ${sym}`, `${sym} üzerindeki tüm çizimleri sil`, null, !n);
  h+=b('data-dr-act="close"', DR_IC.close, 'Close the drawing tools', 'Çizim araçlarını kapat', null);
  return h; }
function drSync(M){
  drCss();
  const host=drHost(); if (!host || !host.parentNode) return;
  const sym=drSym(M), C=drC() || {};
  // palette: right above the chart (outside #tr-chart, whose content chart.js owns)
  let pal=document.getElementById('dr-pal');
  if (!DR.open){ if (pal){ const f=pal.contains(document.activeElement); pal.remove(); DR.palSig=''; if (f){ const b=document.querySelector('[data-cu="draw"]'); try { (b || (typeof CH==='object' && CH && CH.wrap) || host).focus({ preventScroll:true }); } catch (z){} } } }
  else {
    if (!pal || pal.nextElementSibling!==host){ if (pal) pal.remove(); pal=document.createElement('div'); pal.id='dr-pal'; pal.className='dr-pal'; pal.setAttribute('role', 'toolbar'); pal.innerHTML='<div class="dr-bs"></div><span class="dr-hint" role="status"></span>'; host.parentNode.insertBefore(pal, host); DR.palSig=''; DR.hintTxt=''; }
    pal.setAttribute('aria-label', drL('Drawing tools', 'Çizim araçları'));
    const sig=[typeof ST==='object' && ST ? ST.lang : '', sym, DR.tool, !!C.magnet, DR.keep, !!C.drHide, DR.undo.length>0, DR.redo.length>0, drList(sym, false).length>0].join('|');
    if (sig!==DR.palSig){ DR.palSig=sig; const bs=pal.querySelector('.dr-bs'), a=document.activeElement, fk=a && bs.contains(a) ? (a.getAttribute('data-dr-tool')!=null ? `[data-dr-tool="${a.getAttribute('data-dr-tool')}"]` : `[data-dr-act="${a.getAttribute('data-dr-act')}"]`) : null;
      bs.innerHTML=drPalHTML(sym); if (fk){ const n=bs.querySelector(fk); if (n && !n.disabled) n.focus({ preventScroll:true }); else pal.querySelector('.dr-b').focus({ preventScroll:true }); } }
    const ht=drHint(); if (ht!==DR.hintTxt){ DR.hintTxt=ht; pal.querySelector('.dr-hint').textContent=ht; }
  }
  // the chart takes no page scroll gestures while drawing
  const svg=drSvg(); if (svg){ const on=!!(DR.tool || DR.sel || DR.drag || DR.place); if (svg.classList.contains('dr-on')!==on) svg.classList.toggle('dr-on', on); const tl=!!(DR.tool || DR.place); if (svg.classList.contains('dr-tool')!==tl) svg.classList.toggle('dr-tool', tl); }
  if (!host.__drT){ host.__drT=1;
    host.addEventListener('touchstart', e=>{ const t=e.target; if (!e.cancelable || !t || !t.closest || !t.closest('svg.chart')) return; if (DR.tool || DR.place || t.closest('.ch-dr [data-dr]')) e.preventDefault(); }, { passive:false });
    host.addEventListener('touchmove', e=>{ if (e.cancelable && (DR.drag || (DR.place && DR.place.down))) e.preventDefault(); }, { passive:false }); }
  drTb(M, sym);
}
function drTbHTML(d, sym){
  const lines=!['text','long','short','measure'].includes(d.tool), b=(attr, ic, en, tr, pressed, txt)=>`<button type="button" class="dr-b dr-tbb${txt ? ' dr-tx' : ''}" ${attr} aria-label="${drEsc(drL(en, tr))}" title="${drEsc(drL(en, tr))}"${pressed==null ? '' : ` aria-pressed="${pressed ? 'true' : 'false'}"`}>${ic}${txt ? `<span>${drEsc(txt)}</span>` : ''}</button>`;
  let h='';
  if (!['long','short','measure'].includes(d.tool)){
    h+=`<button type="button" class="dr-b dr-tbb" data-dr-tb="cols" aria-expanded="${DR.colOpen ? 'true' : 'false'}" aria-label="${drEsc(drL('Colour', 'Renk'))}" title="${drEsc(drL('Colour', 'Renk'))}"><span class="dr-cdot" style="--c:${drCol(d.col)}"></span></button>`;
    const wv=d.w || 2;
    h+=b('data-dr-tb="w"', `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3 9H15" stroke="currentColor" stroke-width="${DR_SW[wv]+0.4}" stroke-linecap="round"/></svg>`, d.tool==='text' ? `Text size: ${wv} of 3` : `Line width: ${wv} of 3`, d.tool==='text' ? `Yazı boyutu: ${wv} / 3` : `Çizgi kalınlığı: ${wv} / 3`, null);
  }
  if (lines) h+=b('data-dr-tb="dash"', DR_IC.dash, 'Dashed line', 'Kesikli çizgi', !!d.dash);
  if ((d.tool==='hline' || d.tool==='hray') && typeof alAdd==='function'){ const al=drAlertFor(sym, d);
    h+=b('data-dr-tb="al"', DR_IC.bell, al ? 'Remove the price alert at this line' : 'Alert me at this price', al ? 'Bu çizgideki fiyat alarmını kaldır' : 'Bu fiyatta alarm kur', al ? true : false, al ? drL('Alert on','Alarm açık') : drL('Alert','Alarm')); }
  if (d.tool==='text') h+=b('data-dr-tb="edit"', DR_IC.edit, 'Edit the text', 'Metni düzenle', null);
  h+=b('data-dr-tb="dup"', DR_IC.copy, 'Duplicate', 'Çoğalt', null);
  h+=b('data-dr-tb="del"', DR_IC.trash, 'Delete the drawing (Delete)', 'Çizimi sil (Delete)', null);
  if (DR.colOpen && !['long','short','measure'].includes(d.tool)){
    h+=`<div class="dr-cols" role="group" aria-label="${drEsc(drL('Colours', 'Renkler'))}">`;
    for (const [c, en, tr] of DR_COLS) h+=`<button type="button" class="dr-sw" data-dr-tb="col" data-c="${c}" style="--c:${c}" aria-label="${drEsc(drL('Colour: '+en, 'Renk: '+tr))}" title="${drEsc(drL('Colour: '+en, 'Renk: '+tr))}" aria-pressed="${drCol(d.col).toLowerCase()===c ? 'true' : 'false'}"></button>`;
    h+=`<label class="dr-cc" title="${drEsc(drL('Other colour', 'Başka renk'))}"><span class="dr-vh">${drEsc(drL('Other colour', 'Başka renk'))}</span><input type="color" data-dr-tb="cc" value="${drCol(d.col)}"></label></div>`; }
  return h; }
function drTb(M, sym){
  const wrap=typeof CH==='object' && CH && CH.wrap; if (!wrap || !wrap.isConnected || !M) return;
  let ov=null; for (const c of wrap.children) if (c.classList && c.classList.contains('dr-ov')){ ov=c; break; }
  if (!ov){ ov=document.createElement('div'); ov.className='dr-ov'; ov.innerHTML='<div class="dr-tb" role="toolbar" hidden></div><div class="dr-edw"></div>'; wrap.appendChild(ov); DR.tbSig=''; DR.edSig=''; }
  const tb=ov.querySelector('.dr-tb'), edw=ov.querySelector('.dr-edw'), C=drC() || {};
  const d=DR.sel && !C.drHide ? drFind(DR.sel, sym) : null, show=!!(d && !DR.drag && !DR.place && !DR.ed && DR.bb);
  const E=DR.ed, ed=E ? drFind(E.id, sym) : null, W=M.plotW || (M.W-M.pad);
  let sx=1, sy=1; if (show || ed){ const svg=drSvg(), r=svg ? svg.getBoundingClientRect() : null; if (r && M.W) sx=r.width/M.W || 1; if (r && M.H) sy=r.height/M.H || 1; }
  if (!show){ if (!tb.hidden){ const f=tb.contains(document.activeElement); tb.hidden=true; DR.tbSig=''; if (f){ try { wrap.focus({ preventScroll:true }); } catch (z){} } } }
  else {
    tb.setAttribute('aria-label', drL('Selected drawing', 'Seçili çizim'));
    if (DR.colFor!==d.id){ DR.colFor=d.id; DR.colOpen=false; }
    const sig=[d.id, d.tool, d.col, d.w, d.dash, drAlSig(sym), typeof ST==='object' && ST ? ST.lang : '', DR.colOpen].join('|');
    if (sig!==DR.tbSig){ DR.tbSig=sig; const a=document.activeElement, fk=a && tb.contains(a) ? a.getAttribute('data-dr-tb')+'|'+(a.getAttribute('data-c') || '') : null;
      tb.innerHTML=drTbHTML(d, sym); tb.hidden=false;
      if (fk){ const [k, c]=fk.split('|'), n=tb.querySelector(c ? `[data-dr-tb="${k}"][data-c="${c}"]` : `[data-dr-tb="${k}"]`); if (n) n.focus({ preventScroll:true }); } }
    const bb=DR.bb, tw=tb.offsetWidth || 200, th=tb.offsetHeight || 34, maxX=Math.max(4, W*sx-tw-4);
    // above the drawing, else below it, else the top or bottom edge of the pane: whichever covers the fewest handles
    const left=Math.max(4, Math.min(maxX, (bb.x0+bb.x1)/2*sx-tw/2)), maxY=Math.max(4, M.mainH*sy-th-4);
    const cover=y=>(bb.hs || []).filter(([hx, hy])=>hx*sx>left-14 && hx*sx<left+tw+14 && hy*sy>y-14 && hy*sy<y+th+14).length;
    const cands=[bb.y0*sy-th-12, bb.y1*sy+12, 4, maxY].filter(y=>y>=4 && y<=maxY);
    let top=4, best=1e9; for (const y of cands.length ? cands : [4]){ const c=cover(y); if (c<best){ best=c; top=y; } }
    const ls=Math.round(left)+'px', ts=Math.round(top)+'px';
    if (tb.style.left!==ls) tb.style.left=ls; if (tb.style.top!==ts) tb.style.top=ts; }
  // the note editor
  const esig=ed ? E.id+'|'+(typeof ST==='object' && ST ? ST.lang : '') : '';
  if (esig!==DR.edSig){ DR.edSig=esig;
    edw.innerHTML=ed ? `<div class="dr-ed" role="dialog" aria-modal="true" aria-labelledby="dr-ed-l"><label id="dr-ed-l" for="dr-ed-i">${drEsc(drL('Note on the chart', 'Grafikteki not'))}</label><input id="dr-ed-i" type="text" maxlength="140" autocomplete="off" value="${drEsc(ed.txt || '')}" placeholder="${drEsc(drL('e.g. support held here', 'örn. destek burada tuttu'))}"><div class="dr-edb"><button type="button" class="dr-pri" data-dr-ed="ok">${drEsc(drL('Save', 'Kaydet'))}</button><button type="button" class="dr-sec" data-dr-ed="x">${drEsc(drL('Cancel', 'Vazgeç'))}</button></div></div>` : ''; }
  if (ed){ const el=edw.firstElementChild, x=M.t2x(ed.a.t)*sx, y=M.y(ed.a.px)*sy, w=el.offsetWidth || 260, h=el.offsetHeight || 96, ww=wrap.clientWidth || W*sx;
    const left=Math.max(4, Math.min(ww-w-4, x-12)), top=y+12+h<(M.H*sy) ? y+12 : Math.max(4, y-h-26);
    el.style.left=Math.round(left)+'px'; el.style.top=Math.round(top)+'px';
    if (E.focus){ E.focus=false; const i=el.querySelector('input'); try { i.focus({ preventScroll:true }); i.select(); } catch (z){} } }
}
// ---------------------------------------------------------------- clicks, colour input, keys
function drAlertToggle(d, sym){
  if (typeof alAdd!=='function') return;
  if (typeof ST==='object' && ST && !Array.isArray(ST.alerts) && typeof wlInit==='function') wlInit();
  const ex=drAlertFor(sym, d);
  if (ex){ drPushUndo(sym); ST.alerts=ST.alerts.filter(a=>a!==ex); delete d.al; if (typeof save==='function') save(); if (typeof toast==='function') toast(drL('Price alert removed.', 'Fiyat alarmı kaldırıldı.')); }
  else { const q=typeof quote==='function' ? quote(sym) : null, v=+(+d.a.px).toPrecision(8);
    if (!q || !(q.last>0)){ if (typeof toast==='function') toast(drL('No live price yet; try again in a moment.', 'Henüz canlı fiyat yok; birazdan yeniden dene.')); return; }
    const kind=v>=q.last ? 'above' : 'below', n0=Array.isArray(ST.alerts) ? ST.alerts.length : 0, snap=drAlSnap(sym), j=drSnapJ(sym), m=alAdd(sym, kind, v);
    if (!m && Array.isArray(ST.alerts) && ST.alerts.length>n0){ DR.undo.push({ sym, j, al:snap }); if (DR.undo.length>60) DR.undo.shift(); DR.redo=[]; d.al=ST.alerts[ST.alerts.length-1].id; if (typeof save==='function') save(); }
    if (typeof toast==='function') toast(m || (kind==='above' ? drL(`Alert set: ${sym} rises above $${drP(v)}.`, `Alarm kuruldu: ${sym} $${drP(v)} üstüne çıkarsa.`) : drL(`Alert set: ${sym} falls below $${drP(v)}.`, `Alarm kuruldu: ${sym} $${drP(v)} altına inerse.`))); }
  drKick(); if (typeof render==='function') render(); }
document.addEventListener('click', e=>{
  const t=e.target; if (!t || !t.closest) return;
  const tl=t.closest('[data-dr-tool]'); if (tl && tl.closest('#dr-pal')){ drTool(tl.getAttribute('data-dr-tool')); return; }
  const ac=t.closest('[data-dr-act]'); if (ac && ac.closest('#dr-pal')){ const a=ac.getAttribute('data-dr-act'), C=drC();
    if (a==='magnet' && C){ C.magnet=!C.magnet; drCommit(); }
    else if (a==='keep'){ DR.keep=!DR.keep; drKick(); }
    else if (a==='hide' && C){ C.drHide=!C.drHide; DR.sel=null; drCommit(); }
    else if (a==='undo') drUndo(); else if (a==='redo') drRedo();
    else if (a==='clear') drClear();
    else if (a==='close'){ drOpen(false); if (typeof render==='function') render(); }
    return; }
  const tb=t.closest('[data-dr-tb]'); if (tb && tb.closest('.dr-tb')){ const k=tb.getAttribute('data-dr-tb'), M=drM(), sym=drSym(M), d=DR.sel ? drFind(DR.sel, sym) : null, C=drC(); if (!d || k==='cc') return;
    if (k==='cols'){ DR.colOpen=!DR.colOpen; drKick(); }
    else if (k==='col'){ const c=tb.getAttribute('data-c'); DR.colOpen=false; if (d.col!==c){ drPushUndo(sym); d.col=c; if (C) C.drCol=c; drCommit(); } else drKick(); if (typeof requestAnimationFrame==='function') setTimeout(()=>{ const n=document.querySelector('#tr-chart .dr-tb [data-dr-tb="cols"]'); if (n) n.focus({ preventScroll:true }); }, 60); }
    else if (k==='w'){ drPushUndo(sym); d.w=((d.w || 2)%3)+1; drCommit(); }
    else if (k==='dash'){ drPushUndo(sym); d.dash=!d.dash; drCommit(); }
    else if (k==='al') drAlertToggle(d, sym);
    else if (k==='edit') drEdOpen(d.id, false);
    else if (k==='dup' && M){ drPushUndo(sym); const n=JSON.parse(JSON.stringify(d)); n.id=drId(); delete n.al; const dy=-Math.min(24, M.mainH*0.08);
      for (const p of ['a','b','c']) if (n[p]) n[p]=drShift(M, n[p], 3, d.tool==='vline' ? 0 : dy);
      drList(sym, true).push(n); DR.sel=n.id; drCommit(); }
    else if (k==='del') drDelete(d.id);
    return; }
  const ed=t.closest('[data-dr-ed]'); if (ed){ drEdDone(ed.getAttribute('data-dr-ed')==='ok'); return; }
});
document.addEventListener('input', e=>{ const t=e.target; if (!t || t.getAttribute('data-dr-tb')!=='cc') return; const sym=drSym(drM()), d=DR.sel ? drFind(DR.sel, sym) : null; if (!d) return;
  if (!t.__drU){ t.__drU=1; drPushUndo(sym); } d.col=drCol(t.value); const C=drC(); if (C) C.drCol=d.col; DR.tbSig=DR.tbSig.replace(/^([^|]*\|[^|]*)\|[^|]*/, '$1|'+d.col); drKick(); });
document.addEventListener('change', e=>{ const t=e.target; if (t && t.getAttribute && t.getAttribute('data-dr-tb')==='cc'){ t.__drU=0; if (typeof save==='function') save(); } });
document.addEventListener('keydown', e=>{
  const t=e.target;
  if (DR.ed && t && t.closest && t.closest('.dr-ed')){
    if (e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); if (typeof chEscMark==='function') chEscMark(); drEdDone(false); return; }
    if (e.key==='Enter' && t.tagName==='INPUT'){ e.preventDefault(); e.stopImmediatePropagation(); drEdDone(true); return; }
    if (e.key==='Tab'){ const f=[...t.closest('.dr-ed').querySelectorAll('input,button')], i=f.indexOf(t); e.preventDefault(); f[(i+(e.shiftKey ? f.length-1 : 1))%f.length].focus(); }
    e.stopImmediatePropagation(); return; }     // typing a note: no page shortcuts
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (!drVisible() || !drM()) return;
  const stop=()=>{ e.preventDefault(); e.stopImmediatePropagation(); if (e.key==='Escape' && typeof chEscMark==='function') chEscMark(); };
  if (e.key==='Escape'){
    if (DR.ed){ stop(); drEdDone(false); return; }
    if (DR.place || DR.drag){ stop(); drAbort(); return; }
    if (DR.tmp){ stop(); DR.tmp=null; drKick(); return; }
    if (DR.tool){ stop(); DR.tool=null; drKick(); drListen(); return; }
    if (DR.sel){ stop(); DR.sel=null; drKick(); drListen(); return; }
    return; }
  if ((e.key==='Delete' || e.key==='Backspace') && DR.sel && !e.ctrlKey && !e.metaKey && !e.altKey){ stop(); drDelete(DR.sel); return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key==='z' || e.key==='Z')){ if (e.shiftKey ? DR.redo.length : DR.undo.length){ stop(); if (e.shiftKey) drRedo(); else drUndo(); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key==='y' || e.key==='Y') && DR.redo.length){ stop(); drRedo(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && DR_KEYS[e.code]){ stop(); drTool(DR_KEYS[e.code]); return; }
}, true);
// ---------------------------------------------------------------- styles (injected once)
function drCss(){ if (document.getElementById('dr-css')) return; const st=document.createElement('style'); st.id='dr-css'; st.textContent=`
#tr-chart svg.chart.dr-on{touch-action:none}
#tr-chart svg.chart.dr-tool,#tr-chart svg.chart.dr-tool .dr-g{cursor:crosshair}
#tr-chart svg.chart.dr-on~.ch-lgs button{pointer-events:none}
.ch-dr .dr-g{cursor:move}
.ch-dr .dr-g.dr-new,.ch-dr .dr-g.dr-tmp{pointer-events:none}
.ch-dr .dr-ln{fill:none;stroke-width:var(--w,1.7px);stroke-linecap:round;transition:stroke-width .08s}
.ch-dr .dr-g:hover .dr-ln,.ch-dr .dr-sel .dr-ln{stroke-width:calc(var(--w,1.7px) + 1px)}
.ch-dr .dr-mid,.ch-dr .dr-diag{stroke-dasharray:4 4;opacity:.75}
.ch-dr .dr-hit{fill:none;stroke:transparent;stroke-width:14px;pointer-events:stroke}
.ch-dr path.dr-hit[d$="Z"]{fill:transparent;pointer-events:all}
.ch-dr .dr-fill{fill-opacity:.12;stroke:none}
.ch-dr .dr-msr{fill-opacity:.16}.ch-dr .dr-pz{fill-opacity:.17}
.ch-dr .dr-band{fill-opacity:.07;stroke:none;pointer-events:none}
.ch-dr .dr-arw{fill:none;stroke-width:1.4}
.ch-dr .dr-tbg{fill:var(--surface-1);fill-opacity:.55}
.ch-dr .dr-selbox{fill:none;stroke-width:1;stroke-dasharray:3 3}
.ch-dr .dr-h{fill:var(--surface-1);stroke-width:1.8;display:none;pointer-events:none}
.ch-dr .dr-hh{fill:transparent;stroke:none;display:none;cursor:grab;pointer-events:all}
.ch-dr .dr-sel .dr-h,.ch-dr .dr-sel .dr-hh,.ch-dr .dr-g:hover .dr-h,.ch-dr .dr-g:hover .dr-hh{display:inline}
.ch-dr .dr-dot{stroke:var(--surface-1);stroke-width:1.5}
.ch-dr text{font:600 10.5px var(--f-mono,monospace);pointer-events:none}
.ch-dr .dr-lb{fill:var(--ink-2);paint-order:stroke;stroke:var(--surface-1);stroke-width:3px;stroke-linejoin:round}
.ch-dr .dr-note{font-family:var(--f-body,system-ui);font-weight:650;paint-order:stroke;stroke:var(--surface-1);stroke-width:3px;stroke-linejoin:round}
.ch-dr .dr-tag{stroke:none;opacity:.96}
@media (pointer:coarse){.ch-dr .dr-hit{stroke-width:26px}.ch-dr .dr-hh{r:17px}}
@media (prefers-reduced-motion:reduce){.ch-dr .dr-ln{transition:none}}
.dr-pal{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0 0 6px;padding:4px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2)}
.dr-pal .dr-bs{display:flex;flex-wrap:wrap;align-items:center;gap:2px}
.dr-pal .dr-sp{width:1px;height:20px;background:var(--line-strong);margin:0 3px}
.dr-b{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:32px;height:32px;padding:0 6px;border:0;border-radius:7px;background:transparent;color:var(--ink-2);cursor:pointer;font:600 12px/1 var(--f-body,system-ui)}
.dr-b:hover:not(:disabled){background:var(--surface-3);color:var(--ink)}
.dr-b[aria-pressed="true"]{background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--ink);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 60%,transparent)}
.dr-b:disabled{opacity:.38;cursor:default}
.dr-b:focus-visible,.dr-sw:focus-visible,.dr-cc:focus-within{outline:2px solid var(--focus);outline-offset:1px}
.dr-pal .dr-hint{flex:1 1 220px;min-width:0;font:500 12px/1.35 var(--f-body,system-ui);color:var(--ink-2);padding:0 4px}
#tr-chart .dr-ov{position:absolute;inset:0;pointer-events:none;z-index:3}
#tr-chart .dr-tb{position:absolute;display:flex;flex-wrap:wrap;align-items:center;gap:2px;max-width:calc(100% - 8px);padding:3px;border:1px solid var(--line-strong);border-radius:10px;background:var(--surface-2);box-shadow:var(--elev-raised);pointer-events:auto}
#tr-chart .dr-tb[hidden]{display:none}
#tr-chart .dr-tbb{min-width:30px;height:30px}
#tr-chart .dr-tx span{font-size:12px}
#tr-chart .dr-cdot{width:16px;height:16px;border-radius:50%;background:var(--c);box-shadow:0 0 0 1px var(--line-strong)}
#tr-chart .dr-cols{flex:1 0 100%;display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 2px 2px;border-top:1px solid var(--line)}
#tr-chart .dr-sw{width:22px;height:22px;margin:0 1px;border-radius:50%;border:2px solid var(--surface-2);background:var(--c);box-shadow:0 0 0 1px var(--line-strong);cursor:pointer;padding:0}
#tr-chart .dr-sw[aria-pressed="true"]{box-shadow:0 0 0 2px var(--ink)}
#tr-chart .dr-cc{position:relative;display:inline-flex;width:26px;height:26px;border-radius:50%;overflow:hidden;cursor:pointer;margin:0 2px;box-shadow:0 0 0 1px var(--line-strong);background:conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#3b82f6,#a855f7,#ef4444)}
#tr-chart .dr-cc input{position:absolute;inset:-6px;width:40px;height:40px;opacity:0;cursor:pointer;border:0;padding:0}
#tr-chart .dr-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#tr-chart .dr-ed{position:absolute;display:flex;flex-direction:column;gap:6px;width:min(280px,calc(100% - 8px));padding:10px;border:1px solid var(--line-strong);border-radius:10px;background:var(--surface-2);box-shadow:var(--elev-overlay,var(--elev-raised));pointer-events:auto;z-index:4}
#tr-chart .dr-ed label{font:600 12px/1.2 var(--f-body,system-ui);color:var(--ink-2)}
#tr-chart .dr-ed input{font:500 14px/1.3 var(--f-body,system-ui);color:var(--ink);background:var(--surface-1);border:1px solid var(--line-strong);border-radius:7px;padding:7px 8px;min-width:0}
#tr-chart .dr-edb{display:flex;gap:6px;justify-content:flex-end}
#tr-chart .dr-edb button{min-height:32px;padding:0 12px;border-radius:8px;font:700 13px/1 var(--f-body,system-ui);cursor:pointer;border:1px solid var(--line-strong);background:var(--surface-3);color:var(--ink)}
#tr-chart .dr-edb .dr-pri{background:var(--accent);border-color:var(--accent);color:var(--on-accent,var(--bg))}
#tr-chart .dr-edb button:focus-visible{outline:2px solid var(--focus);outline-offset:1px}
@media (max-width:560px){.dr-b{min-width:30px;height:30px;padding:0 5px}.dr-pal .dr-sp{margin:0 1px}}
`; document.head.appendChild(st); }

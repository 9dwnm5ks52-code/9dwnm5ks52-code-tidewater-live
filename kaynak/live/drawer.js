/* ---------- Phoenix Finance Club: the company drawer (Portfolio) and the chart's click menu (Trade) ----------
   The drawer is a dialog that slides in from the right for one holding: its price and today's change, then four tabs:
   Fundamentals (fund.js data: six key tiles and all the items on request), News (the same company news as the Trade
   screen), Chart (a small chart of the bars this page has) and Our trades (the fund's fills and open orders in it, notes
   escaped). Esc, the × or the backdrop close it, Tab stays inside it, and the focus goes back to the holding.
   The chart menu opens on a click on the Trade chart: "Limit buy here", "Stop here", "Price alert". It only fills in the
   ticket or the alert; sending still goes through the club's job (club.js). */
const DW={ open:false, sym:null, tab:'fund', all:false, shell:'', closeT:0 };
const DW_TABS=[['fund','Fundamentals','Temel veriler'],['news','News','Haberler'],['chart','Chart','Grafik'],['trades','Our trades','İşlemlerimiz']];
const dwReduced = () => { try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
function dwInert(on){ for (const x of [$('.lv-top'), $('.lv-shell')]) if (x){ if (on) x.setAttribute('inert', ''); else x.removeAttribute('inert'); } document.documentElement.classList.toggle('dw-lock', on); }
function dwOpen(sym){ if (!IM[sym]) return; const d=IM[sym];
  DW.sym=sym; DW.tab='fund'; DW.all=false; DW.shell=''; DW.open=true; clearTimeout(DW.closeT);
  if (d.kind==='crypto'){ if (typeof cxDaily==='function') cxDaily(sym); } else { if (MKT.all[sym]) mktDetail(sym).catch(()=>{}); if (typeof fdLoad==='function') fdLoad(sym); }
  const el=$('#dw'); el.hidden=false; dwInert(true); dwRender(quotesAll());
  void el.offsetWidth; el.classList.add('open'); const p=$('#dw-p'); p.scrollTop=0; p.focus({ preventScroll:true }); render(); }
function dwClose(back){ if (!DW.open) return; DW.open=false; const el=$('#dw'); el.classList.remove('open'); dwInert(false);
  const done=()=>{ if (!DW.open){ el.hidden=true; setHTML($('#dw-p'), ''); DW.shell=''; } }; if (dwReduced()) done(); else DW.closeT=setTimeout(done, 260);
  if (back!==false){ const b=[...document.querySelectorAll('#pf-pos button[data-dw]')].find(x=>x.dataset.dw===DW.sym); if (b) b.focus(); }
  render(); }
// a name and a line under it: "AAPL · NASDAQ · Electronic technology"
function dwNames(sym){ const d=IM[sym], m=MKT.all[sym], f=FD.c[sym] && FD.c[sym].v, nm=(f && f.description) || (d && d.name) || sym;
  const sub=d && d.kind==='crypto' ? [sym, T('Crypto')] : [sym, m && m.ex, m && m.sector ? (typeof secT==='function' ? secT(m.sector) : m.sector) : ''];
  return { nm, sub:sub.filter(Boolean).join(' · ') }; }
function dwShell(sym){ const N=dwNames(sym);
  return `<div class="dw-hd"><div><h2 id="dw-h">${esc(N.nm)}</h2><p id="dw-sub">${esc(N.sub)}</p></div><button class="dw-x" type="button" data-dw-x aria-label="${esc(L2('Close','Kapat'))}">×</button></div>
    <div class="dw-px" id="dw-px"></div>
    <div class="seg" role="tablist" aria-label="${esc(L2('Company details','Şirket ayrıntıları'))}" id="dw-tabs">${DW_TABS.map(([k, en, tr])=>`<button type="button" role="tab" id="dw-t-${k}" data-dw-tab="${k}" aria-controls="dw-body" aria-selected="${DW.tab===k}" tabindex="${DW.tab===k ? 0 : -1}">${esc(L2(en, tr))}</button>`).join('')}</div>
    <div class="dw-body" id="dw-body" role="tabpanel" tabindex="0" aria-labelledby="dw-t-${DW.tab}"></div>
    <div class="dw-ft"><a class="dw-buy" href="#trade" data-dw-trade="buy">${esc(L2('Buy','Al'))}</a><a class="dw-sell" href="#trade" data-dw-trade="sell">${esc(L2('Sell','Sat'))}</a></div>`; }
function dwRender(Q){ if (!DW.open) return; const sym=DW.sym, d=IM[sym], N=dwNames(sym), q=(Q && Q[sym]) || quote(sym) || fundQuotes(Q||{})[sym], p=$('#dw-p');
  const key=sym+'|'+ST.lang+'|'+N.nm+'|'+N.sub; if (DW.shell!==key){ const had=p.contains(document.activeElement) ? document.activeElement.id : ''; DW.shell=key; p.__h=null; p.innerHTML=dwShell(sym); const f=had && document.getElementById(had); if (f) f.focus(); }
  for (const b of $$('#dw-tabs [data-dw-tab]')){ const on=b.dataset.dwTab===DW.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex=on ? 0 : -1; }
  $('#dw-body').setAttribute('aria-labelledby', 'dw-t-'+DW.tab);
  setHTML($('#dw-px'), q && q.last>0 ? `<b class="mono">$${fpx(q.last)}</b>${q.chg!=null ? `<span class="mono ${cls(q.chg)}">${pct(q.chg)} ${esc(L2('today','bugün'))}</span>` : ''}` : `<span class="bd-sub">${esc(T('Waiting for prices…'))}</span>`);
  const body=DW.tab==='fund' ? dwFund(sym, d) : DW.tab==='news' ? tradeNews(sym) : DW.tab==='chart' ? dwChart(sym, q) : dwTrades(sym);
  setHTML($('#dw-body'), body); }
// the fund's newest note on this symbol
function dwNote(sym){ const f=(ST.A.fills||[]).filter(x=>x.sym===sym && x.note).sort((a,b)=>b.t-a.t)[0]; if (!f) return '';
  return `<div class="dw-note"><b>${esc(L2('The fund’s note','Fonun notu'))} · ${esc(new Date(f.t).toLocaleDateString(ST.lang==='tr' ? 'tr-TR' : 'en-US', { day:'numeric', month:'short' }))}</b><span class="tr-note">“${esc(f.note)}”</span></div>`; }
const DW_KEY=[['market_cap_basic','Market value','Piyasa değeri','$'],['price_earnings_ttm','P/E (TTM)','F/K (TTM)','x'],['net_margin_ttm','Net margin','Net marj','%'],['total_revenue_yoy_growth_ttm','Revenue growth','Gelir büyümesi','%s'],['dividends_yield_current','Dividend yield','Temettü verimi','%'],['earnings_release_next_date','Next earnings','Sonraki bilanço','d']];
function dwFund(sym, d){ if (d.kind==='crypto') return `<p class="bd-sub">${esc(L2(`${d.name || sym} is a coin, not a company: it has no earnings, balance sheet or dividends to show. Its chart, the news and the fund’s trades are in the other tabs.`, `${d.name || sym} bir şirket değil, bir coin: gösterilecek kârı, bilançosu ya da temettüsü yok. Grafiği, haberleri ve fonun işlemleri diğer sekmelerde.`))}</p>${dwNote(sym)}`;
  const c=FD.c[sym], v=c && c.v; if (!v) return `<p class="bd-sub">${esc(c && (c.err || c.v===null) ? L2('Fundamentals are unavailable for this one right now.','Bunun temel verileri şu an alınamıyor.') : L2('Loading the company’s fundamentals…','Şirketin temel verileri yükleniyor…'))}</p>${dwNote(sym)}`;
  const tiles=DW_KEY.map(([k, en, tr, f])=>{ const t=fdFmt(v[k], f); const c2=f==='%s' && typeof v[k]==='number' ? cls(v[k]) : ''; return `<div class="dw-tile"><span>${esc(L2(en, tr))}</span><b class="${c2}">${esc(t==null ? '—' : t)}</b></div>`; }).join('');
  const n=FD_GROUPS.reduce((a, g)=>a+g[2].filter(x=>fdFmt(v[x[0]], x[3])!=null).length, 0);
  return `<div class="dw-tiles">${tiles}</div><button type="button" class="bd-more dw-all" data-dw-all aria-expanded="${DW.all}">${esc(DW.all ? L2('Show fewer','Daha az göster') : L2(`See all ${n} items ›`, `${n} kalemin tamamını gör ›`))}</button>${DW.all ? `<div class="dw-all-body">${fdHTML(sym)}</div>` : ''}${dwNote(sym)}`; }
// a small chart from the bars this page has: daily closes, else today's minutes, else how it did over time
function dwChart(sym, q){ const d=IM[sym], daily=q && Array.isArray(q.daily) ? q.daily.filter(b=>b && b.c>0) : [], intra=q && Array.isArray(q.intra) ? q.intra.filter(b=>b && b.c>0) : [];
  const bars=(daily.length>=2 ? daily : intra).slice(-120), lbl=daily.length>=2 ? L2(`Daily closes, last ${bars.length} days`, `Günlük kapanışlar, son ${bars.length} gün`) : L2('Minute closes since this page opened','Bu sayfa açıldığından beri dakikalık kapanışlar');
  const open=`<a class="bd-more" href="#trade" data-dw-trade="chart">${esc(L2('Open the full chart →','Tam grafiği aç →'))}</a>`;
  if (bars.length<2) return (d.kind==='stock' && q ? perfHTML(sym, q) : `<p class="bd-sub">${esc(L2('The chart fills in as prices arrive.','Grafik fiyatlar geldikçe dolar.'))}</p>`)+open;
  const W=420, H=200, cs=bars.map(b=>+b.c), lo=Math.min(...cs), hi=Math.max(...cs), X=i=>4+(W-8)*i/(cs.length-1), Y=v=>12+(H-30)*(1-(v-lo)/((hi-lo)||1)), up=cs[cs.length-1]>=cs[0];
  const dd=cs.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join(''), col=up ? 'var(--gain)' : 'var(--loss)';
  return `<div class="dw-ch"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${sym}: ${lbl}, $${fpx(cs[0])} → $${fpx(cs[cs.length-1])}`)}"><line class="gl" x1="0" x2="${W}" y1="${Y(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}"/><line class="gl" x1="0" x2="${W}" y1="${Y(lo).toFixed(1)}" y2="${Y(lo).toFixed(1)}"/>`
    + `<path d="${dd}L${X(cs.length-1).toFixed(1)},${H-18}L4,${H-18}Z" fill="${col}" opacity=".1"/><path d="${dd}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<text x="4" y="${(Y(hi)-3).toFixed(1)}">$${fpx(hi)}</text><text x="4" y="${H-4}">$${fpx(lo)}</text></svg></div><p class="bd-sub">${esc(lbl)} · <span class="mono ${cls(cs[cs.length-1]/cs[0]-1)}">${pct(cs[cs.length-1]/cs[0]-1)}</span></p>${open}`; }
// the fund's fills and open orders in this symbol, newest first; notes are text
function dwTrades(sym){ const A=ST.A, fs=(A.fills||[]).filter(f=>f.sym===sym).sort((a,b)=>b.t-a.t), os=(A.orders||[]).filter(o=>o.sym===sym && o.status==='open');
  const k=x=>x.kind==='stock' ? 'stock' : 'crypto', note=n=>n ? `<span class="tr-note">“${esc(n)}”</span>` : '';
  const li=fs.map(f=>{ const a=fillAct(f); return `<li><span><b class="${a==='buy' || a==='cover' ? 'up' : 'down'}">${esc(actName(a))}</b> ${esc(fq(+f.q, k(f)))} @ $${esc(fpx(+f.px))}${f.pl!=null && isFinite(+f.pl) ? ` · <span class="${cls(+f.pl)}">${money(+f.pl)}</span>` : ''}</span><span class="nw-m">${esc(tFmt(f.t))}</span>${note(f.note)}</li>`; }).join('');
  const lo=os.map(o=>`<li><span><b>${esc(actName(ordAct(o)))}</b> · ${esc(o.type==='lmt' ? L2('Limit','Limit') : L2('Stop','Stop'))} ${esc(fq(+o.q, k(o)))} @ $${esc(fpx(+o.px))}</span><span class="nw-m">${esc(L2('open order','açık emir'))} · ${esc(tFmt(o.t))}</span>${note(o.note)}</li>`).join('');
  return (fs.length ? `<ul class="dw-tr">${li}</ul>` : `<p class="bd-sub">${esc(L2('The fund has no trades in this one yet.','Fonun bunda henüz işlemi yok.'))}</p>`) + (os.length ? `<h3 class="perf-h">${esc(T('Open orders'))}</h3><ul class="dw-tr">${lo}</ul>` : ''); }
function dwTab(k, focus){ DW.tab=k; DW.all=false; dwRender(quotesAll()); if (focus){ const b=$('#dw-t-'+k); if (b) b.focus(); } }
document.addEventListener('click', e=>{ const t=e.target;
  if (DW.open){
    if (t.closest('[data-dw-x]')){ dwClose(); return; }
    const tb=t.closest('[data-dw-tab]'); if (tb){ dwTab(tb.dataset.dwTab); return; }
    if (t.closest('[data-dw-all]')){ DW.all=!DW.all; dwRender(quotesAll()); const b=$('[data-dw-all]'); if (b) b.focus(); return; }
    const tr=t.closest('[data-dw-trade]'); if (tr){ const sym=DW.sym, held=brkHeld(ST.A, sym), w=tr.dataset.dwTrade; dwClose(false); selectSym(sym);
      if (w==='buy'){ ST.side=held<0 ? 'cover' : 'buy'; } else if (w==='sell'){ ST.side=held>0 ? 'sell' : 'short'; } render(); return; }
    return; }
  const o=t.closest('[data-dw]'); if (o && o.closest('#pf-pos')){ dwOpen(o.dataset.dw); return; } });
document.addEventListener('keydown', e=>{ if (!DW.open) return;
  if (e.key==='Escape'){ if (typeof UI!=='undefined' && (UI.pal || UI.help)) return; e.preventDefault(); e.stopPropagation(); dwClose(); return; }
  if (e.key==='Tab'){ const p=$('#dw-p'), fs=[...p.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null || x===document.activeElement); if (!fs.length) return;
    const i=fs.indexOf(document.activeElement); if (e.shiftKey && (i<=0)){ e.preventDefault(); fs[fs.length-1].focus(); } else if (!e.shiftKey && (i===fs.length-1 || i<0)){ e.preventDefault(); fs[0].focus(); } return; }
  const tb=e.target.closest && e.target.closest('[data-dw-tab]'); if (tb && (e.key==='ArrowRight' || e.key==='ArrowLeft' || e.key==='Home' || e.key==='End')){ e.preventDefault(); const ks=DW_TABS.map(x=>x[0]), i=ks.indexOf(DW.tab);
    dwTab(e.key==='Home' ? ks[0] : e.key==='End' ? ks[ks.length-1] : ks[(i+(e.key==='ArrowRight' ? 1 : ks.length-1))%ks.length], true); } }, true);
document.addEventListener('focusin', e=>{ if (DW.open && !$('#dw').contains(e.target)){ const p=$('#dw-p'); if (p) p.focus({ preventScroll:true }); } });

/* ---- the chart's click menu */
const CM={ px:0, below:true, t:0 };
function cmClose(){ clearTimeout(CM.t); const el=$('#cm'); if (el) el.remove(); }
function cmOpen(e, pt){ cmClose(); const M=typeof CHM!=='undefined' ? CHM : null, wrap=$('#tr-chw'), q=quote(ST.sel); if (!M || !wrap || !q || !(q.last>0) || typeof M.px!=='function' || pt.y>(M.mainH||M.H) || pt.x>(M.plotW||M.W)) return;
  const raw=M.px(pt.y); if (!(raw>0) || !isFinite(raw)) return; const v=+raw.toFixed(pxd(raw)); CM.px=v; CM.below=v<q.last;
  const el=document.createElement('div'); el.id='cm'; el.className='cm'; el.setAttribute('role','menu'); el.setAttribute('aria-label', L2('Chart actions at $'+fpx(v), '$'+fpx(v)+' için grafik işlemleri'));
  el.innerHTML=`<button type="button" role="menuitem" class="cm-pri" data-cm="lmt">${esc(CM.below ? L2('Limit buy here','Buradan limit al') : L2('Limit sell here','Buradan limit sat'))} · $${esc(fpx(v))}</button><button type="button" role="menuitem" data-cm="stp">${esc(L2('Stop here','Buraya stop koy'))}</button><button type="button" role="menuitem" data-cm="al">${esc(L2('Price alert','Fiyat alarmı kur'))}</button>`;
  wrap.appendChild(el); const r=wrap.getBoundingClientRect(), w=el.offsetWidth||240, h=el.offsetHeight||140;
  el.style.left=Math.max(4, Math.min(r.width-w-4, e.clientX-r.left+10))+'px'; el.style.top=Math.max(4, Math.min(Math.max(4, r.height-h-4), e.clientY-r.top+10))+'px';
  const f=el.querySelector('button'); if (f) f.focus({ preventScroll:true }); }
// called by chart.js on a click (not a drag) on the price pane; a short wait lets a double-click (reset) cancel it
function cmClick(e, pt){ clearTimeout(CM.t); const ev={ clientX:e.clientX, clientY:e.clientY }; CM.t=setTimeout(()=>cmOpen(ev, pt), 230); }
function cmDo(k){ const v=CM.px, below=CM.below, held=brkHeld(ST.A, ST.sel); cmClose(); ST.tmsg='';
  if (k==='al'){ const kd=$('#al-kind'), iv=$('#al-v'); if (kd) kd.value=below ? 'below' : 'above'; if (iv){ iv.value=String(v); const card=$('#al-tr'); if (card) card.scrollIntoView({ block:'nearest', behavior:dwReduced() ? 'auto' : 'smooth' }); iv.focus({ preventScroll:true }); } txt('al-msg', L2('Press “Set alert” to keep it.','Kaydetmek için “Alarm kur”a bas.')); return; }
  if (k==='lmt'){ ST.type='lmt'; ST.side=below ? (held<0 ? 'cover' : 'buy') : (held>0 ? 'sell' : 'short'); }
  else { ST.type='stp'; ST.side=below ? (held>0 ? 'sell' : 'short') : (held<0 ? 'cover' : 'buy'); }
  $('#tk-px').value=String(v); save(); render(); const a=$('#tk-amt'); if (a){ $('#tk').scrollIntoView({ block:'nearest', behavior:dwReduced() ? 'auto' : 'smooth' }); a.focus({ preventScroll:true }); a.select(); } }
document.addEventListener('click', e=>{ const b=e.target.closest && e.target.closest('[data-cm]'); if (b){ cmDo(b.dataset.cm); } });
document.addEventListener('pointerdown', e=>{ const el=$('#cm'); if (el && !el.contains(e.target)) cmClose(); }, true);
document.addEventListener('keydown', e=>{ const el=$('#cm'); if (!el) return; if (e.key==='Escape'){ e.preventDefault(); cmClose(); const w=$('#tr-chart .ch-wrap'); if (w) w.focus({ preventScroll:true }); return; }
  if ((e.key==='ArrowDown' || e.key==='ArrowUp') && el.contains(document.activeElement)){ e.preventDefault(); const bs=[...el.querySelectorAll('button')], i=bs.indexOf(document.activeElement); bs[(i+(e.key==='ArrowDown' ? 1 : bs.length-1))%bs.length].focus(); } });
addEventListener('hashchange', ()=>{ cmClose(); if (DW.open && location.hash!=='#portfolio') dwClose(false); });

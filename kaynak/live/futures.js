/* ---------- Phoenix Finance Club: paper futures (perpetual swaps) ----------
   A separate futures wallet: long or short, 1 to 20 times leverage, isolated margin (a position can only lose its own margin),
   the liquidation price, funding every 8 hours at the market's current rate (OKX), and futures fees (0.05% taker, 0.02% maker).
   Liquidation: when the mark price reaches the liquidation price the position is closed and its margin is lost. */
const FUT = { MMR:.005, TAKER:.0005, MAKER:.0002, MAXLEV:20, START:10000 };
function futAcct(){ const F=ST.fut||(ST.fut={ cash:FUT.START, start:FUT.START, pos:{}, orders:[], fills:[], nid:1, lastFund:Math.floor(Date.now()/288e5)*288e5, eqi:[] }); F.orders=F.orders||[]; F.fills=F.fills||[]; F.eqi=F.eqi||[]; return F; }
const futLiq = (side, entry, lev) => side>0 ? entry*(1-1/lev+FUT.MMR) : entry*(1+1/lev-FUT.MMR);
const futUPL = (p, px) => p.side*p.qty*(px-p.entry);
function futSummary(Q){ if (!ST.fut) return null; const F=ST.fut; let m=0, u=0; for (const s in F.pos){ const p=F.pos[s], q=Q[s]; m+=p.margin; if (q && q.last>0) u+=futUPL(p, q.last); } return { eq:F.cash+m+u, margin:m, upl:u, cash:F.cash }; }
function futFill(F, o){ F.fills.push(o); if (F.fills.length>300) F.fills.shift(); }
// open (or add to) a position with margin `m` at price `px`
function futOpen(sym, side, lev, m, px, maker, extra){ const F=futAcct(); lev=Math.max(1, Math.min(FUT.MAXLEV, Math.round(lev))); if (!(m>0) || !(px>0)) return { ok:false, msg:L2('Enter a margin above zero.','Sıfırdan büyük teminat gir.') };
  const notional=m*lev, fee=notional*(maker ? FUT.MAKER : FUT.TAKER); if (m+fee>F.cash+1e-9) return { ok:false, msg:L2('Not enough in the futures wallet.','Vadeli cüzdanda yeterli bakiye yok.') };
  const qty=notional/px, cur=F.pos[sym]; if (cur && cur.side!==side) return { ok:false, msg:L2('Close the opposite position first.','Önce ters yöndeki pozisyonu kapat.') };
  F.cash-=m+fee; if (cur){ const q2=cur.qty+qty; cur.entry=(cur.entry*cur.qty+px*qty)/q2; cur.qty=q2; cur.margin+=m; cur.lev=Math.round(cur.qty*cur.entry/cur.margin*10)/10; cur.liq=futLiq(side, cur.entry, cur.qty*cur.entry/cur.margin); }
  else F.pos[sym]={ sym, side, qty, entry:px, lev, margin:m, liq:futLiq(side, px, lev), t:Date.now(), fund:0, tp:extra && extra.tp || null, sl:extra && extra.sl || null };
  futFill(F, { id:F.nid++, t:Date.now(), sym, act:'open', side, qty, px, fee, lev });
  return { ok:true, msg:L2(`${side>0 ? 'Long' : 'Short'} ${fq(qty,'crypto')} ${sym} at $${fpx(px)}, ${lev}x; liquidation at $${fpx(F.pos[sym].liq)}.`,`${fq(qty,'crypto')} ${sym} ${side>0 ? 'long' : 'short'} açıldı, $${fpx(px)}, ${lev}x; tasfiye $${fpx(F.pos[sym].liq)}.`) }; }
function futClose(sym, px, why, frac){ const F=futAcct(), p=F.pos[sym]; if (!p || !(px>0)) return null; frac=frac>0 && frac<1 ? frac : 1; const qty=p.qty*frac, m=p.margin*frac;
  let pl=p.side*qty*(px-p.entry), fee=qty*px*FUT.TAKER; if (why==='liq'){ pl=-m; fee=0; }
  F.cash+=Math.max(0, m+pl-fee); futFill(F, { id:F.nid++, t:Date.now(), sym, act:why==='liq' ? 'liq' : 'close', side:p.side, qty, px, fee, pl:pl-fee, why });
  if (frac>=1) delete F.pos[sym]; else { p.qty-=qty; p.margin-=m; } return pl-fee; }
// every quote: liquidation, take profit / stop loss, resting limit orders, and funding every 8 hours
function futTick(Q){ if (!ST.fut) return; const F=ST.fut; let changed=false;
  for (const s of Object.keys(F.pos)){ const p=F.pos[s], q=Q[s]; if (!q || !(q.last>0)) continue; const x=q.last;
    if ((p.side>0 && x<=p.liq) || (p.side<0 && x>=p.liq)){ futClose(s, p.liq, 'liq'); note(`Futures: ${s} ${p.side>0 ? 'long' : 'short'} liquidated at $${fpx(p.liq)}; the margin is lost`, '💥'); changed=true; continue; }
    if (p.tp && ((p.side>0 && x>=p.tp) || (p.side<0 && x<=p.tp))){ futClose(s, p.tp, 'tp'); changed=true; continue; }
    if (p.sl && ((p.side>0 && x<=p.sl) || (p.side<0 && x>=p.sl))){ futClose(s, x, 'sl'); changed=true; } }
  for (const o of F.orders) if (o.status==='open'){ const q=Q[o.sym]; if (!q || !(q.last>0)) continue; if ((o.side==='L' && q.last<=o.px) || (o.side==='S' && q.last>=o.px)){ const r=futOpen(o.sym, o.side==='L' ? 1 : -1, o.lev, o.m, o.px, true, o); o.status=r.ok ? 'filled' : 'cancelled'; if (!r.ok) o.why=r.msg; changed=true; } }
  const per=Math.floor(Date.now()/288e5)*288e5; if (per>F.lastFund){ const n=Math.min(9, Math.round((per-F.lastFund)/288e5)); for (const s in F.pos){ const p=F.pos[s], q=Q[s]; if (!q) continue; const rate=(typeof DESK!=='undefined' && DESK.fund[s]!=null) ? DESK.fund[s] : .0001, pay=p.side*p.qty*q.last*rate*n; F.cash-=pay; p.fund-=pay; } F.lastFund=per; changed=true; }
  const t=Date.now(), S=futSummary(Q); if (S && (!F.eqi.length || t-F.eqi[F.eqi.length-1].t>=3e5)){ F.eqi.push({ t, v:S.eq }); if (F.eqi.length>3000) F.eqi.shift(); }
  if (changed) save(); }
// ---- the futures ticket (in the Trade screen)
function futTicket(Q){ const F=futAcct(), s=ST.sel, q=Q[s], d=IM[s], P=ST.fp||(ST.fp={ side:'L', type:'mkt', lev:5, m:500, px:'', tp:'', sl:'' });
  if (!d || d.kind!=='crypto') return `<p class="empty">${esc(L2('Futures are for crypto coins.','Vadeli işlemler kripto coinler içindir.'))}</p>`;
  const px=P.type==='lmt' && +P.px>0 ? +P.px : (q ? q.last : 0), side=P.side==='L' ? 1 : -1, notional=P.m*P.lev, qty=px>0 ? notional/px : 0, liq=px>0 ? futLiq(side, px, P.lev) : 0, fee=notional*(P.type==='lmt' ? FUT.MAKER : FUT.TAKER), fr=typeof DESK!=='undefined' ? DESK.fund[s] : null, dist=px>0 ? Math.abs(liq/px-1) : 0;
  return `<div class="bd-th"><h2>${esc(L2('Futures order','Vadeli emir'))}</h2><span class="bd-sub">${esc(L2('wallet','cüzdan'))} <b class="mono">${money(F.cash)}</b></span></div>
    <span class="seg" role="group" aria-label="${esc(L2('Direction','Yön'))}"><button type="button" data-fut-side="L" aria-pressed="${P.side==='L'}">Long</button><button type="button" data-fut-side="S" aria-pressed="${P.side==='S'}">Short</button></span>
    <span class="seg" role="group" aria-label="${esc(L2('Order type','Emir türü'))}"><button type="button" data-fut-type="mkt" aria-pressed="${P.type==='mkt'}">${esc(L2('Market','Piyasa'))}</button><button type="button" data-fut-type="lmt" aria-pressed="${P.type==='lmt'}">${esc(L2('Limit','Limit'))}</button></span>
    <label class="fld" for="fut-lev">${esc(L2('Leverage','Kaldıraç'))} <b class="mono">${P.lev}x</b><input id="fut-lev" type="range" min="1" max="${FUT.MAXLEV}" step="1" value="${P.lev}"></label>
    <div class="fld-row"><label class="fld" for="fut-m">${esc(L2('Margin ($)','Teminat ($)'))}<input id="fut-m" type="number" min="1" step="any" value="${P.m}"></label>${P.type==='lmt' ? `<label class="fld" for="fut-px">${esc(L2('Limit price','Limit fiyatı'))}<input id="fut-px" type="number" min="0" step="any" value="${P.px||''}"></label>` : ''}</div>
    <div class="fld-row"><label class="fld" for="fut-tp">${esc(L2('Take profit (optional)','Kâr al (isteğe bağlı)'))}<input id="fut-tp" type="number" min="0" step="any" value="${P.tp||''}"></label><label class="fld" for="fut-sl">${esc(L2('Stop loss (optional)','Zarar kes (isteğe bağlı)'))}<input id="fut-sl" type="number" min="0" step="any" value="${P.sl||''}"></label></div>
    <div id="fut-calc">${futCalc(Q)}</div>
    <p class="bd-sub">${esc(L2('Paper only. Real leverage can lose everything quickly; most retail futures traders lose money.','Sadece kâğıt üstünde. Gerçek kaldıraç her şeyi hızla kaybettirebilir; bireysel vadeli işlemcilerin çoğu para kaybeder.'))}</p>`; }
function futCalc(Q){ const s=ST.sel, q=Q[s], P=ST.fp, F=futAcct(); if (!q || !P) return ''; const px=P.type==='lmt' && +P.px>0 ? +P.px : q.last, side=P.side==='L' ? 1 : -1, notional=P.m*P.lev, qty=px>0 ? notional/px : 0, liq=px>0 ? futLiq(side, px, P.lev) : 0, fee=notional*(P.type==='lmt' ? FUT.MAKER : FUT.TAKER), fr=typeof DESK!=='undefined' ? DESK.fund[s] : null, dist=px>0 ? Math.abs(liq/px-1) : 0;
  return `<table class="tbl fut-sum"><tbody><tr><td>${esc(L2('Position size','Pozisyon büyüklüğü'))}</td><td class="r mono">${fq(qty,'crypto')} ${esc(s)} ≈ ${money(notional)}</td></tr>
      <tr><td>${esc(L2('Liquidation price','Tasfiye fiyatı'))}</td><td class="r mono down">$${fpx(liq)} <span class="muted">(${pct(side*(liq/px-1))})</span></td></tr>
      <tr><td>${esc(L2('Fee','Ücret'))}</td><td class="r mono">${money(fee)}</td></tr><tr><td>${esc(L2('Funding now (8h)','Şu anki fonlama (8s)'))}</td><td class="r mono">${fr!=null ? (fr*100).toFixed(4)+'%' : '—'}</td></tr></tbody></table>
    <div class="risk-bar" role="img" aria-label="${esc(L2(`The price may move ${p0(dist)} against you before liquidation`,`Tasfiyeye kadar fiyat ${p0(dist)} aleyhine gidebilir`))}"><i style="width:${Math.min(100, dist*500).toFixed(0)}%" class="${dist<.05 ? 'hot' : dist<.15 ? 'warm' : ''}"></i></div>
    <p class="bd-sub">${esc(L2(`Room before liquidation: ${p0(dist)}. At ${P.lev}x a ${p0(1/P.lev)} move against you wipes out the margin.`,`Tasfiyeye kadar alan: ${p0(dist)}. ${P.lev}x’te ${p0(1/P.lev)} ters hareket teminatı sıfırlar.`))}</p>
    <button class="go ${P.side==='L' ? 'b-buy' : 'b-sell'}" type="button" id="fut-go"${q ? '' : ' disabled'}>${esc((P.side==='L' ? 'Long ' : 'Short ')+s+' '+P.lev+'x')}</button><p class="msg" id="fut-msg" role="status">${esc(ST.fmsg||'')}</p>`; }
function futRows(Q){ return ST.fut ? Object.values(ST.fut.pos).map(p=>({ p, q:Q[p.sym] })) : []; }
function futTable(Q){ const R=futRows(Q); if (!R.length) return `<p class="empty">${esc(L2('No futures positions.','Vadeli pozisyon yok.'))}</p>`;
  return `<table class="tbl"><thead><tr><th>${esc(L2('Coin','Varlık'))}</th><th>${esc(L2('Side','Yön'))}</th><th class="r">${esc(L2('Size','Büyüklük'))}</th><th class="r">${esc(L2('Entry','Giriş'))}</th><th class="r">${esc(L2('Mark','Fiyat'))}</th><th class="r">${esc(L2('Liquidation','Tasfiye'))}</th><th class="r">${esc(L2('Margin','Teminat'))}</th><th class="r">P/L (ROE)</th><th class="r">${esc(L2('Funding paid','Ödenen fonlama'))}</th><th></th></tr></thead><tbody>
    ${R.map(({ p, q })=>{ const u=q ? futUPL(p, q.last) : 0, dist=q ? Math.abs(p.liq/q.last-1) : 1; return `<tr class="${dist<.03 ? 'liq-hot' : dist<.08 ? 'liq-warm' : ''}"><td><b>${esc(p.sym)}</b></td><td class="${p.side>0 ? 'up' : 'down'}">${p.side>0 ? 'Long' : 'Short'} ${p.lev}x</td><td class="r mono">${fq(p.qty,'crypto')}</td><td class="r mono">$${fpx(p.entry)}</td><td class="r mono">${q ? '$'+fpx(q.last) : '—'}</td><td class="r mono down">$${fpx(p.liq)}</td><td class="r mono">${money(p.margin)}</td><td class="r mono ${cls(u)}">${money(u)} (${pct(u/p.margin)})</td><td class="r mono">${money(-p.fund)}</td><td><button class="ghost" type="button" data-fut-close="${esc(p.sym)}">${esc(L2('Close','Kapat'))}</button></td></tr>`; }).join('')}</tbody></table>`; }
document.addEventListener('click', e=>{ const t=e.target, P=ST.fp||(ST.fp={ side:'L', type:'mkt', lev:5, m:500 });
  const sd=t.closest('[data-fut-side]'); if (sd){ P.side=sd.dataset.futSide; save(); render(); return; } const ty=t.closest('[data-fut-type]'); if (ty){ P.type=ty.dataset.futType; save(); render(); return; }
  const mk=t.closest('[data-mkt]'); if (mk){ ST.mkt=mk.dataset.mkt; save(); render(); return; }
  if (t.closest('#fut-go')){ const s=ST.sel, q=quote(s); if (!q) return; const side=P.side==='L' ? 1 : -1, tp=+P.tp||null, sl=+P.sl||null;
    if (P.type==='lmt'){ const px=+P.px; if (!(px>0)){ ST.fmsg=L2('Enter a limit price.','Limit fiyatı gir.'); render(); return; } const F=futAcct(); F.orders.push({ id:F.nid++, sym:s, side:P.side, type:'lmt', px, lev:P.lev, m:+P.m, tp, sl, status:'open', t:Date.now() }); ST.fmsg=L2(`Limit order placed at $${fpx(px)}.`,`$${fpx(px)} limit emri verildi.`); save(); render(); return; }
    const r=futOpen(s, side, P.lev, +P.m, side>0 ? (q.ask||q.last) : (q.bid||q.last), false, { tp, sl }); ST.fmsg=r.msg; save(); render(); return; }
  const c=t.closest('[data-fut-close]'); if (c){ const s=c.dataset.futClose, q=quote(s), p=ST.fut && ST.fut.pos[s]; if (p && q){ const pl=futClose(s, p.side>0 ? (q.bid||q.last) : (q.ask||q.last), 'close'); toast(L2(`Closed: ${money(pl)}`,`Kapatıldı: ${money(pl)}`)); save(); render(); } return; }
  const fc=t.closest('[data-fut-cancel]'); if (fc && ST.fut){ const o=ST.fut.orders.find(x=>x.id===+fc.dataset.futCancel); if (o) o.status='cancelled'; save(); render(); } });
document.addEventListener('change', e=>{ const t=e.target, P=ST.fp; if (!P) return; const map={ 'fut-lev':'lev', 'fut-m':'m', 'fut-px':'px', 'fut-tp':'tp', 'fut-sl':'sl' }; if (map[t.id]){ P[map[t.id]]=t.id==='fut-lev' ? +t.value : t.value===''? '' : +t.value; save(); render(); } });
document.addEventListener('input', e=>{ if (e.target.id==='fut-lev' && ST.fp){ ST.fp.lev=+e.target.value; render(); } });
TRP.push([/^Futures: (\w+) (long|short) liquidated at \$([\d.,]+); the margin is lost$/, m=>`Vadeli: ${m[1]} ${m[2]} $${m[3]} fiyatından tasfiye edildi; teminat kayboldu`]);

// ---- in the Trade screen: a Spot / Futures switch above the ticket
function futAfter(Q){ const col=$$('#v-trade .tr-col')[1], tk=$('#tk'); if (!col || !tk) return;
  if (!$('#mk-sw')){ const sw=document.createElement('div'); sw.id='mk-sw'; sw.className='pn mk-sw'; col.insertBefore(sw, col.firstChild); const fp=document.createElement('div'); fp.id='fut-tk'; fp.className='pn'; tk.after(fp); }
  setHTML($('#mk-sw'), `<span class="seg" role="group" aria-label="${esc(L2('Market','Piyasa'))}"><button type="button" data-mkt="spot" aria-pressed="${ST.mkt!=='fut'}">Spot</button><button type="button" data-mkt="fut" aria-pressed="${ST.mkt==='fut'}">${esc(L2('Futures (paper)','Vadeli (kâğıt)'))}</button></span><a class="bd-sub" href="#challenge">${esc(L2('🏆 Challenge','🏆 Sınav'))}</a> <a class="bd-sub" href="#report">${esc(L2('📊 Report','📊 Rapor'))}</a>`);
  const fp=$('#fut-tk'), fut=ST.mkt==='fut'; tk.hidden=fut; fp.hidden=!fut; if (!fut) return;
  if (fp.contains(document.activeElement) && $('#fut-calc')) setHTML($('#fut-calc'), futCalc(Q)); else setHTML(fp, futTicket(Q)); }

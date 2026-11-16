/* ---------- Phoenix Finance Club: the watchlist and alerts ----------
   Alerts are checked against every price update while the page is open; each fires once, then turns itself off.
   They show as a message here, in the inbox and, if you allow it, as a notification from your browser. */
const AL_KIND={ above:['Price rises above','Fiyat şunun üstüne çıkarsa'], below:['Price falls below','Fiyat şunun altına inerse'], up:['Day’s rise reaches (%)','Günlük yükseliş şuna ulaşırsa (%)'], down:['Day’s fall reaches (%)','Günlük düşüş şuna ulaşırsa (%)'] };
function wlInit(){ if (!Array.isArray(ST.watch)) ST.watch=['BTC','ETH','AAPL','NVDA']; if (!Array.isArray(ST.alerts)) ST.alerts=[]; if (!ST.erem) ST.erem={}; }
const wlHas = sym => ST.watch.includes(sym);
function wlToggle(sym){ if (wlHas(sym)) ST.watch=ST.watch.filter(s=>s!==sym); else ST.watch.push(sym); save(); render(); }
function alText(a){ const d=IM[a.sym], v=a.kind==='above' || a.kind==='below' ? '$'+fpx(a.v) : (a.kind==='up' ? '+' : '−')+F2.format(a.v)+'%'; return `${a.sym}: ${L2(...AL_KIND[a.kind])} ${v}`; }
function alFiredText(a, q){ const p='$'+fpx(q.last), ch=(q.chg>=0 ? '+' : '−')+F2.format(Math.abs(q.chg*100))+'%'; return { above:`${a.sym} rose above $${fpx(a.v)}: now ${p}`, below:`${a.sym} fell below $${fpx(a.v)}: now ${p}`,
  up:`${a.sym} is up ${ch} today (alert at +${F2.format(a.v)}%)`, down:`${a.sym} is down ${ch} today (alert at −${F2.format(a.v)}%)` }[a.kind]; }
function alNotify(msg){ try{ if ('Notification' in window && Notification.permission==='granted') new Notification('Phoenix Finance Club', { body:msg, tag:'tdl-'+msg.slice(0,40) }); }catch(e){} }
function alAdd(sym, kind, v){ const q=quote(sym); if (!(v>0)) return L2('Enter a value above zero.','Sıfırdan büyük bir değer gir.');
  if (q && kind==='above' && v<=q.last) return L2('That is already below the price now; pick a higher one.','Bu şu anki fiyatın zaten altında; daha yüksek bir değer seç.');
  if (q && kind==='below' && v>=q.last) return L2('That is already above the price now; pick a lower one.','Bu şu anki fiyatın zaten üstünde; daha düşük bir değer seç.');
  ST.alerts.push({ id:Date.now()+Math.random(), sym, kind, v, on:true, t:Date.now() }); if (!wlHas(sym)) ST.watch.push(sym);
  try{ if ('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }catch(e){} save(); return ''; }
// every price update: fire what has been reached; once a day: remind of reports in the next 24 hours
function alCheck(Q){ let n=0; for (const a of ST.alerts){ if (!a.on) continue; const q=Q[a.sym] || quote(a.sym); if (!q || !(q.last>0)) continue;
    const hit=a.kind==='above' ? q.last>=a.v : a.kind==='below' ? q.last<=a.v : a.kind==='up' ? q.chg!=null && q.chg*100>=a.v : q.chg!=null && -q.chg*100>=a.v; if (!hit) continue;
    a.on=false; a.fired=Date.now(); const m=alFiredText(a, q); note(m, '🔔'); toast(m); alNotify(T(m)); n++; }
  if (EARN.t) for (const r of EARN.up){ if (!(wlHas(r.sym) || ST.A.pos[r.sym])) continue; const left=r.next-Date.now(); if (left<0 || left>864e5 || ST.erem[r.sym]===r.next) continue;
    ST.erem[r.sym]=r.next; const m=`${r.sym} reports ${new Date(r.next).toLocaleDateString('en-US', { weekday:'short', day:'numeric', month:'short' })}, ${r.when===-1 ? 'before the open' : r.when===1 ? 'after the close' : 'time not set'}${r.eps!=null ? `; expected EPS ${usd2(r.eps)}` : ''}`; note(m, '📅'); toast(m); alNotify(T(m)); n++; }
  if (n) save(); }
function wlRows(Q, n){ return ST.watch.slice(0, n||99).map(sym=>{ const q=Q[sym] || quote(sym), d=IM[sym], al=ST.alerts.filter(a=>a.sym===sym && a.on).length;
  return `<tr><td><a href="#trade" data-go="${esc(sym)}" class="mk-tk">${esc(sym)}</a> <span class="muted mk-nm">${esc(d ? d.name : '')}</span></td><td class="r mono">${q ? '$'+fpx(q.last) : '—'}</td><td class="r mono ${cls(q && q.chg)}">${q ? pct(q.chg) : ''}</td><td class="r">${al ? `<span class="chip">🔔 ${al}</span>` : ''}</td><td class="r"><button class="ghost sm" type="button" data-wl="${esc(sym)}" aria-label="${esc(L2('Remove '+sym+' from the watchlist', sym+' izleme listesinden çıkar'))}">×</button></td></tr>`; }).join(''); }
function wlTile(Q){ return ST.watch.length ? `<table class="tbl"><tbody>${wlRows(Q, 8)}</tbody></table>` : `<p class="bd-sub">${esc(L2('Star a coin or a stock on the Trade screen to follow it here.','İşlem ekranında bir coini ya da hisseyi yıldızla, burada takip et.'))}</p>`; }
function renderWatch(Q){ setHTML($('#wl-list'), ST.watch.length ? `<div class="tblw"><table class="tbl"><thead><tr><th>${esc(T('Instrument'))}</th><th class="r">${esc(T('Price'))}</th><th class="r">${esc(L2('Today','Bugün'))}</th><th class="r">${esc(L2('Alerts','Alarmlar'))}</th><th></th></tr></thead><tbody>${wlRows(Q)}</tbody></table></div>` : `<p class="empty">${esc(L2('Your watchlist is empty.','İzleme listen boş.'))}</p>`);
  const al=ST.alerts.slice().sort((a,b)=>(b.on-a.on) || b.t-a.t).slice(0, 40);
  setHTML($('#al-list'), al.length ? `<ul class="nw nw-s">${al.map(a=>`<li><span>${a.on ? '🔔' : '✓'} ${esc(alText(a))}</span><span class="nw-m">${a.on ? esc(L2('waiting','bekliyor')) : esc(L2('fired ','çaldı ')+ago(a.fired))} · <button class="ghost sm" type="button" data-al-del="${a.id}">${esc(L2('Delete','Sil'))}</button></span></li>`).join('')}</ul>` : `<p class="empty">${esc(L2('No alerts yet. Add one on the Trade screen.','Henüz alarm yok. İşlem ekranından ekle.'))}</p>`);
  const np=('Notification' in window) ? Notification.permission : 'unsupported';
  setHTML($('#al-perm'), np==='granted' ? esc(L2('Browser notifications are on.','Tarayıcı bildirimleri açık.')) : np==='denied' ? esc(L2('Browser notifications are blocked; alerts still show here and in the inbox.','Tarayıcı bildirimleri engelli; alarmlar yine burada ve gelen kutusunda görünür.')) : np==='unsupported' ? esc(L2('This browser cannot show notifications; alerts show here and in the inbox.','Bu tarayıcı bildirim gösteremiyor; alarmlar burada ve gelen kutusunda görünür.')) : `<button class="ghost sm" type="button" id="al-ask">${esc(L2('Turn on browser notifications','Tarayıcı bildirimlerini aç'))}</button>`); }
function renderTradeWatch(sym, q){ const b=$('#tr-star'); if (b){ const on=wlHas(sym); b.textContent=on ? '★' : '☆'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? L2('Remove from the watchlist','İzleme listesinden çıkar') : L2('Add to the watchlist','İzleme listesine ekle')); }
  const ks=$('#al-kind'), lk=ST.lang; if (ks && ks.__k!==lk){ ks.__k=lk; ks.innerHTML=Object.keys(AL_KIND).map(k=>`<option value="${k}">${esc(L2(...AL_KIND[k]))}</option>`).join(''); }
  const my=ST.alerts.filter(a=>a.sym===sym && a.on); setHTML($('#al-mine'), my.length ? `<ul class="nw nw-s">${my.map(a=>`<li><span>🔔 ${esc(alText(a))}</span><span class="nw-m"><button class="ghost sm" type="button" data-al-del="${a.id}">${esc(L2('Delete','Sil'))}</button></span></li>`).join('')}</ul>` : '');
  const al=$('#al-tr'); if (al && al.__s!==sym && q){ al.__s=sym; $('#al-v').value=String(+(q.last*1.05).toFixed(pxd(q.last))); $('#al-kind').value='above'; txt('al-msg', ''); } }
document.addEventListener('click', e=>{ const t=e.target;
  if (t.closest('#tr-star')){ wlToggle(ST.sel); return; }
  const w=t.closest('[data-wl]'); if (w){ wlToggle(w.dataset.wl); return; }
  const d=t.closest('[data-al-del]'); if (d){ ST.alerts=ST.alerts.filter(a=>String(a.id)!==d.dataset.alDel); save(); render(); return; }
  if (t.closest('#al-go')){ const k=$('#al-kind').value, v=+$('#al-v').value, m=alAdd(ST.sel, k, v); txt('al-msg', m || L2('Alert set.','Alarm kuruldu.')); render(); return; }
  if (t.closest('#al-ask')){ try{ Notification.requestPermission().then(()=>render()); }catch(x){} return; } });
document.addEventListener('change', e=>{ if (e.target.id==='al-kind'){ const q=quote(ST.sel), k=e.target.value; if (q) $('#al-v').value = k==='above' ? String(+(q.last*1.05).toFixed(pxd(q.last))) : k==='below' ? String(+(q.last*.95).toFixed(pxd(q.last))) : '5'; } });

/* ---------- Phoenix Finance Club: when the site is hosted, the bots run on a server ----------
   On GitHub Pages (or with ?srv=<folder> for testing), the bots come from data/state.json, written every 5 minutes by a free GitHub Actions job,
   so they keep learning and trading while this page is closed. Your own strategy bots still run in your browser.
   The same job saves this week's economic calendar (data/calendar.json). The hosted site can also be installed as an app. */
const SRV={ url:null, st:null, cal:null, t:0, err:'' };
(function(){ try{ const q=new URLSearchParams(location.search).get('srv'); if (q) SRV.url=q.replace(/\/?$/, '/');
  else if (/\.github\.io$/.test(location.hostname)){ const owner=location.hostname.split('.')[0], first=location.pathname.split('/')[1], repo=first && !/\.html?$/.test(first) ? first : owner+'.github.io'; SRV.url=`https://raw.githubusercontent.com/${owner}/${repo}/data/`; } }catch(e){} })();
async function srvLoad(){ if (!SRV.url) return; const bust='?t='+Math.floor(Date.now()/60000);
  try{ const r=await fetch(SRV.url+'state.json'+bust, { cache:'no-store' }); if (!r.ok) throw new Error('HTTP '+r.status); const s=await r.json(); if (s && Array.isArray(s.bots)){ SRV.st=s; SRV.t=Date.now(); SRV.err=''; srvMerge(s); } }
  catch(e){ SRV.err=String(e.message||e); }
  try{ const r=await fetch(SRV.url+'calendar.json'+bust, { cache:'no-store' }); if (r.ok) SRV.cal=await r.json(); }catch(e){}
  try{ const r=await fetch(SRV.url+'arena.json?t='+Math.floor(Date.now()/3600e3), { cache:'no-store' }); if (r.ok) SRV.arena=await r.json(); }catch(e){}
  try{ const r=await fetch(SRV.url+'daily.json?t='+Math.floor(Date.now()/3600e3), { cache:'no-store' }); if (r.ok) SRV.daily=await r.json(); }catch(e){}
  try{ const r=await fetch(SRV.url+'forward.json?t='+Math.floor(Date.now()/3600e3), { cache:'no-store' }); if (r.ok) SRV.fwd=await r.json(); }catch(e){}
  try{ const r=await fetch(SRV.url+'obi_sum.json?t='+Math.floor(Date.now()/600e3), { cache:'no-store' }); if (r.ok) SRV.obi=await r.json(); }catch(e){}
  render(); }
// the server's bots replace the browser's; your own strategy bots stay
function srvMerge(s){ const mine=ST.ai.filter(b=>b.custom); ST.ai=s.bots.filter(aiKeep).map(b=>({ ...b, srv:true })).concat(mine); for (const b of mine) labRegister(b); }
function srvNote(){ if (!SRV.st) return SRV.url && SRV.err ? L2(`The server bots could not be loaded (${SRV.err}); the bots below run in this browser.`,`Sunucu botları yüklenemedi (${SRV.err}); aşağıdaki botlar bu tarayıcıda çalışıyor.`) : '';
  const m=Math.max(0, Math.round((Date.now()-SRV.st.t)/60000)); return L2(`These bots run on a server every 5 minutes, also while this page is closed. Last run ${m} min ago (run ${SRV.st.runs}).`,`Bu botlar her 5 dakikada bir sunucuda çalışır, bu sayfa kapalıyken de. Son çalışma ${m} dk önce (${SRV.st.runs}. çalışma).`); }
// the economic calendar, from the server's copy of ForexFactory's weekly file
function calTable(){ const C=SRV.cal; if (!C || !C.events) return ''; const now=Date.now(), ev=C.events.filter(e=>e.t>now-6*3600e3 && (e.impact==='High' || e.impact==='Medium')).sort((a,b)=>a.t-b.t).slice(0, 60); if (!ev.length) return '';
  const imp=i=>i==='High' ? L2('high','yüksek') : L2('medium','orta'); let last='';
  return `<h3 class="perf-h">${esc(L2('Economic calendar: the coming days (medium and high impact)','Ekonomik takvim: önümüzdeki günler (orta ve yüksek etkili)'))}</h3><div class="tblw"><table class="tbl"><thead><tr><th>${esc(L2('Day','Gün'))}</th><th>${esc(L2('Time','Saat'))}</th><th>${esc(L2('Country','Ülke'))}</th><th>${esc(L2('Release','Açıklama'))}</th><th>${esc(L2('Impact','Etki'))}</th><th class="r">${esc(L2('Forecast','Beklenti'))}</th><th class="r">${esc(L2('Previous','Önceki'))}</th></tr></thead><tbody>${ev.map(e=>{ const d=dayFmt(e.t), show=d!==last; last=d;
    return `<tr${e.t<now ? ' class="muted"' : ''}><td class="mono">${show ? esc(d) : ''}</td><td class="mono">${new Date(e.t).toLocaleTimeString(ST.lang==='tr'?'tr-TR':'en-US', { hour:'2-digit', minute:'2-digit' })}</td><td>${esc(e.country)}</td><td>${esc(e.title)}</td><td class="${e.impact==='High' ? 'down' : ''}">${esc(imp(e.impact))}</td><td class="r mono">${esc(e.forecast)}</td><td class="r mono">${esc(e.previous)}</td></tr>`; }).join('')}</tbody></table></div><p class="bd-sub">${esc(L2('Sources: ForexFactory (this week) and Nasdaq (the days after, US only), copied by the site’s server every few hours. Times are in your time zone.','Kaynaklar: ForexFactory (bu hafta) ve Nasdaq (sonraki günler, sadece ABD); sitenin sunucusu birkaç saatte bir kopyalar. Saatler senin saat diliminde.'))}</p>`; }
// installable as an app when served over https
(function(){ try{ if (location.protocol==='https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{}); }catch(e){} })();
setInterval(()=>{ if (SRV.url) srvLoad(); }, 120000);

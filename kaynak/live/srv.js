/* ---------- Phoenix Finance Club: the data the club's GitHub Actions job writes ----------
   On GitHub Pages (or with ?srv=<folder> for testing) the site reads the "data" branch of its repository:
   fund.json (the club fund, see club.js) and calendar.json (this week's economic calendar). The hosted site can also be installed as an app. */
const SRV={ url:null, cal:null, ct:0 };
(function(){ try{ const q=new URLSearchParams(location.search).get('srv'); if (q) SRV.url=q.replace(/\/?$/, '/');
  else if (/\.github\.io$/.test(location.hostname)){ const owner=location.hostname.split('.')[0], first=location.pathname.split('/')[1], repo=first && !/\.html?$/.test(first) ? first : owner+'.github.io'; SRV.url=`https://raw.githubusercontent.com/${owner}/${repo}/data/`; } }catch(e){} })();
async function srvLoad(){ if (!SRV.url) return; await fundLoad(false);
  if (Date.now()-SRV.ct>600000){ try{ const r=await fetch(SRV.url+'calendar.json?t='+Math.floor(Date.now()/600000), { cache:'no-store' }); if (r.ok){ SRV.cal=await r.json(); SRV.ct=Date.now(); } }catch(e){} }
  render(); }
// the economic calendar, from the server's copy of ForexFactory's weekly file
function calTable(){ const C=SRV.cal; if (!C || !C.events) return ''; const now=Date.now(), ev=C.events.filter(e=>e.t>now-6*3600e3 && (e.impact==='High' || e.impact==='Medium')).sort((a,b)=>a.t-b.t).slice(0, 60); if (!ev.length) return '';
  const imp=i=>i==='High' ? L2('high','yüksek') : L2('medium','orta'); let last='';
  return `<h3 class="perf-h">${esc(L2('Economic calendar: the coming days (medium and high impact)','Ekonomik takvim: önümüzdeki günler (orta ve yüksek etkili)'))}</h3><div class="tblw"><table class="tbl"><thead><tr><th>${esc(L2('Day','Gün'))}</th><th>${esc(L2('Time','Saat'))}</th><th>${esc(L2('Country','Ülke'))}</th><th>${esc(L2('Release','Açıklama'))}</th><th>${esc(L2('Impact','Etki'))}</th><th class="r">${esc(L2('Forecast','Beklenti'))}</th><th class="r">${esc(L2('Previous','Önceki'))}</th></tr></thead><tbody>${ev.map(e=>{ const d=dayFmt(e.t), show=d!==last; last=d;
    return `<tr${e.t<now ? ' class="muted"' : ''}><td class="mono">${show ? esc(d) : ''}</td><td class="mono">${new Date(e.t).toLocaleTimeString(ST.lang==='tr'?'tr-TR':'en-US', { hour:'2-digit', minute:'2-digit' })}</td><td>${esc(e.country)}</td><td>${esc(e.title)}</td><td class="${e.impact==='High' ? 'down' : ''}">${esc(imp(e.impact))}</td><td class="r mono">${esc(e.forecast)}</td><td class="r mono">${esc(e.previous)}</td></tr>`; }).join('')}</tbody></table></div><p class="bd-sub">${esc(L2('Sources: ForexFactory (this week) and Nasdaq (the days after, US only), copied by the site’s server every few hours. Times are in your time zone.','Kaynaklar: ForexFactory (bu hafta) ve Nasdaq (sonraki günler, sadece ABD); sitenin sunucusu birkaç saatte bir kopyalar. Saatler senin saat diliminde.'))}</p>`; }
// installable as an app when served over https
(function(){ try{ if (location.protocol==='https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{}); }catch(e){} })();
setInterval(()=>{ if (SRV.url && !document.hidden) srvLoad(); }, 600000);

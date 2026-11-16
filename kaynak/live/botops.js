/* ---------- Tidewater Live: the bot control centre ----------
   One card per bot: a status light, profit/loss, a 7-day line, how much of its money is in the market, its last decision,
   an off switch and your own loss limit (the bot stops itself if it falls that far from its best). A live log of every bot,
   and a risk-balanced split of capital (each bot weighted by the inverse of its volatility). */
function boStatus(bot){ const now=Date.now(); if (!bot.on) return ['off', L2('stopped','durduruldu')]; if (bot.pause>now) return ['brk', L2('circuit breaker','devre kesici')];
  if (Object.keys(bot.meta||{}).length) return ['pos', L2('in a position','pozisyonda')]; const e=typeof aiEdgeOn==='function' ? aiEdgeOn(bot) : null;
  if (e===false) return ['wait', L2('no edge yet: watching','henüz avantaj yok: izliyor')]; return ['ready', L2('ready','hazır')]; }
function boSpark(pts){ const xs=(pts||[]).filter(p=>p.t>=Date.now()-7*864e5).map(p=>p.v); if (xs.length<2) return '<span class="muted">—</span>'; const lo=Math.min(...xs), hi=Math.max(...xs), W=120, H=28, up=xs[xs.length-1]>=xs[0];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${xs.map((v,k)=>(k?'L':'M')+(k*(W-2)/(xs.length-1)+1).toFixed(1)+','+(H-2-(H-4)*((v-lo)/((hi-lo)||1))).toFixed(1)).join('')}" fill="none" stroke="${up ? 'var(--gain)' : 'var(--loss)'}" stroke-width="1.6"/></svg>`; }
function boDaily(pts){ const by=new Map(); for (const p of pts||[]) by.set(Math.floor(p.t/864e5), p.v); const v=[...by.values()], r=[]; for (let k=1;k<v.length;k++) if (v[k-1]>0) r.push(v[k]/v[k-1]-1); return r; }
const boVol = r => { if (r.length<3) return null; const m=r.reduce((a,b)=>a+b,0)/r.length; return Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/(r.length-1)); };
// your loss limits: checked after every bot step
function boGuard(Q){ const L=ST.botLim||{}, P=ST.botPeak||(ST.botPeak={}); let ch=false;
  for (const b of ST.ai||[]){ const E=brkEquity(b.A, Q); if (!(E>0)) continue; P[b.id]=Math.max(P[b.id]||E, E); const lim=L[b.id]; if (!lim || !b.on) continue;
    if ((P[b.id]-E)/P[b.id]>=lim/100){ b.on=false; ch=true; note(`${aiName(b.id)} was stopped by your loss limit (${lim}% from its best)`, '🛑'); if (typeof ntfySend==='function') ntfySend(T(`${aiName(b.id)} was stopped by your loss limit (${lim}% from its best)`), 'Tidewater'); } }
  if (ch) save(); }
TRP.push([/^(.+) was stopped by your loss limit \(([\d.]+)% from its best\)$/, m=>`${m[1]} kayıp sınırın yüzünden durduruldu (zirvesinden %${m[2]})`]);
function renderBotOps(Q){ let el=$('#bo-ops'); const host=$('#v-bots'); if (!host) return; if (!el){ el=document.createElement('div'); el.id='bo-ops'; const h1=host.querySelector('h1'); (h1 || host.firstChild).after(el); }
  const bots=(ST.ai||[]), L=ST.botLim||{}, now=Date.now(), counts={};
  const cards=bots.map(b=>{ const [k, txt]=boStatus(b), E=brkEquity(b.A, Q), pl=E/b.A.start-1, gross=Object.keys(b.A.pos).reduce((a,s)=>a+Math.abs(b.A.pos[s].q)*((Q[s] && Q[s].last) || b.A.pos[s].avg), 0), th=Object.values(b.think||{}).sort((a,c)=>c.t-a.t)[0];
    counts[k]=(counts[k]||0)+1; const info=AI_INFO[b.id]||{ ico:'🤖' };
    return `<article class="bo-card bo-${k}"><header><span class="bo-led" aria-hidden="true"></span><b>${info.ico} ${esc(aiName(b.id))}</b><span class="bo-st">${esc(txt)}</span></header>
      <div class="bo-row"><span class="mono ${cls(pl)}">${pct(pl)}</span>${boSpark(b.eqi)}<span class="mono muted" title="${esc(L2('share of its money in the market','parasının piyasadaki payı'))}">${p0(E>0 ? gross/E : 0)}</span></div>
      <p class="bo-last">${th ? esc(aiText(th.code, th.vals)) : '—'}</p>
      <footer><button type="button" class="${b.on ? 'ghost' : 'go'}" data-bo-on="${esc(b.id)}" aria-pressed="${b.on}">${esc(b.on ? L2('Stop','Durdur') : L2('Start','Başlat'))}</button>
        <label class="bo-lim" for="bo-lim-${esc(b.id)}">${esc(L2('Stop after a fall of','Şu düşüşte durdur'))} <select id="bo-lim-${esc(b.id)}" data-bo-lim="${esc(b.id)}">${[0,5,10,15,20,30].map(v=>`<option value="${v}"${(L[b.id]||0)===v ? ' selected' : ''}>${v ? v+'%' : L2('off','kapalı')}</option>`).join('')}</select></label></footer></article>`; }).join('');
  // the live log
  const log=bots.flatMap(b=>(b.log||[]).slice(-15).map(x=>({ ...x, bot:b.id }))).sort((a,c)=>c.t-a.t).slice(0, 40), act={ b:L2('BUY','AL'), s:L2('SELL','SAT'), ss:L2('SHORT','AÇIĞA SAT'), bc:L2('COVER','GERİ AL') };
  const logHTML=log.map(x=>`<li><time>${new Date(x.t).toLocaleTimeString(ST.lang==='tr'?'tr-TR':'en-US', { hour12:false })}</time> <b>${esc(aiName(x.bot))}</b> <span class="${x.act==='b' || x.act==='bc' ? 'up' : 'down'}">${esc(act[x.act]||x.act)}</span> ${esc(x.sym)} @ $${fpx(x.px)}${x.pl!=null ? ` <span class="${cls(x.pl)}">${money(x.pl)}</span>` : ''} — <span class="muted">${esc(aiText(x.code, x.vals))}</span></li>`).join('');
  // risk-balanced split
  const rp=bots.map(b=>{ const v=boVol(boDaily(b.eqi)); return { b, v }; }).filter(x=>x.v>0), inv=rp.reduce((a,x)=>a+1/x.v, 0);
  const split=rp.length ? rp.sort((a,c)=>c.v-a.v).reverse().map(x=>`<tr><td>${esc(aiName(x.b.id))}</td><td class="r mono">${p0(x.v*Math.sqrt(365))}</td><td class="r mono">${p0(1/x.v/inv)}</td><td><div class="risk-bar"><i style="width:${(1/x.v/inv*100).toFixed(0)}%"></i></div></td></tr>`).join('') : '';
  setHTML(el, `<div class="pn"><div class="bd-th"><h2>${esc(L2('Control centre','Kontrol merkezi'))}</h2><span class="bd-sub">${esc(L2(`${counts.pos||0} in a position · ${counts.ready||0} ready · ${counts.wait||0} watching · ${counts.brk||0} breaker · ${counts.off||0} stopped`,`${counts.pos||0} pozisyonda · ${counts.ready||0} hazır · ${counts.wait||0} izliyor · ${counts.brk||0} devre kesici · ${counts.off||0} durduruldu`))}</span></div>
    <p class="bd-row" style="justify-content:flex-start;gap:8px"><button class="ghost" type="button" data-bo-all="off">⏹ ${esc(L2('Stop all','Hepsini durdur'))}</button><button class="ghost" type="button" data-bo-all="on">▶ ${esc(L2('Start all','Hepsini başlat'))}</button></p>
    <div class="bo-grid">${cards}</div></div>
    <div class="bo-two"><div class="pn"><div class="bd-th"><h2>${esc(L2('Live log','Canlı kayıt'))}</h2></div>${log.length ? `<ol class="bo-log" aria-live="off">${logHTML}</ol>` : `<p class="empty">${esc(L2('No trades yet.','Henüz işlem yok.'))}</p>`}</div>
      <div class="pn"><div class="bd-th"><h2>${esc(L2('Risk-balanced split','Risk dengeli dağılım'))}</h2></div><p class="bd-sub">${esc(L2('If you gave money to several bots: each bot’s share is set by the inverse of how much its account swings, so each brings about the same risk. Needs a few days of history.','Birkaç bota para verseydin: her botun payı, hesabının ne kadar salındığının tersine göre belirlenir; böylece her biri yaklaşık aynı riski getirir. Birkaç günlük geçmiş gerekir.'))}</p>
        ${split ? `<div class="tblw" tabindex="0" role="region" aria-label="${esc(L2('Split','Dağılım'))}"><table class="tbl"><thead><tr><th>${esc(L2('Bot','Bot'))}</th><th class="r">${esc(L2('Swings a year','Yıllık salınım'))}</th><th class="r">${esc(L2('Share','Pay'))}</th><th></th></tr></thead><tbody>${split}</tbody></table></div>` : `<p class="empty">${esc(L2('Not enough history yet.','Henüz yeterli geçmiş yok.'))}</p>`}</div></div>`); }
document.addEventListener('change', e=>{ const t=e.target; if (t.dataset && t.dataset.boLim){ ST.botLim=ST.botLim||{}; ST.botLim[t.dataset.boLim]=+t.value; (ST.botPeak||(ST.botPeak={}))[t.dataset.boLim]=0; save(); render(); } });
document.addEventListener('click', e=>{ const b1=e.target.closest('[data-bo-on]'); if (b1){ const b=(ST.ai||[]).find(x=>x.id===b1.dataset.boOn); if (b){ b.on=!b.on; if (b.on && ST.botPeak) ST.botPeak[b.id]=0; save(); render(); } return; } });
document.addEventListener('click', e=>{ const t=e.target.closest('[data-bo-all]'); if (!t) return; const on=t.dataset.boAll==='on'; for (const b of ST.ai||[]) b.on=on; save(); toast(on ? L2('All bots started','Tüm botlar başlatıldı') : L2('All bots stopped','Tüm botlar durduruldu')); render(); });

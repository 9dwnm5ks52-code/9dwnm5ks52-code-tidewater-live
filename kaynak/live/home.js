/* ---------- Tidewater Live: the Board as a bento (glass skin) ----------
   Extra tiles: "Today in one look" (a rule-based summary, no AI), this week's economic calendar, a semicircle gauge for
   the market mood, and the Strategy Desk's five real-money checks as dots. Everything comes from data the site already has. */
const HM = { sig:'' };
function hmTile(id, cls, title, inner){ return `<section class="bd-t ${cls}" id="t-${id}" aria-labelledby="t-${id}-h"><div class="bd-th"><h2 id="t-${id}-h">${esc(L2(...title))}</h2></div>${inner}</section>`; }
function hmTiles(){ return {
  today:hmTile('today', 'w2 hero hm-today', ['Today in one look','Bugün tek bakışta'], `<p class="hm-say" id="hm-say"></p><div class="hm-pills" id="hm-pills"></div>`),
  week:hmTile('week', 'w2 hm-week', ['This week','Bu hafta'], `<div class="hm-wk" id="hm-wk"></div>`),
  strat:hmTile('strat', 'w2 hm-strat', ['Strategy checks','Strateji kontrolleri'], `<div class="bd-row"><div><div class="bd-big" id="hm-pass"></div><p class="bd-sub" id="hm-pass-s"></p></div><a class="bd-more" href="#desk">${esc(L2('Open the Desk →','Masa’yı aç →'))}</a></div><ul class="hm-st" id="hm-st"></ul>`) }; }

// what a Desk strategy holds today: the live daily engine if the Desk has loaded, else the server's sealed forward record
function hmHold(id){ try{ if (typeof DLY!=='undefined' && DLY.D && typeof dlyToday==='function'){ const r=dlyToday(DLY.D)[id]; if (r) return r.now||{}; } }catch(e){}
  const F=(typeof SRV!=='undefined' && SRV.fwd) || ST.fwd, row=F && F.rows && F.rows[F.rows.length-1]; return row && row.w ? row.w[id]||{} : null; }
const hmSyms = w => Object.keys(w||{}).filter(s=>w[s]>.004).sort((a,b)=>w[b]-w[a]);
const hmStrats = () => { const A=typeof dkData==='function' ? dkData() : null; return A && Array.isArray(A.strats) ? A.strats : []; };
const hmName = id => { const S=(typeof DLY_STRATS!=='undefined' ? DLY_STRATS : []).find(x=>x.id===id); return S ? { ico:S.ico, n:L2(...S.name) } : { ico:'', n:id }; };
const hmUSD = () => { const C=typeof SRV!=='undefined' && SRV.cal; return C && Array.isArray(C.events) ? C.events.filter(e=>e.country==='USD' && (e.impact==='High' || e.impact==='Medium')) : []; };
const hmLoc = () => ST.lang==='tr' ? 'tr-TR' : 'en-US';
const hmTime = t => new Date(t).toLocaleTimeString(hmLoc(), { hour:'2-digit', minute:'2-digit', hour12:false });
const hmDay = t => new Date(t).toLocaleDateString(hmLoc(), { weekday:'short' });

function hmGauge(v){ // a semicircle from 0 (extreme fear) to 100 (extreme greed)
  const r=70, cx=90, cy=86, a=Math.PI*(1-Math.max(0, Math.min(100, v))/100), x=cx+r*Math.cos(a), y=cy-r*Math.sin(a);
  return `<svg class="hm-g" viewBox="0 0 180 100" aria-hidden="true"><defs><linearGradient id="hm-gr" x1="0" x2="1"><stop offset="0" stop-color="var(--loss)"/><stop offset=".5" stop-color="var(--warn)"/><stop offset="1" stop-color="var(--gain)"/></linearGradient></defs>`+
    `<path d="M20 86 A70 70 0 0 1 160 86" fill="none" stroke="var(--surface-3)" stroke-width="12" stroke-linecap="round"/>`+
    `<path d="M20 86 A70 70 0 0 1 160 86" fill="none" stroke="url(#hm-gr)" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="${Math.max(.5, v)} 100"/>`+
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="var(--surface-1)" stroke="var(--ink)" stroke-width="3"/></svg>`; }

function renderHome(Q){ try{
  const now=Date.now(), mood=+(($('#m-v')||{}).textContent||NaN), moodL=($('#m-l')||{}).textContent||'';
  // the mood gauge sits on top of the number
  const mg=$('#hm-gauge'); if (mg && isFinite(mood) && mg.__v!==mood){ mg.__v=mood; setHTML(mg, hmGauge(mood)); }
  // strategy checks (from the Desk's record since 2018)
  const SS=hmStrats(), pass=SS.filter(s=>s.ready && s.ready.ok), best=SS.slice().sort((a,b)=>(b.ready && b.ready.ok)-(a.ready && a.ready.ok) || b.cagr-a.cagr)[0];
  const ev=hmUSD().filter(e=>e.t>now).sort((a,b)=>a.t-b.t), next=ev.find(e=>e.impact==='High') || ev[0];
  const btc=Q.BTC, held=best ? hmSyms(hmHold(best.id)) : null;
  const sig=[ST.lang, ST.theme, mood, moodL, btc && btc.chg && btc.chg.toFixed(3), SS.length, held && held.join(), next && next.t, ev.length, Math.floor(now/6e4)].join('|');
  if (sig===HM.sig) return; HM.sig=sig;
  // today in one look: plain sentences built from rules
  const bits=[]; if (isFinite(mood)) bits.push(L2(`The market mood is <b>${esc(moodL.toLowerCase())}</b> (${mood}).`, `Piyasa havası <b>${esc(moodL.toLocaleLowerCase('tr'))}</b> (${mood}).`));
  if (btc && btc.chg!=null) bits.push(L2(`Bitcoin is <b>${esc(pct(btc.chg))}</b> in 24 hours.`, `Bitcoin 24 saatte <b>${esc(pct(btc.chg))}</b>.`));
  if (best){ const nm=hmName(best.id).n; bits.push(held==null ? L2(`The Desk’s strongest strategy is <b>${esc(nm)}</b>.`, `Masa’nın en güçlü stratejisi <b>${esc(nm)}</b>.`)
      : held.length ? L2(`<b>${esc(nm)}</b> holds <b>${esc(held.slice(0,4).join(', '))}</b> today.`, `<b>${esc(nm)}</b> bugün <b>${esc(held.slice(0,4).join(', '))}</b> tutuyor.`)
      : L2(`<b>${esc(nm)}</b> is in cash today.`, `<b>${esc(nm)}</b> bugün nakitte.`)); }
  if (next) bits.push(L2(`Next big US release: <b>${esc(next.title)}</b>, ${esc(hmDay(next.t))} ${esc(hmTime(next.t))}.`, `Sıradaki önemli ABD verisi: <b>${esc(next.title)}</b>, ${esc(hmDay(next.t))} ${esc(hmTime(next.t))}.`));
  setHTML($('#hm-say'), bits.join(' ') || esc(L2('Prices are coming in…','Fiyatlar geliyor…')));
  setHTML($('#hm-pills'), [[ '#desk', L2('Strategy Desk','Strateji Masası') ], [ '#trade', L2('Trade','İşlem yap') ], [ '#news', L2('Calendar & news','Takvim ve haberler') ]].map(([h, n])=>`<a class="hm-pill" href="${h}">${esc(n)}</a>`).join(''));
  // this week: Monday to Sunday, the US releases that move markets
  const d0=new Date(); d0.setHours(0,0,0,0); const mon=new Date(d0); mon.setDate(d0.getDate()-((d0.getDay()+6)%7));
  const all=hmUSD(), days=[...Array(7)].map((_,k)=>{ const a=new Date(mon); a.setDate(mon.getDate()+k); const b=new Date(a); b.setDate(a.getDate()+1); return { a:+a, b:+b, today:+a===+d0, ev:all.filter(e=>e.t>=+a && e.t<+b).sort((x,y)=>x.t-y.t) }; });
  const wk=$('#hm-wk'); if (wk) wk.classList.toggle('empty', !all.length); if (wk) setHTML(wk, !all.length ? `<p class="bd-sub">${esc(L2('The economic calendar comes from the server on the hosted site.','Ekonomik takvim, yayındaki sitede sunucudan gelir.'))}</p>`
    : days.map(D=>`<div class="hm-d${D.today ? ' on' : ''}${D.b<now ? ' past' : ''}"><div class="hm-dh"><span>${esc(new Date(D.a).toLocaleDateString(hmLoc(), { weekday:'short' }))}</span><b>${new Date(D.a).getDate()}</b></div>`+
      D.ev.slice(0,3).map(e=>`<div class="hm-ev ${e.impact==='High' ? 'hi' : ''}" title="${esc(e.title+' · '+hmTime(e.t)+(e.forecast ? ' · '+L2('forecast ','beklenti ')+e.forecast : ''))}"><b>${esc(e.title)}</b><span>${esc(hmTime(e.t))}</span></div>`).join('')+
      (D.ev.length>3 ? `<span class="hm-more">+${D.ev.length-3}</span>` : '')+`</div>`).join(''));
  // strategy checks as dots: one dot per real-money check, filled when it passed
  const ps=$('#hm-st'); if (ps){ txt('hm-pass', SS.length ? `${pass.length}/${SS.length}` : '—');
    txt('hm-pass-s', L2('strategies passed all five real-money checks','strateji beş gerçek para kontrolünün hepsini geçti'));
    setHTML(ps, SS.map(s=>{ const nm=hmName(s.id), c=(s.ready && s.ready.c)||[]; return `<li><span class="hm-sn">${nm.ico} ${esc(nm.n)}</span><span class="hm-dots" role="img" aria-label="${esc(L2(`${c.filter(x=>x[0]).length} of ${c.length} checks passed`, `${c.length} kontrolden ${c.filter(x=>x[0]).length} geçti`))}">${c.map(x=>`<i class="${x[0] ? 'ok' : ''}" title="${esc((x[0] ? '✓ ' : '✗ ')+L2(...x[1]))}"></i>`).join('')}</span><span class="hm-cg ${cls(s.cagr)}">${esc(pct(s.cagr))}</span></li>`; }).join('')); }
} catch(e){ console.error(e); } }

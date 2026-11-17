/* ---------- Phoenix Finance Club: the Board as a bento (glass skin) ----------
   Extra tiles: "Today in one look" (the fund in plain sentences, built from rules, no AI), this week's economic calendar,
   Everything comes from data the site already has. */
const HM = { sig:'' };
function hmTile(id, cls, title, inner){ return `<section class="bd-t ${cls}" id="t-${id}" aria-labelledby="t-${id}-h"><div class="bd-th"><h2 id="t-${id}-h">${esc(L2(...title))}</h2></div>${inner}</section>`; }
function hmTiles(){ return {
  today:hmTile('today', 'w2 hm-today', ['Today in one look','Bugün tek bakışta'], `<p class="hm-say" id="hm-say"></p><div class="hm-pills" id="hm-pills"></div>`),
  week:hmTile('week', 'w2 hm-week', ['This week','Bu hafta'], `<div class="hm-wk" id="hm-wk"></div>`) }; }
const hmUSD = () => { const C=typeof SRV!=='undefined' && SRV.cal; return C && Array.isArray(C.events) ? C.events.filter(e=>e.country==='USD' && (e.impact==='High' || e.impact==='Medium')) : []; };
const hmLoc = () => ST.lang==='tr' ? 'tr-TR' : 'en-US';
const hmTime = t => new Date(t).toLocaleTimeString(hmLoc(), { hour:'2-digit', minute:'2-digit', hour12:false });
const hmDay = t => new Date(t).toLocaleDateString(hmLoc(), { weekday:'short' });

function renderHome(Q){ try{
  const now=Date.now(), A=ST.A, FQ=fundQuotes(Q), E=fundEq(Q), d0=fundDayStart(), day=E-d0;
  // the fund's holdings, ranked by how they did today (a short gains when its price falls)
  const hs=Object.keys(A.pos).map(s=>{ const q=FQ[s], p=A.pos[s]; return q && q.chg!=null && !q.stale ? { s, r:q.chg*(p.q<0 ? -1 : 1), short:p.q<0 } : null; }).filter(Boolean).sort((a,b)=>b.r-a.r);
  const ev=hmUSD().filter(e=>e.t>now).sort((a,b)=>a.t-b.t), next=ev.find(e=>e.impact==='High') || ev[0];
  const sig=[ST.lang, ST.theme, ST.priv, Math.round(E), Math.round(day), hs.map(h=>h.s+h.r.toFixed(4)).join(), next && next.t, ev.length, CLUB.t, Math.floor(now/6e4)].join('|');
  if (sig===HM.sig) return; HM.sig=sig;
  // today in one look: plain sentences built from rules
  const bits=[], nm=h=>esc(h.s)+(h.short ? ' ('+esc(L2('short','açık'))+')' : '');
  bits.push(L2(`The fund is worth <b>${esc(money(E))}</b>, <b>${esc(pct(E/A.start-1))}</b> since it started with ${esc(money(A.start))}.`, `Fonun değeri <b>${esc(money(E))}</b>; ${esc(money(A.start))} ile başladığından beri <b>${esc(pct(E/A.start-1))}</b>.`));
  bits.push(L2(`Today: <b>${esc(money(day))} (${esc(pct(d0>0 ? day/d0 : 0))})</b>.`, `Bugün: <b>${esc(money(day))} (${esc(pct(d0>0 ? day/d0 : 0))})</b>.`));
  if (hs.length>1) bits.push(L2(`Best holding today: <b>${nm(hs[0])}</b> ${esc(pct(hs[0].r))}; worst: <b>${nm(hs[hs.length-1])}</b> ${esc(pct(hs[hs.length-1].r))}.`, `Bugünün en iyisi: <b>${nm(hs[0])}</b> ${esc(pct(hs[0].r))}; en kötüsü: <b>${nm(hs[hs.length-1])}</b> ${esc(pct(hs[hs.length-1].r))}.`));
  else if (hs.length===1) bits.push(L2(`Its one holding, <b>${nm(hs[0])}</b>, is ${esc(pct(hs[0].r))} today.`, `Tek varlığı <b>${nm(hs[0])}</b> bugün ${esc(pct(hs[0].r))}.`));
  else bits.push(L2('It holds only cash right now.', 'Şu an sadece nakit tutuyor.'));
  if (next) bits.push(L2(`Next big US release: <b>${esc(next.title)}</b>, ${esc(hmDay(next.t))} ${esc(hmTime(next.t))}.`, `Sıradaki önemli ABD verisi: <b>${esc(next.title)}</b>, ${esc(hmDay(next.t))} ${esc(hmTime(next.t))}.`));
  setHTML($('#hm-say'), bits.join(' '));
  setHTML($('#hm-pills'), [[ '#portfolio', L2('Holdings & trades','Varlıklar ve işlemler') ], [ '#trade', L2('Trade','İşlem yap') ], [ '#news', L2('Calendar & news','Takvim ve haberler') ]].map(([h, n])=>`<a class="hm-pill" href="${h}">${esc(n)}</a>`).join(''));
  // this week: Monday to Sunday, the US releases that move markets
  const t0=new Date(); t0.setHours(0,0,0,0); const mon=new Date(t0); mon.setDate(t0.getDate()-((t0.getDay()+6)%7));
  const all=hmUSD(), days=[...Array(7)].map((_,k)=>{ const a=new Date(mon); a.setDate(mon.getDate()+k); const b=new Date(a); b.setDate(a.getDate()+1); return { a:+a, b:+b, today:+a===+t0, ev:all.filter(e=>e.t>=+a && e.t<+b).sort((x,y)=>x.t-y.t) }; });
  const wk=$('#hm-wk'); if (wk) wk.classList.toggle('empty', !all.length); if (wk) setHTML(wk, !all.length ? `<p class="bd-sub">${esc(L2('The economic calendar comes from the club’s job on the hosted site.','Ekonomik takvim, yayındaki sitede kulübün görevinden gelir.'))}</p>`
    : days.map(D=>`<div class="hm-d${D.today ? ' on' : ''}${D.b<now ? ' past' : ''}"><div class="hm-dh"><span>${esc(new Date(D.a).toLocaleDateString(hmLoc(), { weekday:'short' }))}</span><b>${new Date(D.a).getDate()}</b></div>`+
      D.ev.slice(0,3).map(e=>`<div class="hm-ev ${e.impact==='High' ? 'hi' : ''}" title="${esc(e.title+' · '+hmTime(e.t)+(e.forecast ? ' · '+L2('forecast ','beklenti ')+e.forecast : ''))}"><b>${esc(e.title)}</b><span>${esc(hmTime(e.t))}</span></div>`).join('')+
      (D.ev.length>3 ? `<span class="hm-more">+${D.ev.length-3}</span>` : '')+`</div>`).join(''));
} catch(e){ console.error(e); } }

/* ---------- Phoenix Finance Club: the professional shell ----------
   An account bar that is always in view (which account, equity, today's P/L, buying power, futures margin, open risk),
   switching between your main account and a challenge account, a command palette (Ctrl+K), keyboard shortcuts,
   compact density and a colour-blind-safe palette. */
const UI={ pal:false, palQ:'', palI:0, help:false };
// ---- accounts: the main paper account and, during a challenge, a separate one; ST.A always points at the one in use
function acctInit(){ ST.accts=ST.accts||{}; if (!ST.accts.main) ST.accts.main=ST.A; const k=ST.acct && ST.accts[ST.acct] ? ST.acct : 'main'; ST.acct=k; ST.A=ST.accts[k]; }
function acctUse(k){ if (!ST.accts || !ST.accts[k]) return; ST.acct=k; ST.A=ST.accts[k]; save(); render(); }
const acctName = k => k==='ch' ? L2('Challenge account','Sınav hesabı') : L2('Main account','Ana hesap');
// ---- the account bar
function dayStartEq(E){ const d=Math.floor(Date.now()/864e5), m=ST.dayEq||(ST.dayEq={}), k=ST.acct||'main'; if (!m[k] || m[k].d!==d) m[k]={ d, v:E }; return m[k].v; }
function openRisk(A, Q){ let r=0, n=0; for (const s in A.pos){ const p=A.pos[s], q=Q[s]; if (!q || !(p.q>0)) continue; const st=A.orders.filter(o=>o.status==='open' && o.sym===s && o.side==='s' && (o.type==='stp' || o.type==='trl')).sort((a,b)=>b.px-a.px)[0];
    if (st) r+=Math.max(0, q.last-st.px)*Math.min(p.q, st.q); else { r+=p.q*q.last; n++; } } return { r, unprotected:n }; }
function renderAcctBar(){ let el=$('#acct'); if (!el){ el=document.createElement('div'); el.id='acct'; el.className='acct'; el.setAttribute('role','region'); el.setAttribute('aria-label', 'Account'); const h=$('.lv-top'); if (h) h.after(el); else return; }
  const Q=quotesAll(), A=ST.A, E=brkEquity(A, Q), d0=dayStartEq(E), day=E-d0, R=openRisk(A, Q), F=typeof futSummary==='function' ? futSummary(Q) : null, ks=Object.keys(ST.accts||{ main:1 });
  setHTML(el, `<label class="acct-sel" for="acct-k"><span class="sr">${esc(L2('Account','Hesap'))}</span><select id="acct-k">${ks.map(k=>`<option value="${k}"${k===ST.acct ? ' selected' : ''}>${esc(acctName(k))}</option>`).join('')}</select></label>
    <span><small>${esc(L2('Equity','Varlık'))}</small><b class="mono">${money(E)}</b></span>
    <span><small>${esc(L2('Today','Bugün'))}</small><b class="mono ${cls(day)}">${money(day)} <i>${pct(d0>0 ? day/d0 : 0)}</i></b></span>
    <span><small>${esc(L2('Buying power','Alım gücü'))}</small><b class="mono">${money(brkFree(A))}</b></span>
    <span title="${esc(L2('What you would lose if every stop were hit; positions without a stop count in full','Her stop gelirse kaybedeceğin; stopsuz pozisyonlar tamamen sayılır'))}"><small>${esc(L2('Open risk','Açık risk'))}</small><b class="mono ${R.unprotected ? 'down' : ''}">${money(R.r)}${R.unprotected ? ` <i>${esc(L2(`${R.unprotected} without stop`,`${R.unprotected} stopsuz`))}</i>` : ''}</b></span>
    ${F ? `<span><small>${esc(L2('Futures wallet','Vadeli cüzdan'))}</small><b class="mono">${money(F.eq)} <i class="${cls(F.upl)}">${money(F.upl)}</i></b></span><span><small>${esc(L2('Margin used','Kullanılan teminat'))}</small><b class="mono">${money(F.margin)}</b></span>` : ''}
    ${ST.acct==='ch' && ST.ch ? `<a class="acct-ch" href="#challenge">${esc(L2('Challenge: ','Sınav: '))}${esc(chStatusText ? chStatusText() : '')}</a>` : ''}`); }
// ---- the command palette (Ctrl+K or /)
const PAL_VIEWS=[['welcome',['Welcome','Tanıtım']],['board',['Board','Pano']],['trade',['Trade / Terminal','İşlem / Terminal']],['bots',['Bots','Botlar']],['desk',['Strategy Desk','Strateji Masası']],['journal',['Journal','Defter']],['report',['Performance report','Performans raporu']],['challenge',['Challenge','Sınav']],['markets',['US market','ABD piyasası']],['crypto',['Crypto','Kripto']],['news',['News','Haberler']],['arena',['Bot Arena','Bot Arenası']],['lab',['Strategy lab','Strateji laboratuvarı']],['learn',['Academy','Akademi']],['portfolio',['Portfolio','Portföy']],['settings',['Settings','Ayarlar']]];
function palItems(){ const q=UI.palQ.trim().toLowerCase(), it=[];
  for (const [v,n] of PAL_VIEWS) it.push({ k:'v:'+v, n:L2(...n), sub:L2('screen','ekran'), run:()=>{ location.hash='#'+v; } });
  for (const d of (typeof LIVE_CRYPTO!=='undefined' ? LIVE_CRYPTO : []).concat(typeof LIVE_US!=='undefined' ? LIVE_US : [])) it.push({ k:'s:'+d.sym, n:d.sym, sub:d.name, run:()=>{ ST.sel=d.sym; save(); location.hash='#trade'; render(); } });
  const act=(n, sub, run)=>it.push({ k:'a:'+n, n, sub, run });
  act(L2('Terminal mode on/off','Terminal modu aç/kapa'), L2('action','işlem'), ()=>{ ST.term=!ST.term; termApply(); location.hash='#trade'; save(); render(); });
  act(L2('Spot / futures ticket','Spot / vadeli emir'), L2('action','işlem'), ()=>{ ST.mkt=ST.mkt==='fut' ? 'spot' : 'fut'; ST.term=true; termApply(); location.hash='#trade'; save(); render(); });
  act(L2('Dark / light theme','Koyu / açık tema'), L2('action','işlem'), ()=>{ const b=$('#lv-theme'); if (b) b.click(); });
  act(L2('Türkçe / English','Türkçe / English'), L2('action','işlem'), ()=>{ const b=$('#lv-lang'); if (b) b.click(); });
  act(L2('Hide / show amounts','Tutarları gizle / göster'), L2('action','işlem'), ()=>{ ST.priv=!ST.priv; privApply(); save(); render(); });
  act(L2('Compact / comfortable density','Sıkı / rahat yoğunluk'), L2('action','işlem'), ()=>{ ST.dense=!ST.dense; uiApply(); save(); render(); });
  act(L2('Switch account','Hesap değiştir'), L2('action','işlem'), ()=>{ const ks=Object.keys(ST.accts||{}); if (ks.length>1) acctUse(ks[(ks.indexOf(ST.acct)+1)%ks.length]); });
  act(L2('Keyboard shortcuts','Klavye kısayolları'), '?', ()=>{ UI.help=true; uiOverlay(); });
  return q ? it.filter(x=>(x.n+' '+x.sub).toLowerCase().includes(q)).slice(0, 12) : it.slice(0, 12); }
function uiOverlay(){ let el=$('#pal'); if (!UI.pal && !UI.help){ if (el) el.hidden=true; return; } if (!el){ el=document.createElement('div'); el.id='pal'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); document.body.appendChild(el); } el.hidden=false;
  if (UI.help){ const keys=[['Ctrl+K /','command palette','komut paleti'],['B / S','buy / sell side','al / sat yönü'],['M / L','market / limit order','piyasa / limit emri'],['F','spot ↔ futures','spot ↔ vadeli'],['T','terminal mode','terminal modu'],['A','focus the amount','miktara odaklan'],['Shift+Enter','place the order (in the amount box)','emri gönder (miktar kutusunda)'],['Esc','cancel the newest open order on this coin','bu coindeki en yeni açık emri iptal et'],['?','this help','bu yardım']];
    setHTML(el, `<div class="pal-card"><div class="bd-th"><h2>${esc(L2('Keyboard shortcuts','Klavye kısayolları'))}</h2><button type="button" class="rp-x" data-pal-x aria-label="${esc(L2('Close','Kapat'))}">✕</button></div><table class="tbl"><tbody>${keys.map(k=>`<tr><td><kbd>${esc(k[0])}</kbd></td><td>${esc(L2(k[1],k[2]))}</td></tr>`).join('')}</tbody></table><p class="bd-sub">${esc(L2('Shortcuts work on the Trade screen when you are not typing in a box.','Kısayollar İşlem ekranında, bir kutuya yazmıyorken çalışır.'))}</p></div>`); el.querySelector('[data-pal-x]').focus(); return; }
  const its=palItems(); UI.palI=Math.min(UI.palI, Math.max(0, its.length-1));
  setHTML(el, `<div class="pal-card"><label class="sr" for="pal-q">${esc(L2('Search screens, coins and actions','Ekran, coin ve işlem ara'))}</label><input id="pal-q" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(L2('Search screens, coins and actions…','Ekran, coin ve işlem ara…'))}" value="${esc(UI.palQ)}">
    <ul class="pal-list" role="listbox" aria-label="${esc(L2('Results','Sonuçlar'))}">${its.map((x,k)=>`<li role="option" aria-selected="${k===UI.palI}" data-pal="${k}"><b>${esc(x.n)}</b><span>${esc(x.sub)}</span></li>`).join('')}</ul></div>`);
  const inp=$('#pal-q'); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
function palClose(){ UI.pal=false; UI.help=false; UI.palQ=''; UI.palI=0; uiOverlay(); }
function palRun(k){ const it=palItems()[k]; palClose(); if (it) it.run(); }
// ---- density and colour-blind palette
function uiApply(){ const h=document.documentElement; h.classList.toggle('dense', !!ST.dense); h.classList.toggle('cb', !!ST.cb); }
const typing = e => { const t=e.target; return t && (t.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(t.tagName)); };
document.addEventListener('keydown', e=>{
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); UI.pal=!UI.pal; UI.help=false; uiOverlay(); return; }
  if (UI.pal || UI.help){ if (e.key==='Escape'){ palClose(); return; } if (UI.pal){ const n=palItems().length; if (e.key==='ArrowDown'){ e.preventDefault(); UI.palI=(UI.palI+1)%Math.max(1,n); uiOverlay(); } else if (e.key==='ArrowUp'){ e.preventDefault(); UI.palI=(UI.palI-1+n)%Math.max(1,n); uiOverlay(); } else if (e.key==='Enter'){ e.preventDefault(); palRun(UI.palI); } } return; }
  if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key==='/'){ e.preventDefault(); UI.pal=true; uiOverlay(); return; } if (e.key==='?'){ UI.help=true; uiOverlay(); return; }
  if (typeof termKey==='function') termKey(e); });
document.addEventListener('input', e=>{ if (e.target.id==='pal-q'){ UI.palQ=e.target.value; UI.palI=0; const v=e.target.value; uiOverlay(); } });
document.addEventListener('click', e=>{ const t=e.target; const li=t.closest('[data-pal]'); if (li){ palRun(+li.dataset.pal); return; } if (t.closest('[data-pal-x]') || t.id==='pal'){ palClose(); return; }
  if (t.closest('[data-ui-dense]')){ ST.dense=!ST.dense; uiApply(); save(); render(); return; } if (t.closest('[data-ui-cb]')){ ST.cb=!ST.cb; uiApply(); save(); render(); return; } });
document.addEventListener('change', e=>{ if (e.target.id==='acct-k') acctUse(e.target.value); });

// ---- after every render: the account bar, the futures and challenge engines, the loss limits, and the screen-specific extras
function uiAfter(v, Q){ try{ document.documentElement.dataset.view=v; if (v==='board' && typeof renderHome==='function') renderHome(Q); renderAcctBar(); futTick(Q); chGuard(Q); boGuard(Q); if (v==='trade'){ futAfter(Q); termAfter(Q); if (typeof fdRender==='function') fdRender(); } if (v==='bots') renderBotOps(Q); }catch(e){ console.error(e); } }

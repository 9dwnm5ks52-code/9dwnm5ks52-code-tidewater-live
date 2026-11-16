/* ---------- Phoenix Finance Club: the professional shell ----------
   A bar with the fund's numbers that is always in view where you trade (value, today, cash, free cash, last update and
   whether this browser can trade), a command palette (Ctrl+K), keyboard shortcuts, compact density and a colour-blind-safe palette. */
const UI={ pal:false, palQ:'', palI:0, help:false };
// ---- the fund bar
function renderAcctBar(){ let el=$('#acct'); if (!el){ el=document.createElement('div'); el.id='acct'; el.className='acct'; el.setAttribute('role','region'); const h=$('.lv-top'); if (h) h.after(el); else return; }
  el.setAttribute('aria-label', L2('The club fund','Kulüp fonu'));
  const Q=quotesAll(), A=ST.A, E=fundEq(Q), d0=fundDayStart(), day=E-d0, mem=!!clubTok();
  setHTML(el, `<span class="acct-n"><small>${esc(L2('Account','Hesap'))}</small><b>${esc(L2('Phoenix Finance Club fund','Phoenix Finance Club fonu'))}</b></span>
    <span><small>${esc(L2('Value','Değer'))}</small><b class="mono">${money(E)}</b></span>
    <span><small>${esc(L2('Today','Bugün'))}</small><b class="mono ${cls(day)}">${money(day)} <i>${pct(d0>0 ? day/d0 : 0)}</i></b></span>
    <span><small>${esc(L2('Cash','Nakit'))}</small><b class="mono">${money(A.cash)}</b></span>
    <span title="${esc(L2('Cash not set aside for open limit buys','Açık limit alışlarına ayrılmamış nakit'))}"><small>${esc(L2('Free cash','Serbest nakit'))}</small><b class="mono">${money(brkFree(A))}</b></span>
    <span><small>${esc(L2('Updated','Güncellendi'))}</small><b class="mono">${esc(CLUB.fund ? fundAgo() : '—')}</b></span>
    <a class="acct-ch${mem ? ' on' : ''}" href="#settings">${esc(mem ? L2('Member: can trade','Üye: işlem yapabilir') : L2('View only','Sadece izleme'))}</a>`); }
// ---- the command palette (Ctrl+K or /)
const PAL_VIEWS=[['board',['Board','Pano']],['trade',['Trade / Terminal','İşlem / Terminal']],['portfolio',['The club fund (portfolio)','Kulüp fonu (portföy)']],['report',['Performance report','Performans raporu']],['markets',['US market','ABD piyasası']],['crypto',['Crypto','Kripto']],['news',['News','Haberler']],['settings',['Settings','Ayarlar']]];
function palItems(){ const q=UI.palQ.trim().toLowerCase(), it=[];
  for (const [v,n] of PAL_VIEWS) it.push({ k:'v:'+v, n:L2(...n), sub:L2('screen','ekran'), run:()=>{ location.hash='#'+v; } });
  for (const d of (typeof LIVE_CRYPTO!=='undefined' ? LIVE_CRYPTO : []).concat(typeof LIVE_US!=='undefined' ? LIVE_US : [])) it.push({ k:'s:'+d.sym, n:d.sym, sub:d.name, run:()=>{ ST.sel=d.sym; save(); location.hash='#trade'; render(); } });
  const act=(n, sub, run)=>it.push({ k:'a:'+n, n, sub, run });
  act(L2('Terminal mode on/off','Terminal modu aç/kapa'), L2('action','işlem'), ()=>{ ST.term=!ST.term; termApply(); location.hash='#trade'; save(); render(); });
  act(L2('Dark / light theme','Koyu / açık tema'), L2('action','işlem'), ()=>{ const b=$('#lv-theme'); if (b) b.click(); });
  act(L2('Türkçe / English','Türkçe / English'), L2('action','işlem'), ()=>{ const b=$('#lv-lang'); if (b) b.click(); });
  act(L2('Hide / show amounts','Tutarları gizle / göster'), L2('action','işlem'), ()=>{ ST.priv=!ST.priv; privApply(); save(); render(); });
  act(L2('Compact / comfortable density','Sıkı / rahat yoğunluk'), L2('action','işlem'), ()=>{ ST.dense=!ST.dense; uiApply(); save(); render(); });
  act(L2('Member access','Üye girişi'), L2('settings','ayarlar'), ()=>{ location.hash='#settings'; });
  act(L2('Keyboard shortcuts','Klavye kısayolları'), '?', ()=>{ UI.help=true; uiOverlay(); });
  return q ? it.filter(x=>(x.n+' '+x.sub).toLowerCase().includes(q)).slice(0, 12) : it.slice(0, 12); }
function uiOverlay(){ let el=$('#pal'); if (!UI.pal && !UI.help){ if (el) el.hidden=true; return; } if (!el){ el=document.createElement('div'); el.id='pal'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); document.body.appendChild(el); } el.hidden=false;
  if (UI.help){ const keys=[['Ctrl+K /','command palette','komut paleti'],['B / S','buy / sell side','al / sat yönü'],['M / L','market / limit order','piyasa / limit emri'],['T','terminal mode','terminal modu'],['A','focus the amount','miktara odaklan'],['Shift+Enter','send the order (in the amount box; members)','emri gönder (miktar kutusunda; üyeler)'],['?','this help','bu yardım']];
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

// ---- after every render: the fund bar and the screen-specific extras
function uiAfter(v, Q){ try{ document.documentElement.dataset.view=v; if (v==='board' && typeof renderHome==='function') renderHome(Q); renderAcctBar(); if (v==='trade'){ termAfter(Q); if (typeof fdRender==='function') fdRender(); } }catch(e){ console.error(e); } }

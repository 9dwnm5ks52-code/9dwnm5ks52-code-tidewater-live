/* ---------- Phoenix Finance Club: the shared fund in the browser ----------
   The fund lives in fund.json on the repository's "data" branch, written only by the club's GitHub Actions job (server/club.js).
   This page reads it (every 60 s) and shows it to everyone: ST.A IS the fund, and the page never changes it itself.
   Members trade by asking GitHub to run that job with their own token (fine-grained, this repository only, Actions read and write):
   the token is kept in this browser's localStorage under one key, sent only to api.github.com in a header, never in a URL,
   never in fund.json and never in a log. Everything read from fund.json (notes included) is escaped before it goes into HTML. */
const CLUB={ tok:'pfc-member-token', fund:null, t:0, err:'', polling:false, POLL:10000, WAIT:5*60e3, check:null };
// ---- the token: one key in localStorage, nowhere else
function clubTok(){ try{ return (localStorage.getItem(CLUB.tok)||'').trim(); }catch(e){ return ''; } }
function clubSetTok(v){ try{ v=String(v||'').trim(); if (v) localStorage.setItem(CLUB.tok, v); else localStorage.removeItem(CLUB.tok); }catch(e){} }
// ---- which repository: from the address on GitHub Pages (like SRV.url), or set in Settings for testing
function clubRepo(){ const o=String(ST.clubOwner||'').trim(), r=String(ST.clubRepo||'').trim(); if (o && r) return { owner:o, repo:r, set:true };
  try{ if (/\.github\.io$/.test(location.hostname)){ const owner=location.hostname.split('.')[0], first=location.pathname.split('/')[1], repo=first && !/\.html?$/.test(first) ? first : owner+'.github.io'; return { owner, repo }; } }catch(e){}
  return null; }
const clubOk = s => /^[A-Za-z0-9_.-]{1,100}$/.test(s);
function clubApi(path){ const R=clubRepo(); if (!R || !clubOk(R.owner) || !clubOk(R.repo)) return null; return `https://api.github.com/repos/${encodeURIComponent(R.owner)}/${encodeURIComponent(R.repo)}${path}`; }
const clubHead = () => ({ Accept:'application/vnd.github+json', Authorization:'Bearer '+clubTok(), 'X-GitHub-Api-Version':'2022-11-28' });
// ---- the fund: read from the data branch
const clubLooksLikeFund = f => f && typeof f==='object' && typeof f.cash==='number' && typeof f.start==='number' && f.pos && typeof f.pos==='object' && Array.isArray(f.orders) && Array.isArray(f.fills);
async function fundLoad(fresh){ if (!SRV.url) return; try{ const r=await fetch(SRV.url+'fund.json?t='+(fresh ? Date.now() : Math.floor(Date.now()/30000)), { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP '+r.status); const f=await r.json(); if (!clubLooksLikeFund(f)) throw new Error('not a fund');
    for (const [k, v] of [['done', {}], ['eq', []], ['prices', {}]]) if (!f[k] || typeof f[k]!=='object') f[k]=v;
    CLUB.fund=f; CLUB.t=Date.now(); CLUB.err=''; ST.A=f; clubResolve(); }
  catch(e){ CLUB.err=String(e.message||e); } render(); }
const fundAgo = () => CLUB.fund && CLUB.fund.t ? ago(CLUB.fund.t) : '';
// ---- the fund's value: live prices where the page has them, else the last price the server used
function fundQuotes(Q){ const A=ST.A, out={ ...Q }; for (const s of Object.keys(A.pos||{})) if (!out[s] && A.prices && A.prices[s]>0) out[s]={ kind:A.pos[s].kind, last:A.prices[s], stale:true }; return out; }
function fundEq(Q){ return brkEquity(ST.A, fundQuotes(Q)); }
// where the fund stood at the start of today (local time): the last value point before midnight
function fundDayStart(){ const A=ST.A, d0=new Date(); d0.setHours(0,0,0,0); let base=null; for (const p of A.eq||[]) if (p.t<+d0) base=p.v; return base!=null ? base : A.start; }
// ---- words for a trade
const fillAct = f => f.short ? 'short' : f.cover ? 'cover' : f.side==='b' ? 'buy' : 'sell';
const ordAct = o => o.short ? 'short' : o.cover ? 'cover' : o.side==='b' ? 'buy' : 'sell';
const ACT_N={ buy:['Buy','Al'], sell:['Sell','Sat'], short:['Short','Açığa sat'], cover:['Cover','Geri al'] };
const actName = a => L2(...ACT_N[a]);
const tFmt = t => new Date(t).toLocaleString(ST.lang==='tr'?'tr-TR':'en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
const whyT = w => L2(w, BRK_WHY_TR[w]||w);
// the public trade history: time, symbol, what, how much, price, value, profit, the member's note (plain text, escaped)
function clubTradesTable(fills, compact){ const fs=(fills||[]).slice().sort((a,b)=>b.t-a.t); if (!fs.length) return `<p class="empty">${esc(L2('No trades yet.','Henüz işlem yok.'))}</p>`;
  return `<table class="tbl tr-hist${compact ? ' compact' : ''}"><thead><tr><th>${esc(L2('Time','Zaman'))}</th><th>${esc(L2('Symbol','Sembol'))}</th><th>${esc(L2('Action','İşlem'))}</th><th class="r">${esc(L2('Quantity','Miktar'))}</th><th class="r">${esc(L2('Price','Fiyat'))}</th>${compact ? '' : `<th class="r">${esc(L2('Value','Değer'))}</th><th class="r">${esc(L2('Profit/loss','Kâr/zarar'))}</th>`}<th>${esc(L2('Note','Not'))}</th></tr></thead><tbody>${fs.map(f=>{ const a=fillAct(f), q=+f.q, px=+f.px;
    return `<tr><td class="mono">${esc(tFmt(f.t))}</td><td><b>${esc(f.sym)}</b></td><td class="${a==='buy' || a==='cover' ? 'up' : 'down'}">${esc(actName(a))}</td><td class="r mono">${esc(fq(q, f.kind==='stock' ? 'stock' : 'crypto'))}</td><td class="r mono">$${esc(fpx(px))}</td>${compact ? '' : `<td class="r mono">${money(q*px)}</td><td class="r mono ${cls(f.pl)}">${f.pl!=null && isFinite(+f.pl) ? money(+f.pl) : ''}</td>`}<td class="tr-note">${f.note ? esc(f.note) : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table>`; }
// open orders: public; members get a cancel button
function clubOrdersTable(orders, sym, compact){ const os=(orders||[]).filter(o=>o.status==='open' && (!sym || o.sym===sym)); if (!os.length) return `<p class="empty">${esc(L2('No open orders.','Açık emir yok.'))}</p>`; const mem=!!clubTok();
  return `<table class="tbl"><thead><tr><th>#</th><th>${esc(L2('Symbol','Sembol'))}</th><th>${esc(L2('Action','İşlem'))}</th><th>${esc(L2('Type','Tür'))}</th><th class="r">${esc(L2('Quantity','Miktar'))}</th><th class="r">${esc(L2('Price','Fiyat'))}</th>${compact ? '' : `<th>${esc(L2('Placed','Verildi'))}</th><th>${esc(L2('Note','Not'))}</th>`}${mem ? '<th></th>' : ''}</tr></thead><tbody>${os.map(o=>`<tr><td class="mono">${esc(o.id)}</td><td><b>${esc(o.sym)}</b></td><td>${esc(actName(ordAct(o)))}</td><td>${esc(o.type==='lmt' ? L2('Limit','Limit') : L2('Stop','Stop'))}</td><td class="r mono">${esc(fq(+o.q, o.kind==='stock' ? 'stock' : 'crypto'))}</td><td class="r mono">$${esc(fpx(+o.px))}</td>${compact ? '' : `<td class="mono">${esc(tFmt(o.t))}</td><td class="tr-note">${o.note ? esc(o.note) : '<span class="muted">—</span>'}</td>`}${mem ? `<td><button class="ghost sm" type="button" data-cancel="${esc(o.id)}"${clubPending('c'+o.id) ? ' disabled' : ''}>${esc(L2('Cancel','İptal'))}</button></td>` : ''}</tr>`).join('')}</tbody></table>`; }
// ---- sending an order: GitHub runs the club's job with it; the result appears in fund.json under its client id
function clubCid(){ const a=new Uint8Array(9); crypto.getRandomValues(a); return 'c'+Date.now().toString(36)+'-'+Array.from(a, b=>b.toString(36).padStart(2,'0')).join('').slice(0, 14); }
const clubPending = key => (ST.pend||[]).some(p=>p.key===key && !p.done);
function clubLockMsg(){ return L2('Only club members can trade. Everyone can follow the fund here.','Sadece kulüp üyeleri işlem yapabilir. Fonu herkes buradan izleyebilir.'); }
async function clubSend(order, where, key){ if (!clubTok()) return { ok:false, msg:clubLockMsg() };
  const url=clubApi('/actions/workflows/club.yml/dispatches'); if (!url) return { ok:false, msg:L2('This page does not know the club’s repository. Open the site from its GitHub Pages address, or set the repository in Settings.','Bu sayfa kulübün deposunu bilmiyor. Siteyi GitHub Pages adresinden aç ya da depoyu Ayarlar’da belirt.') };
  const cid=clubCid(); let r;
  try{ r=await fetch(url, { method:'POST', headers:{ ...clubHead(), 'Content-Type':'application/json' }, body:JSON.stringify({ ref:'main', inputs:{ order:JSON.stringify(order), cid } }) }); }
  catch(e){ return { ok:false, msg:L2('Could not reach GitHub. Check the connection and try again.','GitHub’a ulaşılamadı. Bağlantını kontrol edip tekrar dene.') }; }
  if (r.status===204 || r.status===200){ ST.pend=(ST.pend||[]).filter(p=>Date.now()-p.t<30*60e3).concat([{ cid, t:Date.now(), where, key:key||'', sym:order.sym||'' }]); save(); clubPoll();
    return { ok:true, sent:true, msg:L2('Sent. GitHub is executing it (about 1 minute)…','Gönderildi. GitHub işliyor (yaklaşık 1 dakika)…') }; }
  const why={ 401:L2('GitHub refused the token: it may have expired or been mistyped. Check it in Settings.','GitHub token’ı reddetti: süresi dolmuş ya da yanlış yazılmış olabilir. Ayarlar’dan kontrol et.'),
    403:L2('GitHub refused: the token needs “Actions: Read and write” for this repository, and your account must be a collaborator with write access.','GitHub reddetti: token’ın bu depo için “Actions: Read and write” izni olmalı ve hesabın yazma yetkili bir ortak çalışan olmalı.'),
    404:L2('GitHub does not show this repository or its club workflow to this token. Check the token’s repository access in Settings.','GitHub bu depoyu ya da kulüp iş akışını bu token’a göstermiyor. Token’ın depo erişimini Ayarlar’dan kontrol et.'),
    422:L2('GitHub could not start the club workflow (is it on the main branch?).','GitHub kulüp iş akışını başlatamadı (main dalında mı?).') }[r.status];
  return { ok:false, msg:why || L2(`GitHub answered ${r.status}. Try again in a minute.`,`GitHub ${r.status} yanıtı verdi. Bir dakika sonra tekrar dene.`) }; }
// after sending: check fund.json about every 10 seconds, for up to 5 minutes
async function clubPoll(){ if (CLUB.polling) return; CLUB.polling=true;
  try{ while ((ST.pend||[]).some(p=>!p.done && !p.late)){ await new Promise(r=>setTimeout(r, CLUB.POLL)); await fundLoad(true); } }
  finally { CLUB.polling=false; } }
function clubResolve(){ const A=ST.A, now=Date.now(); let ch=false;
  for (const p of ST.pend||[]){ if (p.done) continue; const r=A.done && A.done[p.cid];
    if (r && typeof r==='object'){ p.done=true; ch=true; const m={ en:String(r.msg||''), tr:String(r.tr||r.msg||'') }; ST.trMsg=ST.trMsg||{}; ST.trMsg[m.en]=m.tr;
      ST.tmsg=m; note(m.en, r.ok ? (r.fid ? '🟢' : '🕒') : '⚠️'); toast(m.en);
      const f=r.fid!=null && (A.fills||[]).find(x=>x.id===r.fid); if (f) ST.oj={ sym:f.sym, f, k:Date.now(), m }; }
    else if (!p.late && now-p.t>CLUB.WAIT){ p.late=true; ch=true; const m={ en:'No answer after 5 minutes. GitHub may be busy; if the order reached it, it will still be executed. Check the trade history later.', tr:'5 dakikadır yanıt yok. GitHub yoğun olabilir; emir GitHub’a ulaştıysa yine de işlenir. İşlem geçmişine sonra bak.' };
      ST.tmsg=m; } }
  ST.pend=(ST.pend||[]).filter(p=>!p.done && now-p.t<30*60e3); if (ch) save(); }
// the same checks as the server, on a copy of the fund and this page's prices, so an order that cannot work is not sent at all
function clubPrecheck(o){ const q=quote(o.sym); if (!q) return null; const A=JSON.parse(JSON.stringify(ST.A));
  if (o.side==='cover' && !(brkHeld(A, o.sym)<0)) return { en:`The fund is not short ${o.sym}; there is nothing to cover.`, tr:`Fonun ${o.sym} için açık pozisyonu yok; kapatılacak bir şey yok.` };
  const r=brkOrder(A, { sym:o.sym, kind:o.kind, side:o.side==='buy' || o.side==='cover' ? 'b' : 's', short:o.side==='short', type:o.type, q:o.q, usd:o.usd, px:o.px }, q);
  return r.ok ? null : { en:r.msg, tr:brkTr(r.msg) }; }
const msgT = m => m && typeof m==='object' ? L2(m.en, m.tr) : T(m||'');
// ---- Settings: member access
function clubCheck(){ const url=clubApi(''); if (!clubTok()){ CLUB.check={ ok:false, m:L2('Paste a token first.','Önce bir token yapıştır.') }; render(); return; }
  if (!url){ CLUB.check={ ok:false, m:L2('The repository is not known on this address: set it below.','Bu adreste depo bilinmiyor: aşağıdan belirt.') }; render(); return; }
  CLUB.check={ busy:true, m:L2('Checking with GitHub…','GitHub ile kontrol ediliyor…') }; render();
  (async()=>{ try{ const r=await fetch(url, { headers:clubHead() }); let m, ok=false;
      if (r.status===401) m=L2('GitHub refused this token (expired, revoked or mistyped).','GitHub bu token’ı reddetti (süresi dolmuş, iptal edilmiş ya da yanlış yazılmış).');
      else if (r.status===404 || r.status===403) m=L2('This token cannot see the club’s repository: when you make it, choose “Only select repositories” and pick this one.','Bu token kulübün deposunu göremiyor: oluştururken “Only select repositories” seçip bu depoyu işaretle.');
      else if (!r.ok) m=L2(`GitHub answered ${r.status}.`,`GitHub ${r.status} yanıtı verdi.`);
      else { const x=await r.json(); if (!(x.permissions && x.permissions.push)) m=L2('The token works, but this GitHub account is not a club member with write access yet. Ask the admin to add you as a collaborator, then accept the invitation.','Token çalışıyor ama bu GitHub hesabı henüz yazma yetkili bir kulüp üyesi değil. Yöneticiden seni ortak çalışan olarak eklemesini iste, sonra daveti kabul et.');
        else { const w=await fetch(clubApi('/actions/workflows/club.yml'), { headers:clubHead() });
          if (w.ok){ ok=true; m=L2('Works: you are a club member and this token can run the club’s workflow. You can trade.','Çalışıyor: kulüp üyesisin ve bu token kulübün iş akışını çalıştırabilir. İşlem yapabilirsin.'); }
          else m=L2('The token reaches the repository but not its Actions: give it “Actions: Read and write”.','Token depoya ulaşıyor ama Actions’a ulaşamıyor: ona “Actions: Read and write” izni ver.'); } }
      CLUB.check={ ok, m }; }
    catch(e){ CLUB.check={ ok:false, m:L2('Could not reach GitHub.','GitHub’a ulaşılamadı.') }; } render(); })(); }
function clubSettingsHTML(){ const R=clubRepo(), has=!!clubTok(), c=CLUB.check;
  return `<h2>${esc(L2('Member access','Üye girişi'))}</h2>
    <p class="bd-sub">${esc(L2('Everyone can follow the fund. Club members trade with a GitHub token that can do one thing only: start the club’s trading job on this repository. It stays in this browser and is sent only to GitHub.','Fonu herkes izleyebilir. Kulüp üyeleri tek bir işe yarayan bir GitHub token’ıyla işlem yapar: bu depoda kulübün işlem görevini başlatmak. Token bu tarayıcıda kalır ve sadece GitHub’a gönderilir.'))}</p>
    <p class="club-st ${has ? 'up' : ''}" id="club-st">${esc(has ? L2('A member token is saved in this browser.','Bu tarayıcıda bir üye token’ı kayıtlı.') : L2('View only: no member token in this browser.','Sadece izleme: bu tarayıcıda üye token’ı yok.'))} · ${esc(L2('Repository','Depo'))}: <b class="mono">${R ? esc(R.owner+'/'+R.repo) : esc(L2('not known here','burada bilinmiyor'))}</b></p>
    <label class="fld" for="club-tok"><span>${esc(L2('Member token (fine-grained personal access token)','Üye token’ı (fine-grained personal access token)'))}</span><input id="club-tok" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(has ? L2('saved; paste a new one to replace it','kayıtlı; değiştirmek için yenisini yapıştır') : 'github_pat_…')}"></label>
    <div class="bd-row club-btns"><button class="go" type="button" id="club-save">${esc(L2('Save','Kaydet'))}</button><button class="ghost" type="button" id="club-check"${has ? '' : ' disabled'}>${esc(L2('Check','Kontrol et'))}</button><button class="ghost" type="button" id="club-del"${has ? '' : ' disabled'}>${esc(L2('Remove','Sil'))}</button></div>
    <p class="msg ${c && c.ok ? 'up' : c && !c.busy ? 'down' : ''}" id="club-msg" role="status">${c ? esc(c.m) : ''}</p>
    <details class="club-how"><summary>${esc(L2('How to get a member token (5 minutes)','Üye token’ı nasıl alınır (5 dakika)'))}</summary><ol>
      <li>${esc(L2('Ask the club admin to add your GitHub account as a collaborator on the club’s repository, and accept the invitation. Use a GitHub username that is not your real name: GitHub shows which account started each run on its Actions page.','Kulüp yöneticisinden GitHub hesabını kulübün deposuna ortak çalışan (collaborator) olarak eklemesini iste ve daveti kabul et. Gerçek adın olmayan bir GitHub kullanıcı adı kullan: GitHub, Actions sayfasında her çalıştırmayı hangi hesabın başlattığını gösterir.'))}</li>
      <li>${esc(L2('On GitHub: your picture → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.','GitHub’da: profil resmin → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'))}</li>
      <li>${esc(L2('Resource owner: the account that owns the club’s repository. Repository access: “Only select repositories”, and pick only this repository. Permissions → Repository permissions → Actions: “Read and write” (Metadata: read is added by itself). Nothing else. Choose an expiry date, for example the end of the term.','Resource owner: kulübün deposunun sahibi olan hesap. Repository access: “Only select repositories” ve sadece bu depoyu seç. Permissions → Repository permissions → Actions: “Read and write” (Metadata: read kendiliğinden eklenir). Başka hiçbir şey. Bir bitiş tarihi seç, örneğin dönem sonu.'))}</li>
      <li>${esc(L2('Copy the token, paste it above, press Save, then Check. Never paste it anywhere else, not even in a chat with the club.','Token’ı kopyala, yukarıya yapıştır, Kaydet’e sonra Kontrol et’e bas. Başka hiçbir yere yapıştırma, kulüple yazışmalara bile.'))}</li>
      <li>${esc(L2('On a shared or school computer, press Remove when you are done.','Ortak ya da okul bilgisayarında işin bitince Sil’e bas.'))}</li></ol></details>
    <details class="club-how"><summary>${esc(L2('For testing: another repository','Test için: başka bir depo'))}</summary>
      <div class="fld-row"><label class="fld" for="club-owner"><span>${esc(L2('Owner','Sahip'))}</span><input id="club-owner" type="text" autocomplete="off" spellcheck="false" value="${esc(ST.clubOwner||'')}"></label><label class="fld" for="club-repo"><span>${esc(L2('Repository','Depo'))}</span><input id="club-repo" type="text" autocomplete="off" spellcheck="false" value="${esc(ST.clubRepo||'')}"></label></div>
      <button class="ghost" type="button" id="club-repo-save">${esc(L2('Use this repository','Bu depoyu kullan'))}</button></details>`; }
document.addEventListener('click', e=>{ const t=e.target;
  if (t.closest('#club-save')){ const i=$('#club-tok'), v=(i && i.value || '').trim(); if (!v){ CLUB.check={ ok:false, m:L2('Paste a token first.','Önce bir token yapıştır.') }; render(); return; }
    if (!/^[A-Za-z0-9_]{20,255}$/.test(v)){ CLUB.check={ ok:false, m:L2('That does not look like a GitHub token.','Bu bir GitHub token’ına benzemiyor.') }; render(); return; }
    clubSetTok(v); i.value=''; CLUB.check={ ok:true, m:L2('Saved in this browser. Press Check to test it.','Bu tarayıcıya kaydedildi. Denemek için Kontrol et’e bas.') }; render(); return; }
  if (t.closest('#club-del')){ clubSetTok(''); CLUB.check={ ok:true, m:L2('The token was removed from this browser.','Token bu tarayıcıdan silindi.') }; render(); return; }
  if (t.closest('#club-check')){ clubCheck(); return; }
  if (t.closest('#club-repo-save')){ const o=($('#club-owner').value||'').trim(), r=($('#club-repo').value||'').trim(); if ((o || r) && !(clubOk(o) && clubOk(r))){ CLUB.check={ ok:false, m:L2('Enter a GitHub owner and repository name.','Bir GitHub sahibi ve depo adı gir.') }; render(); return; }
    ST.clubOwner=o; ST.clubRepo=r; save(); CLUB.check=null; render(); return; } });
setInterval(()=>{ if (SRV.url && !document.hidden) fundLoad(false); }, 60000);

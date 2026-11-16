/* ---------- Tidewater Live: money you hand to a bot ----------
   The money moves from your cash into its own account, which copies the bot's portfolio in the same proportions:
   when the bot buys or sells, the account follows (checked every 30 seconds; differences under 2% are left alone, so it does not trade for crumbs).
   It pays the same prices and fees as everyone. Withdrawing sells everything and returns the cash to you. */
function mgInit(){ if (!Array.isArray(ST.mg)) ST.mg=[]; }
function mgEq(Q){ let v=0; for (const m of ST.mg||[]) v+=brkEquity(m.A, Q); return v; }
function totalEq(Q){ return brkEquity((ST.accts && ST.accts.main) || ST.A, Q)+mgEq(Q); }
function mgGive(botId, usd){ const bot=ST.ai.find(b=>b.id===botId); if (!bot) return { ok:false, msg:L2('Pick a bot.','Bir bot seç.') };
  if (!(usd>=100)) return { ok:false, msg:L2('Hand over at least $100.','En az $100 ver.') }; if (usd>brkFree(ST.A)) return { ok:false, msg:T('Not enough cash for this order.') };
  ST.A.cash-=usd; let m=ST.mg.find(x=>x.bot===botId); if (m){ m.A.cash+=usd; m.A.start+=usd; m.in+=usd; } else { m={ bot:botId, A:brkNew(usd), in:usd, t:Date.now() }; ST.mg.push(m); }
  const msg=`$${F2.format(usd)} handed to ${aiName(botId)}. It now copies the bot’s portfolio.`; note(msg, '🤝'); mgSync(quotesAll(), Date.now()); save(); return { ok:true, msg }; }
// sell everything in a managed account at the live prices; false while a holding has no price yet (or its market is closed)
function mgSellAll(m, Q){ for (const s of Object.keys(m.A.pos)){ const q=Q[s] || quote(s); if (!q || !(q.last>0) || (q.kind==='stock' && !q.open)) return false; }
  for (const s of Object.keys(m.A.pos)){ const q=Q[s] || quote(s); brkOrder(m.A, { sym:s, kind:m.A.pos[s].kind, side:'s', q:m.A.pos[s].q }, q); } return true; }
function mgTake(botId, Q){ const i=ST.mg.findIndex(x=>x.bot===botId); if (i<0) return { ok:false, msg:'' }; const m=ST.mg[i];
  if (!mgSellAll(m, Q)) return { ok:false, msg:L2('It holds US stocks and the market is closed; withdraw when it opens.','ABD hissesi tutuyor ve piyasa kapalı; piyasa açılınca çek.') };
  const back=m.A.cash, r=back/m.in-1; ST.A.cash+=back; ST.mg.splice(i, 1);
  const msg=`Withdrew $${F2.format(back)} from ${aiName(botId)} (${pct(r)}).`; note(msg, '💵'); save(); return { ok:true, msg }; }
// an account that follows a bot no longer in the roster (a retired one) is closed the same way, as soon as its holdings have prices:
// the money goes back to your main account's cash, with a note in your inbox (in both languages)
function mgOrphans(Q){ let n=0; for (const m of (ST.mg||[]).slice()){ if ((ST.ai||[]).some(b=>b.id===m.bot) || !mgSellAll(m, Q||{})) continue;
    const back=m.A.cash, main=(ST.accts && ST.accts.main) || ST.A, nm=(typeof AI_GONE!=='undefined' && AI_GONE[m.bot]) || aiName(m.bot), sv=ST.lang; main.cash+=back; ST.mg.splice(ST.mg.indexOf(m), 1); n++;
    ST.lang='en'; const en=`${nm} was retired: it did not beat simply holding Bitcoin in the Arena. The money you handed it is back in your cash: $${F2.format(back)} (${pct(back/m.in-1)}).`;
    ST.lang='tr'; const tr=`${nm} kaldırıldı: Arena’da Bitcoin’i elde tutmaktan daha iyi sonuç vermedi. Ona verdiğin para nakdine döndü: $${F2.format(back)} (${pct(back/m.in-1)}).`; ST.lang=sv;
    ST.trMsg=ST.trMsg||{}; ST.trMsg[en]=tr; note(en, '💵'); }
  if (n) save(); return n; }
// bring each account in line with its bot's weights
function mgSync(Q, now){ mgOrphans(Q); let n=0; for (const m of ST.mg||[]){ const bot=ST.ai.find(b=>b.id===m.bot); if (!bot) continue; const BE=brkEquity(bot.A, Q), ME=brkEquity(m.A, Q); if (!(BE>0) || !(ME>0)) continue;
    const want={}; for (const s of Object.keys(bot.A.pos)){ const q=Q[s] || quote(s); if (q && bot.A.pos[s].q>0) want[s]=bot.A.pos[s].q*q.last/BE; }
    const syms=new Set(Object.keys(want).concat(Object.keys(m.A.pos))), band=Math.max(10, ME*.02);
    for (const s of syms){ const q=Q[s] || quote(s); if (!q || !(q.last>0) || (q.kind==='stock' && !q.open)) continue; const have=(m.A.pos[s] ? m.A.pos[s].q : 0)*q.last, diff=(want[s]||0)*ME-have;
      if (diff<-band || (!want[s] && have>0)){ const qty=want[s] ? Math.min(m.A.pos[s].q, -diff/q.last) : m.A.pos[s].q; if (brkOrder(m.A, { sym:s, kind:m.A.pos[s].kind, side:'s', q:qty }, q, now).ok) n++; } }
    for (const s of Object.keys(want)){ const q=Q[s] || quote(s); if (!q || !(q.last>0) || (q.kind==='stock' && !q.open)) continue; const have=(m.A.pos[s] ? m.A.pos[s].q : 0)*q.last, diff=want[s]*ME-have;
      if (diff>band){ const usd=Math.min(diff, brkFree(m.A)/(1+BRK.FEES[q.kind])*.999); if (usd>=BRK.MIN_ORDER*5 && brkOrder(m.A, { sym:s, kind:q.kind, side:'b', usd }, q, now).ok) n++; } }
    m.last=now; }
  if (n) save(); return n; }
function mgRows(Q){ return (ST.mg||[]).map(m=>{ const E=brkEquity(m.A, Q), r=E/m.in-1, I=AI_INFO[m.bot];
  return `<tr><td>${I ? I.ico : ''} <b>${esc(AI_GONE[m.bot] || aiName(m.bot))}</b> <span class="muted">${esc(Object.keys(m.A.pos).join(', ')||L2('cash','nakit'))}</span></td><td class="r mono">${money(m.in)}</td><td class="r mono">${money(E)}</td><td class="r mono ${cls(r)}">${pct(r)}</td><td class="r"><button class="ghost sm" type="button" data-mg-take="${m.bot}">${esc(L2('Withdraw','Geri çek'))}</button></td></tr>`; }).join(''); }
function mgTable(Q){ return (ST.mg||[]).length ? `<div class="tblw"><table class="tbl"><thead><tr><th>${esc(T('Bots'))}</th><th class="r">${esc(L2('Handed over','Verilen'))}</th><th class="r">${esc(T('Value'))}</th><th class="r">${esc(L2('Return','Getiri'))}</th><th></th></tr></thead><tbody>${mgRows(Q)}</tbody></table></div>` : `<p class="empty">${esc(L2('You have not handed money to a bot yet.','Henüz bir bota para vermedin.'))}</p>`; }
document.addEventListener('click', e=>{ const t=e.target;
  if (t.closest('#mg-go')){ const r=mgGive($('#mg-bot').value, +$('#mg-usd').value); txt('mg-msg', T(r.msg)); if (r.ok) toast(r.msg); render(); return; }
  const tk=t.closest('[data-mg-take]'); if (tk){ const r=mgTake(tk.dataset.mgTake, quotesAll()); if (r.msg){ toast(r.msg); txt('mg-msg', T(r.msg)); } render(); return; } });

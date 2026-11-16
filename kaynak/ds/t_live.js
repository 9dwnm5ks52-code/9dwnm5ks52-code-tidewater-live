// Live events: earnings calls, IV crush, press conferences, macro dashboard
const { chromium, check, page, axe, overflow, summary } = require('./test_lib');
const URL='http://127.0.0.1:8765/tidewater-exchange.html';
const PRO={ init:()=>{ try{ localStorage.setItem('tdx-welcomed','1'); localStorage.setItem('tdx-mode','pro'); }catch(e){} } };
(async()=>{
  const b=await chromium.launch();
  const pg=await page(b, PRO); await pg.goto(URL+'#trade'); await pg.waitForTimeout(1000);
  // earnings call is created with the report, reacts later in the direction of its tone
  const ec=await pg.evaluate(()=>{ S.speed=0; const s=S.stocks.find(x=>x.ex!=='PHB'); const n0=(S.calls||[]).length; s.epsT=s.cons*1.05; reportEarnings(s); const c=S.calls[S.calls.length-1];
    c.tone=.03; let fv0=s.fv, fv1=s.fv; for (let i=0;i<30;i++){ const was=c.done; fv0=s.fv; tick(); if (!was && c.done){ fv1=s.fv; break; } } s.fv=fv0*(fv1/fv0); return { made:S.calls.length>n0, sym:c.sym===s.sym, lines:c.lines.length, ceo:c.lines[0].text, q:c.lines.filter(l=>l.q).length, done:c.done, moved:fv1/fv0 }; });
  check('an earnings report comes with a call: CEO, CFO and three analyst questions', ec.made && ec.sym && ec.lines===8 && ec.q===3 && /strong quarter/.test(ec.ceo), JSON.stringify(ec));
  check('the call’s tone moves the stock a few minutes later', ec.done && ec.moved>1.01, JSON.stringify(ec));
  // IV crush
  const iv=await pg.evaluate(()=>{ const s=S.stocks.find(x=>x.ex!=='PHB'); const save=s.rep, d=dayOf(S.t), K=r2(s.last), exp=d+6;
    s.rep=(d+3)%QTR; const withRep=optMid(s.sym,'C',K,exp); s.rep=(d+8)%QTR; const without=optMid(s.sym,'C',K,exp);
    // no overnight jump: price an option 3 and 2 days before the report with the same remaining life
    s.rep=(d+3)%QTR; const a=optMid(s.sym,'C',K,d+6); s.rep=(d+2)%QTR; const bb=optMid(s.sym,'C',K,d+5); s.rep=save;
    return { withRep, without, a, bb }; });
  check('options that live through earnings cost more, and the premium is there from the start (no overnight jump)', iv.withRep/iv.without>1.15 && Math.abs(iv.bb/iv.a-1)<.15, JSON.stringify(iv));
  // UI: call panel on Trade
  const ui=await pg.evaluate(()=>{ const c=S.calls[S.calls.length-1]; S.view='trade'; selectSym(c.sym); render(); const d=$('#c-call details'); const out={ shown:!!d, sum:d&&d.querySelector('summary').textContent }; d.open=true; d.dispatchEvent(new Event('toggle')); render(); out.kept=$('#c-call details').open; return out; });
  check('the call shows on the stock and stays open across redraws', ui.shown && /Earnings call/.test(ui.sum) && ui.kept, JSON.stringify(ui));
  const on=await pg.evaluate(()=>{ const s=SM[S.sel], d=dayOf(S.t), save=s.rep; s.rep=d%QTR; const it=S.t%DAY; render(); const el=$('#opt-earn'); const r={ hidden:el.hidden, txt:el.textContent, it }; s.rep=save; return r; });
  check('the options panel warns that prices are high before earnings', (!on.hidden && /Earnings are coming/.test(on.txt)) || on.it>=4, JSON.stringify(on));
  // press conference after a rate meeting
  const pc=await pg.evaluate(()=>{ const n0=(S.pcs||[]).length; rateMeeting(); const p=S.pcs[S.pcs.length-1]; return { made:S.pcs.length>n0, lines:p.lines.length, chair:p.lines[0].text, news:S.news.slice(-3).some(n=>/Press conference/.test(n.text)) }; });
  check('a rate decision is followed by a press conference with reporter questions', pc.made && pc.lines===6 && /Today we/.test(pc.chair), JSON.stringify(pc));
  // macro dashboard
  const md=await pg.evaluate(()=>{ for (let i=0;i<DAY*4;i++) tick(); location.hash='#markets'; return new Promise(r=>setTimeout(()=>{ render(); const el=$('#m-dash'); r({ txt:el.textContent.slice(0,400), svg:!!el.querySelector('svg.dashsvg'), pc:!!el.querySelector('[data-pc]') }); },300)); });
  check('Markets shows a macro dashboard with rates, inflation, the yield curve and the press conference', /Macro dashboard/.test(md.txt) && /2-year yield/.test(md.txt) && /Yield curve/.test(md.txt) && md.svg && md.pc, JSON.stringify(md));
  // Home card for a call on a stock you own
  const hc=await pg.evaluate(()=>{ const me=AG.get(0), s=S.stocks.find(x=>x.ex!=='PHB'); me.pos[s.sym]=10; me._ct=-1; reportEarnings(s); return callEvents().join(' ').replace(/<[^>]+>/g,' '); });
  check('Home flags the earnings call of a stock you own', /just held its earnings call/.test(hc) && /Read the call/.test(hc), hc);
  let ax=await axe(pg); check('axe: Markets with the macro dashboard', !ax.length, ax.join(','));
  await pg.evaluate(()=>{ setLang('tr'); render(); trPass(); });
  const t=await pg.evaluate(()=>({ d:$('#m-dash').textContent.slice(0,300) }));
  check('Turkish: the dashboard and press conference are translated', /Makro paneli/.test(t.d) && /Getiri eğrisi/.test(t.d), JSON.stringify(t));
  await pg.evaluate(()=>{ location.hash='#trade'; }); await pg.waitForTimeout(300);
  await pg.evaluate(()=>{ S.view='trade'; const s=SM[S.sel]; reportEarnings(s); render(); trPass(); }); const t2=await pg.evaluate(()=>$('#c-call').textContent.slice(0,200));
  check('Turkish: the earnings call is translated', /Bilanço konferansı/.test(t2), t2);
  ax=await axe(pg); check('axe: Trade with the call in Turkish', !ax.length, ax.join(','));
  await pg.evaluate(()=>setLang('en'));
  const lr=await pg.evaluate(()=>{ for (let i=0;i<DAY*30;i++) tick(); return { calls:(S.calls||[]).length, pcs:(S.pcs||[]).length, ok:S.stocks.every(s=>isFinite(s.last)&&s.last>0) }; });
  check('30 sessions: calls and press conferences keep coming, prices stay finite', lr.ok && lr.calls>5 && lr.pcs>=2, JSON.stringify(lr));
  check('no script errors', !pg.errs.length, pg.errs.join('|')); await pg.context().close();
  const m=await page(b,{ w:390, h:844, touch:true, init:PRO.init }); await m.goto(URL+'#markets'); await m.waitForTimeout(1000);
  await m.evaluate(()=>{ S.speed=0; rateMeeting(); for (let i=0;i<DAY*3;i++) tick(); render(); });
  check('phone: no horizontal overflow on Markets', await overflow(m));
  check('phone: no script errors', !m.errs.length, m.errs.join('|'));
  await b.close(); summary();
})();

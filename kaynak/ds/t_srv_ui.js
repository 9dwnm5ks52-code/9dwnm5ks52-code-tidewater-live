// Tidewater Live: the site in server mode (bots and calendar from the server's data folder)
const { chromium } = require('playwright');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
(async()=>{ const out=process.argv[2]||'.', b=await chromium.launch(); const p=await b.newPage({ viewport:{ width:1440, height:1000 }, colorScheme:'dark', locale:'tr-TR' }); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/live.html?srv=http://127.0.0.1:8766/srvdata/#bots'); await p.evaluate(()=>localStorage.clear()); await p.reload();
  await p.waitForFunction(()=>SRV.st && AI.status==='live', null, { timeout:60000 }); await p.waitForTimeout(1500);
  const r=await p.evaluate(()=>({ runs:SRV.st.runs, note:$('#bots-srv').textContent, bots:ST.ai.length, n:aiRoster().length, inFile:SRV.st.bots.length, srv:ST.ai.filter(b=>b.srv).length, gone:ST.ai.filter(b=>!AI_DEFS.some(d=>d.id===b.id)).map(b=>b.id), btns:$$('#bots-cards [data-ai-on]').length, cards:$$('#bots-cards .ai-card').length }));
  check('hosted: the bots of the roster come from the server (retired ones in an older file are dropped), with a note saying they run every 5 minutes, and cannot be paused from the page', r.srv===r.n && r.cards===r.n && !r.gone.length && r.btns===0 && /5 dakikada|5 minutes/.test(r.note), JSON.stringify(r));
  await p.evaluate(()=>save()); await p.waitForTimeout(600);
  check('the server’s bots are not saved in the browser', await p.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('tdl-state')||'{}'); return Array.isArray(s.ai) && s.ai.every(b=>!b.srv); }));
  await p.evaluate(()=>{ location.hash='#news'; }); await p.waitForTimeout(500); await p.click('[data-nt="economy"]'); await p.waitForTimeout(800);
  const c=await p.evaluate(()=>({ rows:$$('#nw-body tbody tr').length, src:/ForexFactory/.test($('#nw-body').textContent) }));
  check('the economic calendar from the server shows in News › Economy', c.rows>3 && c.src, JSON.stringify(c)); await p.screenshot({ path:out+'/calendar.png' });
  check('no script errors', errs.length===0, errs.join(' | ')); await b.close(); console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0); })();

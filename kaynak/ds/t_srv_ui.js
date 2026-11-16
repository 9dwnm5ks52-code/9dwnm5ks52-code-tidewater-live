// Phoenix Finance Club: the site reading the club's data folder (?srv=, here dist/srvdata served locally): fund.json and calendar.json
const { chromium } = require('playwright');
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
(async()=>{ const out=process.argv[2]||'.', b=await chromium.launch(); const p=await b.newPage({ viewport:{ width:1440, height:1000 }, colorScheme:'dark', locale:'tr-TR' }); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  const cal=JSON.parse(require('fs').readFileSync(__dirname+'/srvdata/calendar.json','utf8')), sh=Date.now()-cal.t; cal.t+=sh; for (const e of cal.events) e.t+=sh;   // the fixture moved to this week
  await p.route('http://127.0.0.1:8766/srvdata/calendar.json*', r=>r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(cal) }));
  await p.goto('http://127.0.0.1:8766/live.html?srv=http://127.0.0.1:8766/srvdata/#portfolio'); await p.evaluate(()=>localStorage.clear()); await p.reload();
  await p.waitForFunction(()=>CLUB.fund && SRV.cal, null, { timeout:30000 }); await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>({ seq:ST.A.seq, fills:ST.A.fills.length, rows:$$('#pf-fills tbody tr').length, pos:$$('#pf-pos tbody tr').length, lang:ST.lang, tok:!!localStorage.getItem('pfc-member-token') }));
  check('hosted: the fund comes from fund.json (holdings and every trade), in Turkish for a Turkish browser, with no token anywhere', r.seq>0 && r.rows===r.fills && r.pos>0 && r.lang==='tr' && !r.tok, JSON.stringify(r));
  await p.evaluate(()=>{ location.hash='#news'; }); await p.waitForTimeout(500); await p.click('[data-nt="economy"]'); await p.waitForTimeout(800);
  const c=await p.evaluate(()=>({ rows:$$('#nw-body tbody tr').length, src:/ForexFactory/.test($('#nw-body').textContent) }));
  check('the economic calendar from the club’s job shows in News › Economy', c.rows>3 && c.src, JSON.stringify(c)); await p.screenshot({ path:out+'/calendar.png' });
  check('no script errors', errs.length===0, errs.join(' | ')); await b.close(); console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0); })();

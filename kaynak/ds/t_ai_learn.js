// Tidewater Live: the learning bots, on made-up data where the right answer is known (runs in node)
const fs=require('fs'), vm=require('vm');
const ctx={ console, Date, Math, JSON, Map, Set }; vm.createContext(ctx);
vm.runInContext(['live_broker.js','ai_bots.js','ai_learn.js'].map(f=>fs.readFileSync(__dirname+'/../'+f,'utf8')).join('\n')+';aiSetV(1);this.mktKey=s=>s;'+
  ';Object.assign(this,{AI_CFG,BRK,AIL,QL,RK,SR,STK,STK_SECT,AI_DEFS,AI_PROB,aiAcc,qState,stkStep});', ctx);
const F=n=>ctx[n]; const CFG=ctx.AI_CFG;
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const T0=Date.UTC(2026,10,10), BAR=CFG.BAR; let seed=11; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
const mk=cs=>cs.map((c,i)=>{ const o=i ? cs[i-1] : c; return { t:T0+i*BAR, o, h:Math.max(o,c)*1.0004, l:Math.min(o,c)*.9996, c, v:100+(i%5)*10 }; });
function regimes(n){ const cs=[]; let p=100, d=.0015; for (let i=0;i<n;i++){ if (rnd()<.01) d=-d; p*=1+d+(rnd()-.5)*.006; cs.push(p); } return cs; }
function series(phi, n){ const cs=[]; let p=100, r=0; for (let i=0;i<n;i++){ r=phi*r+(rnd()-.5)*.004; p*=1+r; cs.push(p); } return cs; }
check('there are 6 bots, each with its own name and method, and the retired ones are gone', F('AI_DEFS').length===6 && new Set(F('AI_DEFS').map(d=>d.id)).size===6 && F('AI_PROB').join()==='knn,nb,forest' && !F('AI_DEFS').some(d=>['trend','band','learn','mlp','gbm','ga','bandit','council','regime'].includes(d.id)));
// 1-3: the three probability learners find a real pattern and do not invent one in a coin flip
for (const id of ['knn','nb','forest']){ const L=F('AIL')[id], M=L.init(), bars=mk(series(.6, 2600)); F('aiTrainP')(id, M, 'SOL', bars, F('aiInd')(bars)); const acc=F('aiAcc')(M);
  const M2=L.init(), flip=mk(series(0, 2600)); F('aiTrainP')(id, M2, 'SOL', flip, F('aiInd')(flip)); const acc2=F('aiAcc')(M2);
  check(`${id}: learns a pattern that is really there (walk-forward accuracy well over 50%) and stays near 50% on a coin flip`, acc>.58 && acc2>.4 && acc2<.6, `${acc && acc.toFixed(3)} vs coin flip ${acc2 && acc2.toFixed(3)}`); }
{ const M=F('AIL').forest.init(), bars=mk(series(.6, 1200)); F('aiTrainP')('forest', M, 'SOL', bars, F('aiInd')(bars)); check('the forest regrows itself as examples pile up', M.grown>=4 && M.trees.length===15, `grown ${M.grown} times`); }
// 5: Q-learning learns to be in during a rise and out during a fall
{ const M=F('QL').init(); for (let k=0;k<3;k++){ const bars=mk(regimes(2600)); F('QL').train(M, 'S'+k, bars, F('aiInd')(bars), .001); }
  const st=(tr, rb, mb, h)=>((tr*5+rb)*3+mb)*2+h, Q=M.Q, upFlat=st(1,3,2,0), downIn=st(0,1,0,1);
  check('Q-Learning Agent learns from rewards (in a market with real up and down phases): buy when trend and the last hour are up; get out when both are down', Q[upFlat*2+1]>Q[upFlat*2] && Q[downIn*2+1]>Q[downIn*2], JSON.stringify({ upBuy:Q[upFlat*2+1].toFixed(3), upStay:Q[upFlat*2].toFixed(3), downSell:Q[downIn*2+1].toFixed(3), downStay:Q[downIn*2].toFixed(3) })); }
// 9-10: the stock learners on made-up snapshots where signal 4 (one-month move) predicts who beats the others
function snapPair(n, t){ const rows={}, next={}, secs=Object.keys(F('STK_SECT')); for (let i=0;i<n;i++){ const z=Array.from({ length:11 }, ()=>(rnd()-.5)*3.4), s='S'+i, sec=secs[i%secs.length];
  rows[s]={ px:100, sec, z, f:z }; next[s]={ px:100*(1+.004*z[3]+(rnd()-.5)*.006), sec, z, f:z }; } return [{ t, rows }, { t:t+3e5, rows:next }]; }
{ const M=F('RK').init(); for (let k=0;k<25;k++){ const [a,b]=snapPair(300, k*1e6); F('RK').learn(M, a, b); }
  const ic=M.ic.slice(-10).reduce((x,y)=>x+y,0)/10, top=M.w.map((w,j)=>[w,j]).sort((x,y)=>y[0]-x[0])[0][1];
  check('Cross-Sectional Ranker finds which signal predicts the winners and ranks stocks by it (rank correlation well above 0)', top===3 && ic>.3, `strongest signal #${top}, recent IC ${ic.toFixed(2)}`); }
{ const M=F('SR').init(); for (let k=0;k<60;k++){ const [a,b]=snapPair(400, k*1e6); F('SR').learn(M, a, b); } const acc=M.hits.slice(-30).reduce((x,y)=>x+y,0)/30;
  check('Sector Rotator learns which sectors lead (its top sector beats the average most of the time)', acc>.6 && M.w[3]>0, `${acc.toFixed(2)}, weights ${M.w.map(w=>w.toFixed(2)).join(' ')}`); }
// 11: the stock bots buy at the open and not when the market is closed
{ const bots=[ctx.aiBot('rank'), ctx.aiBot('sector')]; const [a,b]=snapPair(200, 0); for (const s in b.rows) b.rows[s].px=100; F('STK').prev=a; F('STK').snap=b; bots[0].model.n=1; bots[1].model.n=1;
  const shut=()=>({ kind:'stock', last:100, bid:null, ask:null, open:false }); let acts=F('stkStep')(bots, shut, Date.now());
  check('stock bots do not trade while the market is closed', acts.length===0 && Object.keys(bots[0].meta).length===0);
  for (const bt of bots){ bt.model.reb=0; bt.model.seen={}; } const ETF=new Set(Object.values(F('STK_SECT'))); acts=F('stkStep')(bots, s=>({ kind:'stock', last:100, bid:null, ask:null, open:true }), Date.now());
  check('…and when it opens, Sena buys her top 5 and Sinan 3 sector ETFs, with no commission', Object.keys(bots[0].meta).length===5 && Object.keys(bots[1].meta).length===3 && Object.keys(bots[1].meta).every(s=>ETF.has(s)) && bots[0].A.fills.every(f=>f.fee===0), JSON.stringify({ sena:Object.keys(bots[0].meta), sinan:Object.keys(bots[1].meta) })); }
// 12: candle bots on a US stock wait while the market is closed
{ const bots=ctx.aiNew().filter(b=>!['rank','sector'].includes(b.id)), bars=mk(series(.6, 300)); let n=0;
  const acts=F('aiStep')(bots, 'AAPL', bars, ()=>({ kind:'stock', last:bars[bars.length-1].c, open:false }), bars[bars.length-1].t+BAR, { open:false });
  check('on a US stock after hours, the candle bots keep learning but do not trade', acts.length===0 && bots.every(b=>b.think.AAPL && b.think.AAPL.code==='mkt_closed') && bots.find(b=>b.id==='knn').model.n>100); }
// 13: everything survives saving and loading, and the reloaded bot thinks the same
{ const bots=ctx.aiNew(), bars=mk(series(.6, 700)), q=()=>({ kind:'crypto', last:bars[bars.length-1].c, bid:null, ask:null, open:true });
  F('aiStep')(bots, 'BTC', bars, q, bars[bars.length-1].t+BAR, { open:true }); const re=JSON.parse(JSON.stringify(bots)), x=ctx.aiFeat(F('aiInd')(bars), bars.length-1);
  const same=['knn','nb','forest'].every(id=>{ const a=bots.find(b=>b.id===id).model, b=re.find(b=>b.id===id).model; return Math.abs(F('AIL')[id].p(a, x)-F('AIL')[id].p(b, x))<1e-9; });
  const qa=bots.find(b=>b.id==='q').model, qb=re.find(b=>b.id==='q').model;
  check('all 6 bots, with what they learned, survive being saved and loaded (same forecasts and Q-values after reload)', re.length===6 && same && qa.n>100 && qa.Q.every((v,k)=>v===qb.Q[k]), `Q-learning steps ${qa.n}`); }
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);

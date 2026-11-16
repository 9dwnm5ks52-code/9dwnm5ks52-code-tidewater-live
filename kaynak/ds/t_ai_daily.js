// Tidewater Live: the Strategy Desk engine (daily strategies) on made-up prices where the answer is known — runs in node
const fs=require('fs'), vm=require('vm'); const C={ console, Date, Math, JSON, Map, Set, Float64Array, Int32Array, Infinity, NaN, isFinite }; vm.createContext(C);
vm.runInContext(fs.readFileSync(__dirname+'/../ai_daily.js','utf8')+';Object.assign(this,{DLY,DLY_STRATS,DLY_COST,DLY_DAY,DLY_LB});', C);
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const DAY=864e5, T0=Date.UTC(2019,0,1); let seed=4; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
const series=(n, f)=>Array.from({ length:n }, (_,i)=>{ const c=f(i); return [T0+i*DAY, c*1.01, c*.99, c]; });
const build=raw=>C.dlyBuild(raw, T0+(Math.max(...Object.values(raw).map(a=>a.length))+1)*DAY);
// 1. no future data: a signal for day i must not change when later days are added
{ const raw={ BTC:series(600, i=>100*Math.exp(Math.sin(i/40)*.5+i*.001)), ETH:series(600, i=>50*Math.exp(Math.cos(i/30)*.4)) }, D1=build(raw), cut={ BTC:raw.BTC.slice(0, 400), ETH:raw.ETH.slice(0, 400) }, D2=build(cut);
  const same=C.DLY_STRATS.every(S=>{ const a=C.dlyNew(), b=C.dlyNew(); let ta, tb; for (let i=1;i<400;i++){ ta=C.dlyStep(D1, S, S.p, a, i, C.DLY_COST.taker); tb=C.dlyStep(D2, S, S.p, b, i, C.DLY_COST.taker); } return JSON.stringify(ta)===JSON.stringify(tb) && Math.abs(a.E-b.E)<1e-12; });
  check('no strategy peeks: its decisions and results up to a day are the same whether or not later days exist', same); }
// 2. the trend guard
{ const D=build({ BTC:series(300, i=>i<150 ? 100+i : 250-(i-150)*1.2) }), S=C.DLY_STRATS.find(s=>s.id==='guard');
  check('the BTC Trend Guard holds Bitcoin above its 50-day average and cash below', S.w(D, 140, S.p).BTC===1 && Object.keys(S.w(D, 260, S.p)).length===0); }
// 3. costs and the no-trade band
{ const D=build({ BTC:series(200, i=>100), ETH:series(200, i=>100) }), flip={ w:(D, i)=>i%2 ? { BTC:1 } : { ETH:1 } }, A=C.dlyRun(D, flip, {}, C.DLY_COST.taker, 1, 100);
  check('every switch pays the fee and slippage on both sides (flat prices, daily switching loses about 0.3% a day)', Math.abs(A.E-Math.pow(1-2*.0015, 99)*(1-.0015))<1e-9, A.E.toFixed(4));
  const small={ w:(D, i)=>({ BTC:i%2 ? .5 : .51 }) }, B=C.dlyRun(D, small, {}, C.DLY_COST.taker, 1, 100);
  check('a change of 1 point is not traded (the no-trade band saves the cost)', B.trades===1, `${B.trades} trade`); }
// 4. a coin that stops trading is sold at its last price
{ const raw={ BTC:series(200, i=>100), XXX:series(120, i=>100+i) }, D=build(raw), hold={ w:(D, i)=>isFinite(D.px.XXX.c[i]) ? { XXX:1 } : {} }, A=C.dlyRun(D, hold, {}, { fee:0, slip:0 }, 1, 190);
  check('a delisted coin is turned into cash at its last close (no made-up prices after it)', Math.abs(A.E-219/101)<1e-9 && Object.keys(A.cur).length===0, A.E.toFixed(4)); }
// 5. volatility targeting
{ const raw={ BTC:series(200, i=>100*Math.exp((i%2 ? .05 : -.05))) }, D=build(raw), w=C.dlyVolTarget(D, { BTC:1 }, 150, .4), v=C.dlyPortVol(D, { BTC:1 }, 150);
  check('the risk brake shrinks a position that swings more than the target (40% a year)', w.BTC<1 && Math.abs(w.BTC-.4/v)<1e-9, `volatility ${(v*100).toFixed(0)}% → weight ${(w.BTC*100).toFixed(0)}%`); }
// 6. statistics and the deflated Sharpe ratio
{ const days=Array.from({ length:731 }, (_,i)=>T0+i*DAY), rets=Array.from({ length:730 }, ()=>.001+(rnd()-.5)*.04), eq=[1]; for (const r of rets) eq.push(eq[eq.length-1]*(1+r)); const st=C.dlyStats(eq, rets, days);
  check('yearly growth, Sharpe and deepest fall are computed from the daily values', st.cagr>0 && st.sharpe>0 && st.dd>0 && st.dd<1 && Object.keys(st.years).join()==='2019,2020', JSON.stringify({ cagr:st.cagr.toFixed(3), sharpe:st.sharpe.toFixed(2), dd:st.dd.toFixed(2) }));
  const few=C.dlyDSR(st, [st.srd, st.srd*.5]), many=C.dlyDSR(st, Array.from({ length:200 }, (_,k)=>st.srd*(rnd()*2-.5)));
  check('the deflated Sharpe ratio drops when many more variants were tried (luck is more likely)', many<few, `${few.toFixed(3)} with 2 variants, ${many.toFixed(3)} with 200`);
  const noise=Array.from({ length:730 }, ()=>(rnd()-.5)*.04), e2=[1]; for (const r of noise) e2.push(e2[e2.length-1]*(1+r)); const s2=C.dlyStats(e2, noise, days);
  check('…and a strategy with no edge does not pass it (under 95%)', C.dlyDSR(s2, [s2.srd, s2.srd*.8, s2.srd*1.1])<.95); }
// 7. the trend ensemble turns on in a rising market and off in a falling one, never above 100% invested
{ const raw={}; for (const s of ['BTC','ETH','SOL','XRP','ADA','DOGE']) raw[s]=series(700, i=>100*Math.exp((i<400 ? i*.004 : 1.6-(i-400)*.006)+(rnd()-.5)*.02)); const D=build(raw), S=C.DLY_STRATS.find(s=>s.id==='trend'), A=C.dlyNew(); let up=0, down=0, mx=0;
  for (let i=1;i<D.days.length;i++){ const T=C.dlyStep(D, S, S.p, A, i, C.DLY_COST.taker), g=Object.values(T).reduce((a,b)=>a+b,0); mx=Math.max(mx, g); if (i===390) up=g; if (i===680) down=g; }
  check('the Trend Ensemble is invested in a long rise and in cash after a long fall, never more than fully invested', up>.3 && down<.05 && mx<=1.000001, `${(up*100).toFixed(0)}% in the rise, ${(down*100).toFixed(0)}% after the fall`); }
// 8. momentum rotation: the strongest coins, weekly
{ const raw={ BTC:series(300, i=>100+i*.1), ETH:series(300, i=>100+i*.5), SOL:series(300, i=>100+i*1), XRP:series(300, i=>100-i*.1) }, D=build(raw), S=C.DLY_STRATS.find(s=>s.id==='mom'), st={}, w=S.w(D, 200, S.p, st), w2=S.w(D, 203, S.p, st);
  check('Momentum Rotation holds the best 3 with positive momentum (never the falling one) and keeps them for the week', w.SOL>0 && w.ETH>0 && w.BTC>0 && !w.XRP && JSON.stringify(w)===JSON.stringify(w2)); }
// 9. round 2: the bull filter, and interest on cash
{ const raw={ BTC:series(400, i=>i<250 ? 100+i : 350-(i-250)*1.5), ETH:series(400, i=>100+i*.8), SOL:series(400, i=>100+i), XRP:series(400, i=>100+i*.6) }, D=build(raw), S=C.DLY_STRATS.find(s=>s.id==='mombull');
  const up=S.w(D, 240, S.p, {}), down=S.w(D, 390, S.p, {});
  check('Momentum + Bull Filter holds the leaders while Bitcoin’s trend is up and goes to cash when it turns down', Object.keys(up).length>0 && Object.keys(down).length===0, JSON.stringify(up)); }
{ const D=build({ BTC:series(400, i=>100) }), none={ w:()=>({}) }, A=C.dlyRun(D, none, {}, { fee:0, slip:0, cash:.03 }, 1, 366);
  check('cash earns the chosen yearly rate when interest on cash is on (3% over a year)', Math.abs(A.E-1.03)<.002, A.E.toFixed(4)); }
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail ? 1 : 0);

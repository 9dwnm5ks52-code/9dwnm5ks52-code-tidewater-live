// Tidewater Live: the performance numbers on made-up series where the answer is known (runs in node)
const fs=require('fs'), vm=require('vm'); const ctx={ console, Date, Math, JSON, Infinity }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../live/perf.js','utf8'), ctx);
let pass=0, fail=0; const check=(n, ok, d)=>{ ok?pass++:fail++; console.log((ok?'PASS':'FAIL')+'  '+n+(d!==undefined?'  · '+d:'')); };
const T0=Date.UTC(2026,10,1), S=300000, near=(a,b,e)=>Math.abs(a-b)<=(e||1e-9);
// a steady climb: no drawdown, no volatility to speak of
let pts=Array.from({ length:100 }, (_,i)=>({ t:T0+i*S, v:10000*(1.0001)**i })), P=ctx.perfStats(pts, [], 10000);
check('a steady climb: the right return and no drawdown', near(P.ret, 1.0001**99-1, 1e-9) && P.dd===0, P.ret.toFixed(5));
// up 20%, down to 90% of the high, then back: the deepest fall is 10%
pts=[10000,11000,12000,11400,10800,11500,12500].map((v,i)=>({ t:T0+i*S, v })); P=ctx.perfStats(pts, [], 10000);
check('maximum drawdown is the deepest fall from a high (12,000 → 10,800 = 10%)', near(P.dd, .1, 1e-9), P.dd);
// alternating moves: zero mean, so Sharpe is near zero; volatility is annualised from 5-minute steps
pts=Array.from({ length:201 }, (_,i)=>({ t:T0+i*S, v:10000*(i%2 ? 1.01 : 1) })); P=ctx.perfStats(pts, [], 10000);
check('swinging up and down without getting anywhere: Sharpe near zero, high volatility', Math.abs(P.sharpe)<.6 && P.vol>1, `Sharpe ${P.sharpe.toFixed(2)}, vol ${(P.vol*100).toFixed(0)}%`);
// points closer than 5 minutes are merged, so a busy page does not inflate the numbers
pts=Array.from({ length:600 }, (_,i)=>({ t:T0+i*30000, v:10000+i })); check('points are taken every 5 minutes', ctx.perfResample(pts, S).length===60);
// trades
const f=[{ side:'s', pl:300 },{ side:'s', pl:-100 },{ side:'s', pl:200 },{ side:'s', pl:-100 },{ side:'b', pl:null }]; P=ctx.perfStats([], f, 10000);
check('win rate, average win and loss, and profit factor from closed trades', P.trades===4 && P.win===.5 && P.avgW===250 && P.avgL===-100 && P.pf===2.5, JSON.stringify({ win:P.win, avgW:P.avgW, avgL:P.avgL, pf:P.pf }));
check('no losing trade yet means an unlimited profit factor', ctx.perfStats([], [{ side:'s', pl:50 }], 1).pf===Infinity);
console.log(`\n${pass}/${pass+fail} checks passed`); process.exit(fail?1:0);

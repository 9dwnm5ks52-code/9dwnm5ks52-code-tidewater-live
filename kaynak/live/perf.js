/* ---------- Phoenix Finance Club: performance, measured the way funds measure it ----------
   The fund's value history (fund.eq, one point per run of the club's job, thinned to hourly after 2 days and daily after
   60 days) carries the S&P 500 ETF (SPY) and Bitcoin prices of the same moment, so the benchmarks cover exactly the same time.
   Volatility and the Sharpe ratio come from log returns at a fixed step (hourly for the fund; annualised over 365 days, as
   crypto trades every day; no risk-free rate); the deepest fall (maximum drawdown) from every point; win rate and profit
   factor from closed trades (sells and covers). */
const PERF_STEP=300000;
function perfResample(pts, step){ const out=[]; for (const p of pts||[]){ const k=Math.floor(p.t/step); if (out.length && out[out.length-1].k===k) out[out.length-1]={ k, t:p.t, v:p.v }; else out.push({ k, t:p.t, v:p.v }); } return out; }
function perfStats(pts, fills, start, step){ step=step||PERF_STEP; const P=perfResample(pts, step).filter(p=>p.v>0), out={ n:P.length };
  if (P.length){ out.ret=P[P.length-1].v/(start||P[0].v)-1; let peak=start||P[0].v, dd=0; for (const p of P){ peak=Math.max(peak, p.v); dd=Math.max(dd, 1-p.v/peak); } out.dd=dd; }
  if (P.length>=24){ const r=P.slice(1).map((p,i)=>Math.log(p.v/P[i].v)), m=r.reduce((a,b)=>a+b,0)/r.length, sd=Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/(r.length-1)), k=Math.sqrt(365*864e5/step);
    out.vol=sd*k; out.sharpe=sd>0 ? m/sd*k : null; }
  const closed=(fills||[]).filter(f=>(f.side==='s' || f.cover) && f.pl!=null), wins=closed.filter(f=>f.pl>0), losses=closed.filter(f=>f.pl<=0), gw=wins.reduce((a,f)=>a+f.pl,0), gl=-losses.reduce((a,f)=>a+f.pl,0);
  out.trades=closed.length; out.win=closed.length ? wins.length/closed.length : null; out.avgW=wins.length ? gw/wins.length : null; out.avgL=losses.length ? -gl/losses.length : null; out.pf=gl>0 ? gw/gl : (gw>0 ? Infinity : null);
  return out; }
// what holding Bitcoin or the S&P 500 did over the fund's own history
function perfBench(eq){ const b0=(eq||[]).find(x=>x.btc>0), s0=(eq||[]).find(x=>x.spy>0), b1=[...(eq||[])].reverse().find(x=>x.btc>0), s1=[...(eq||[])].reverse().find(x=>x.spy>0);
  return { btc:b0 && b1 && b0!==b1 ? b1.btc/b0.btc-1 : null, spy:s0 && s1 && s0!==s1 ? s1.spy/s0.spy-1 : null }; }
// one value a day (the last of each local day) and that day's change
function perfDays(eq){ const by=new Map(); for (const p of eq||[]){ const d=new Date(p.t); d.setHours(0,0,0,0); by.set(+d, p); } const xs=[...by.entries()]; const out=[];
  for (let k=1;k<xs.length;k++) if (xs[k-1][1].v>0) out.push({ t:xs[k][0], r:xs[k][1].v/xs[k-1][1].v-1 }); return out; }
// a chart of the fund, the S&P 500 and Bitcoin, each starting at 0% at the first point after `from`
function perfChart(eq, from, E, hostId){ const P=(eq||[]).filter(p=>p.t>=from && p.v>0), last=E>0 ? P.concat([{ t:Date.now(), v:E }]) : P;
  if (P.length<2) return `<p class="empty">${esc(L2('The chart fills in as the club’s job records the fund: a point every 5 minutes or so.','Grafik, kulübün görevi fonu kaydettikçe dolar: yaklaşık 5 dakikada bir nokta.'))}</p>`;
  const W=Math.max(300, Math.round(($('#'+hostId)||{}).clientWidth||720)-4), H=200, t0=P[0].t, t1=last[last.length-1].t||t0+1, ser=[{ c:'var(--accent)', n:L2('The fund','Fon'), xs:last.map(p=>[p.t, p.v/P[0].v-1]) }];
  const s0=P.find(x=>x.spy>0), b0=P.find(x=>x.btc>0); if (s0) ser.push({ c:'var(--ink-3)', n:'S&P 500 (SPY)', xs:P.filter(x=>x.spy>0).map(x=>[x.t, x.spy/s0.spy-1]) }); if (b0) ser.push({ c:'var(--warn)', n:'Bitcoin', xs:P.filter(x=>x.btc>0).map(x=>[x.t, x.btc/b0.btc-1]) });
  const all=ser.flatMap(s=>s.xs.map(x=>x[1])), lo=Math.min(0, ...all), hi=Math.max(0, ...all), X=t=>8+(W-64)*(t-t0)/((t1-t0)||1), Y=v=>10+(H-30)*(1-(v-lo)/((hi-lo)||1));
  const path=xs=>xs.map((x,i)=>(i?'L':'M')+X(x[0]).toFixed(1)+','+Y(x[1]).toFixed(1)).join('');
  return `<svg class="chart pf-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ser.map(s=>s.n+' '+pct(s.xs[s.xs.length-1][1])).join(', '))}"><line class="gl" x1="8" x2="${W-56}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/><text x="${W-52}" y="${(Y(0)+3).toFixed(1)}">0%</text><text x="${W-52}" y="14">${pct(hi)}</text><text x="${W-52}" y="${H-18}">${pct(lo)}</text>${ser.map(s=>`<path d="${path(s.xs)}" fill="none" stroke="${s.c}" stroke-width="2"/>`).join('')}</svg>
    <p class="pf-leg">${ser.map(s=>`<span><i style="background:${s.c}"></i>${esc(s.n)} <b class="mono ${cls(s.xs[s.xs.length-1][1])}">${pct(s.xs[s.xs.length-1][1])}</b></span>`).join('')}<span class="muted">${esc(L2('since ','başlangıç: ')+dayFmt(t0))}</span></p>`; }
const PERF_HELP={ ret:['Return since the start','Başlangıçtan beri getiri'], btc:['Against holding Bitcoin','Bitcoin tutmaya karşı'], spy:['Against the S&P 500','S&P 500’e karşı'],
  sharpe:['Sharpe ratio: return per unit of risk; above 1 is good, above 2 very good','Sharpe oranı: risk başına getiri; 1’in üstü iyi, 2’nin üstü çok iyi'],
  dd:['Deepest fall from a high (maximum drawdown)','Zirveden en derin düşüş (maksimum geri çekilme)'], vol:['Volatility: how much the value swings, per year','Oynaklık: değerin yıllık ne kadar salındığı'],
  win:['Win rate of closed trades','Kapanan işlemlerin kazanma oranı'], pf:['Profit factor: money won ÷ money lost; above 1 makes money','Kâr faktörü: kazanılan ÷ kaybedilen para; 1’in üstü para kazandırır'],
  avg:['Average win / average loss','Ortalama kazanç / ortalama kayıp'] };
function perfTiles(S, B){ const f2=v=>v==null || !isFinite(v) ? (v===Infinity ? '∞' : '—') : F2.format(v), rel=(a,b)=>a!=null && b!=null ? a-b : null, t=(k, v, c)=>`<div class="pf-t"><span class="bd-sub">${esc(L2(...PERF_HELP[k]))}</span><b class="mono ${c||''}">${v}</b></div>`;
  return `<div class="pf-grid">${t('ret', S.ret!=null ? pct(S.ret) : '—', cls(S.ret))}${t('btc', rel(S.ret, B.btc)!=null ? pct(rel(S.ret, B.btc)) : '—', cls(rel(S.ret, B.btc)))}${t('spy', rel(S.ret, B.spy)!=null ? pct(rel(S.ret, B.spy)) : '—', cls(rel(S.ret, B.spy)))}${t('sharpe', f2(S.sharpe), S.sharpe>1 ? 'up' : S.sharpe<0 ? 'down' : '')}${t('dd', S.dd!=null ? pct(-S.dd) : '—', S.dd>.0005 ? 'down' : '')}${t('vol', S.vol!=null ? pct(S.vol).replace('+','') : '—')}${t('win', S.win!=null ? p0(S.win) : '—')}${t('pf', f2(S.pf), S.pf>1 ? 'up' : S.pf!=null && S.pf<1 ? 'down' : '')}${t('avg', `${S.avgW!=null ? money(S.avgW) : '—'} / ${S.avgL!=null ? money(S.avgL) : '—'}`)}</div>`; }
function renderPerf(Q, E){ const A=ST.A, eq=A.eq||[], pts=eq.concat([{ t:Date.now(), v:E }]), S=perfStats(pts, A.fills, A.start, 36e5), B=perfBench(eq);
  setHTML($('#pf-perf'), `${perfTiles(S, B)}<h3 class="perf-h">${esc(L2('The fund against the S&P 500 and Bitcoin, since the start','Başlangıçtan beri fon, S&P 500 ve Bitcoin’e karşı'))}</h3>${perfChart(eq, 0, E, 'pf-perf')}
    <p class="bd-sub">${esc(L2('Sharpe and volatility use hourly points and need about a day of history. The benchmarks are the prices the club’s job saw at each point.','Sharpe ve oynaklık saatlik noktalarla hesaplanır ve yaklaşık bir günlük geçmiş ister. Karşılaştırmalar, kulübün görevinin her noktada gördüğü fiyatlardır.'))}</p>`); }

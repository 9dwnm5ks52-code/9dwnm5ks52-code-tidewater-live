/* ---------- Phoenix Finance Club: performance, measured the way funds measure it ----------
   Volatility and the Sharpe ratio come from 5-minute log returns (annualised over 365 days, as crypto trades every day; no risk-free rate);
   the deepest fall (maximum drawdown) from every point; win rate and profit factor from closed trades. Benchmarks: holding Bitcoin, or the S&P 500 (SPY), over the same time. */
const PERF_STEP=300000;
function perfResample(pts, step){ const out=[]; for (const p of pts||[]){ const k=Math.floor(p.t/step); if (out.length && out[out.length-1].k===k) out[out.length-1]={ k, t:p.t, v:p.v }; else out.push({ k, t:p.t, v:p.v }); } return out; }
function perfStats(pts, fills, start){ const P=perfResample(pts, PERF_STEP).filter(p=>p.v>0), out={ n:P.length };
  if (P.length){ out.ret=P[P.length-1].v/(start||P[0].v)-1; let peak=start||P[0].v, dd=0; for (const p of P){ peak=Math.max(peak, p.v); dd=Math.max(dd, 1-p.v/peak); } out.dd=dd; }
  if (P.length>=24){ const r=P.slice(1).map((p,i)=>Math.log(p.v/P[i].v)), m=r.reduce((a,b)=>a+b,0)/r.length, sd=Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/(r.length-1)), k=Math.sqrt(365*864e5/PERF_STEP);
    out.vol=sd*k; out.sharpe=sd>0 ? m/sd*k : null; }
  const closed=(fills||[]).filter(f=>(f.side==='s' || f.cover) && f.pl!=null), wins=closed.filter(f=>f.pl>0), losses=closed.filter(f=>f.pl<=0), gw=wins.reduce((a,f)=>a+f.pl,0), gl=-losses.reduce((a,f)=>a+f.pl,0);
  out.trades=closed.length; out.win=closed.length ? wins.length/closed.length : null; out.avgW=wins.length ? gw/wins.length : null; out.avgL=losses.length ? -gl/losses.length : null; out.pf=gl>0 ? gw/gl : (gw>0 ? Infinity : null);
  return out; }
// what holding Bitcoin or the S&P 500 would have done since t0 (from the price samples this page keeps)
function perfBench(t0){ const bm=ST.bm||[], first=bm.find(x=>x.t>=t0) || bm[0], last=bm[bm.length-1]; if (!first || !last || first===last) return {};
  return { btc:first.btc && last.btc ? last.btc/first.btc-1 : null, spy:first.spy && last.spy ? last.spy/first.spy-1 : null, from:first.t }; }
function perfSample(){ const b=quote('BTC'), s=quote('SPY'); if (!b) return; ST.bm=(ST.bm||[]).concat([{ t:Date.now(), btc:b.last, spy:s ? s.last : null }]).slice(-2880); }
// a chart of you, Bitcoin and the S&P 500, each starting at 0%
function perfChart(pts, from){ const P=perfResample(pts.filter(p=>p.t>=from), PERF_STEP), bm=(ST.bm||[]).filter(x=>x.t>=from); if (P.length<3) return `<p class="empty">${esc(L2('The chart fills in as you use the site: a point every 5 minutes.','Grafik siteyi kullandıkça dolar: her 5 dakikada bir nokta.'))}</p>`;
  const W=Math.max(320, Math.round(($('#pf-perf')||{}).clientWidth||720)-4), H=220, t0=P[0].t, t1=P[P.length-1].t||t0+1, ser=[{ c:'var(--accent)', n:L2('You','Sen'), xs:P.map(p=>[p.t, p.v/P[0].v-1]) }];
  const b0=bm.find(x=>x.btc), s0=bm.find(x=>x.spy); if (b0) ser.push({ c:'var(--warn)', n:'Bitcoin', xs:bm.filter(x=>x.btc).map(x=>[x.t, x.btc/b0.btc-1]) }); if (s0) ser.push({ c:'var(--ink-3)', n:'S&P 500', xs:bm.filter(x=>x.spy).map(x=>[x.t, x.spy/s0.spy-1]) });
  const all=ser.flatMap(s=>s.xs.map(x=>x[1])), lo=Math.min(0, ...all), hi=Math.max(0, ...all), X=t=>8+(W-60)*(t-t0)/((t1-t0)||1), Y=v=>10+(H-30)*(1-(v-lo)/((hi-lo)||1));
  const path=xs=>xs.filter(x=>x[0]>=t0).map((x,i)=>(i?'L':'M')+X(x[0]).toFixed(1)+','+Y(x[1]).toFixed(1)).join('');
  return `<svg class="chart pf-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ser.map(s=>s.n+' '+pct(s.xs[s.xs.length-1][1])).join(', '))}"><line class="gl" x1="8" x2="${W-52}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/><text x="${W-48}" y="${(Y(0)+3).toFixed(1)}">0%</text><text x="${W-48}" y="14">${pct(hi)}</text><text x="${W-48}" y="${H-18}">${pct(lo)}</text>${ser.map(s=>`<path d="${path(s.xs)}" fill="none" stroke="${s.c}" stroke-width="2"/>`).join('')}</svg>
    <p class="pf-leg">${ser.map(s=>`<span><i style="background:${s.c}"></i>${esc(s.n)} <b class="mono ${cls(s.xs[s.xs.length-1][1])}">${pct(s.xs[s.xs.length-1][1])}</b></span>`).join('')}</p>`; }
const PERF_HELP={ ret:['Return since you started','Başladığından beri getiri'], btc:['Against holding Bitcoin','Bitcoin tutmaya karşı'], spy:['Against the S&P 500','S&P 500’e karşı'],
  sharpe:['Sharpe ratio: return per unit of risk; above 1 is good, above 2 very good','Sharpe oranı: risk başına getiri; 1’in üstü iyi, 2’nin üstü çok iyi'],
  dd:['Deepest fall from a high (maximum drawdown)','Zirveden en derin düşüş (maksimum geri çekilme)'], vol:['Volatility: how much the value swings, per year','Oynaklık: değerin yıllık ne kadar salındığı'],
  win:['Win rate of closed trades','Kapanan işlemlerin kazanma oranı'], pf:['Profit factor: money won ÷ money lost; above 1 makes money','Kâr faktörü: kazanılan ÷ kaybedilen para; 1’in üstü para kazandırır'],
  avg:['Average win / average loss','Ortalama kazanç / ortalama kayıp'] };
function perfTiles(S, B){ const f2=v=>v==null || !isFinite(v) ? (v===Infinity ? '∞' : '—') : F2.format(v), rel=(a,b)=>a!=null && b!=null ? a-b : null, t=(k, v, c)=>`<div class="pf-t"><span class="bd-sub">${esc(L2(...PERF_HELP[k]))}</span><b class="mono ${c||''}">${v}</b></div>`;
  return `<div class="pf-grid">${t('ret', S.ret!=null ? pct(S.ret) : '—', cls(S.ret))}${t('btc', rel(S.ret, B.btc)!=null ? pct(rel(S.ret, B.btc)) : '—', cls(rel(S.ret, B.btc)))}${t('spy', rel(S.ret, B.spy)!=null ? pct(rel(S.ret, B.spy)) : '—', cls(rel(S.ret, B.spy)))}${t('sharpe', f2(S.sharpe), S.sharpe>1 ? 'up' : S.sharpe<0 ? 'down' : '')}${t('dd', S.dd!=null ? pct(-S.dd) : '—', S.dd>.0005 ? 'down' : '')}${t('vol', S.vol!=null ? pct(S.vol).replace('+','') : '—')}${t('win', S.win!=null ? p0(S.win) : '—')}${t('pf', f2(S.pf), S.pf>1 ? 'up' : S.pf!=null && S.pf<1 ? 'down' : '')}${t('avg', `${S.avgW!=null ? money(S.avgW) : '—'} / ${S.avgL!=null ? money(S.avgL) : '—'}`)}</div>`; }
function renderPerf(Q, E){ const A=ST.A, pts=(ST.eqi||[]).concat([{ t:Date.now(), v:E }]), S=perfStats(pts, A.fills, A.start), B=perfBench(A.created||0);
  setHTML($('#pf-perf'), `${perfTiles(S, B)}<h3 class="perf-h">${esc(L2('Last 24 hours: you against Bitcoin and the S&P 500','Son 24 saat: Bitcoin ve S&P 500’e karşı sen'))}</h3>${perfChart(pts, Date.now()-864e5)}
    <p class="bd-sub">${esc(L2('Sharpe and volatility use 5-minute points and need about 2 hours of data. Benchmarks count from when this page started keeping prices.','Sharpe ve oynaklık 5 dakikalık noktalarla hesaplanır ve yaklaşık 2 saatlik veri ister. Karşılaştırmalar, bu sayfanın fiyat tutmaya başladığı andan itibaren sayılır.'))}</p>`); }
function botPerf(bot, Q){ const E=brkEquity(bot.A, Q); return perfStats((bot.eqi||[]).concat([{ t:Date.now(), v:E }]), bot.A.fills, bot.A.start); }

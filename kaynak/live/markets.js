/* ---------- Tidewater Live: the Markets screen (the whole US market, 15 minutes delayed) ---------- */
const MKV={ q:'', type:'all', sec:'', sort:'big', n:50, key:'', rows:[] };
const IDX=[ { sym:'SPY', name:'S&P 500' }, { sym:'QQQ', name:'Nasdaq 100' }, { sym:'DIA', name:'Dow Jones' }, { sym:'IWM', name:'Russell 2000' } ];
const big=v=>{ if (!(v>0)) return '—'; const u=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']].find(x=>v>=x[0]); return u ? F2.format(v/u[0]).replace(/\.?0+$/,'')+u[1] : F0.format(v); };
const SEC_TR={ 'Electronic Technology':'Elektronik teknoloji','Technology Services':'Teknoloji hizmetleri','Finance':'Finans','Health Technology':'Sağlık teknolojisi','Retail Trade':'Perakende',
  'Consumer Non-Durables':'Dayanıksız tüketim','Producer Manufacturing':'Üretim ekipmanı','Energy Minerals':'Enerji','Consumer Services':'Tüketici hizmetleri','Utilities':'Kamu hizmetleri',
  'Transportation':'Ulaştırma','Communications':'İletişim','Process Industries':'Proses sanayi','Consumer Durables':'Dayanıklı tüketim','Industrial Services':'Sanayi hizmetleri',
  'Health Services':'Sağlık hizmetleri','Commercial Services':'Ticari hizmetler','Non-Energy Minerals':'Madencilik','Distribution Services':'Dağıtım','Miscellaneous':'Diğer','Government':'Kamu' };
const secT=s=>ST.lang==='tr' ? (SEC_TR[s]||s) : s;
Object.assign(TR, {
  'Markets':'Piyasalar','US market':'ABD piyasası','15 min delayed':'15 dk gecikmeli','real time':'gerçek zamanlı','Real time':'Gerçek zamanlı','Source: TradingView screener':'Kaynak: TradingView tarayıcısı',
  'Optional: free Alpaca keys make the 14 big names real time, with daily candles.':'İsteğe bağlı: ücretsiz Alpaca anahtarları 14 büyük ismi gerçek zamanlı yapar, günlük mumlarla.',
  'Big US names':'Büyük ABD isimleri','Your US picks':'ABD seçimlerin','Nothing found.':'Bir şey bulunamadı.','Prices 15 min delayed':'Fiyatlar 15 dk gecikmeli',
  'Search any US stock or ETF':'Herhangi bir ABD hissesi ya da ETF ara','Search by ticker or name':'Kod ya da isimle ara',
  'Daily candles for this stock need the free Alpaca key (only for the 14 big names). The minute view fills in while this page is open.':'Bu hissenin günlük mumları için ücretsiz Alpaca anahtarı gerekir (sadece 14 büyük isim). Dakika görünümü bu sayfa açıkken dolar.',
  'Minute candles fill in while this page is open: a new one every minute while the market is open.':'Dakikalık mumlar bu sayfa açıkken dolar: piyasa açıkken her dakika bir yenisi.',
  'All':'Tümü','Stocks':'Hisseler','ETFs and funds':'ETF ve fonlar','ADRs':'ADR’ler','All sectors':'Tüm sektörler','Biggest':'En büyükler','Risers':'Yükselenler','Fallers':'Düşenler','Most traded':'En çok işlem görenler',
  'Ticker':'Kod','Name':'İsim','Change':'Değişim','Volume':'Hacim','Size':'Büyüklük','Sector':'Sektör','Show 50 more':'50 tane daha göster','Type':'Tür','Stock':'Hisse','ETF':'ETF','ADR':'ADR',
  'Rising today':'Bugün yükselenler','Falling today':'Bugün düşenler','Market breadth':'Piyasa genişliği','Loading the US market…':'ABD piyasası yükleniyor…',
  'Risers and fallers only count companies worth $300 million or more, and ETFs that traded $5 million or more today.':'Yükselenler ve düşenler sadece 300 milyon dolar ve üstü şirketleri, bugün 5 milyon dolar ve üstü işlem gören ETF’leri sayar.',
  'Size: market value for companies, the dollar value traded today for ETFs.':'Büyüklük: şirketlerde piyasa değeri, ETF’lerde bugün işlem gören dolar tutarı.',
  'US prices here are 15 minutes delayed, and orders fill at that price plus a small 0.05% spread.':'Buradaki ABD fiyatları 15 dakika gecikmelidir; emirler bu fiyata küçük bir %0,05 makasla dolar.',
  'No live order book for delayed prices. Orders fill at the delayed price plus a 0.05% spread.':'Gecikmeli fiyatlarda canlı emir defteri yok. Emirler gecikmeli fiyata %0,05 makasla dolar.',
  'Could not load the US market. Retrying…':'ABD piyasası yüklenemedi. Yeniden deneniyor…',
});
TRP.push([/^All ([\d,]+) US stocks and ETFs →$/, m=>`${m[1]} ABD hissesi ve ETF’in tümü →`], [/^([\d,]+) listings$/, m=>`${m[1]} kayıt`],
  [/^([\d,]+) of ([\d,]+) shown$/, m=>`${m[2]} kaydın ${m[1]} tanesi gösteriliyor`], [/^([\d,]+) stocks, ETFs and ADRs · updated (.+)$/, m=>`${m[1]} hisse, ETF ve ADR · güncelleme ${m[2]}`],
  [/^([\d,]+) of ([\d,]+) companies worth \$2 billion or more$/, m=>`2 milyar dolar ve üstü ${m[2]} şirketin ${m[1]} tanesi`]);
function mkRows(){ const k=[MKT.t, MKT.list.length, MKV.q, MKV.type, MKV.sec, MKV.sort].join('|'); if (k===MKV.key) return MKV.rows; MKV.key=k;
  let xs=MKV.q.trim() ? mktFind(MKV.q, 400) : MKT.list.slice();
  if (MKV.type!=='all') xs=xs.filter(d=>d.type===MKV.type); if (MKV.sec) xs=xs.filter(d=>d.sector===MKV.sec);
  const size=d=>d.type==='stock' || d.type==='adr' ? (d.cap||0) : (d.val||0)/10, real=d=>d.type==='etf' ? d.val>=5e6 : (d.cap||0)>=3e8;
  if (MKV.sort==='up') xs=xs.filter(d=>real(d) && d.chg!=null).sort((a,b)=>b.chg-a.chg);
  else if (MKV.sort==='down') xs=xs.filter(d=>real(d) && d.chg!=null).sort((a,b)=>a.chg-b.chg);
  else if (MKV.sort==='active') xs=xs.sort((a,b)=>(b.val||0)-(a.val||0));
  else if (!MKV.q.trim()) xs=xs.sort((a,b)=>size(b)-size(a));
  MKV.rows=xs; return xs; }
function renderMarkets(Q){ const el=$('#mk');
  if (el.__lang!==ST.lang){ el.__lang=ST.lang; const seg=(id, lab, opts, cur)=>`<span class="seg" role="group" aria-label="${esc(T(lab))}" id="${id}">${opts.map(([v,l])=>`<button type="button" data-mk="${id}:${v}" aria-pressed="${cur===v}">${esc(T(l))}</button>`).join('')}</span>`;
    el.innerHTML=`<div class="bd" id="mk-idx"></div>
      <div class="pn mk-ctl"><label class="fld" for="mk-q"><span>${esc(T('Search by ticker or name'))}</span><input id="mk-q" type="search" autocomplete="off" spellcheck="false" placeholder="AAPL, Tesla, S&amp;P…"></label>
        <div class="mk-row">${seg('mk-type','Type',[['all','All'],['stock','Stocks'],['etf','ETFs and funds'],['adr','ADRs']], MKV.type)}
        <label class="sr" for="mk-sec">${esc(T('Sector'))}</label><select id="mk-sec"></select></div>
        ${seg('mk-sort','Sort',[['big','Biggest'],['up','Risers'],['down','Fallers'],['active','Most traded']], MKV.sort)}</div>
      <div class="pn"><p class="bd-sub" id="mk-count" role="status"></p><div class="tblw" id="mk-tbl"></div><p><button class="ghost" type="button" id="mk-more">${esc(T('Show 50 more'))}</button></p>
        <p class="bd-sub">${esc(T('Size: market value for companies, the dollar value traded today for ETFs.'))} ${esc(T('Risers and fallers only count companies worth $300 million or more, and ETFs that traded $5 million or more today.'))}</p>
        <p class="bd-sub">${esc(T('US prices here are 15 minutes delayed, and orders fill at that price plus a small 0.05% spread.'))}</p></div>`;
    $('#mk-q').value=MKV.q; }
  for (const b of $$('#mk [data-mk]')){ const [id, v]=b.dataset.mk.split(':'); b.setAttribute('aria-pressed', String((id==='mk-type' ? MKV.type : MKV.sort)===v)); }
  const secs=[...new Set(MKT.list.map(d=>d.sector).filter(Boolean))].sort(), sk=secs.join()+ST.lang, ss=$('#mk-sec');
  if (ss.__k!==sk){ ss.__k=sk; ss.innerHTML=`<option value="">${esc(T('All sectors'))}</option>`+secs.map(s=>`<option value="${esc(s)}">${esc(secT(s))}</option>`).join(''); } if (ss.value!==MKV.sec) ss.value=MKV.sec;
  txt('h-mk', T('US market')+(MKT.list.length ? ' · '+T('15 min delayed') : ''));
  if (!MKT.list.length){ setHTML($('#mk-idx'), ''); txt('mk-count', T(MKT.status==='offline' ? 'Could not load the US market. Retrying…' : 'Loading the US market…')); setHTML($('#mk-tbl'), ''); $('#mk-more').hidden=true; return; }
  // the four big indexes, through the ETFs that track them, and the day's breadth
  const stocks=MKT.list.filter(d=>d.type==='stock' && d.cap>=2e9 && d.chg!=null), up=stocks.filter(d=>d.chg>0).length;
  setHTML($('#mk-idx'), IDX.map(x=>{ const q=Q[x.sym] || quote(x.sym); return `<a class="bd-t mk-i" href="#trade" data-go="${x.sym}"><span class="bd-sub">${esc(x.name)} · ${x.sym}</span><span class="bd-big mono">${q ? '$'+fpx(q.last) : '—'}</span><span class="mono ${cls(q && q.chg)}">${q ? pct(q.chg) : ''}</span></a>`; }).join('')
    + `<div class="bd-t mk-i"><span class="bd-sub">${esc(T('Market breadth'))}</span><span class="bd-big mono">${F0.format(up)} <small class="up">▲</small> ${F0.format(stocks.length-up)} <small class="down">▼</small></span><span class="bd-sub">${esc(T(`${F0.format(up)} of ${F0.format(stocks.length)} companies worth $2 billion or more`))}</span></div>`);
  const rows=mkRows(), show=rows.slice(0, MKV.n), tl=d=>T(d.type==='etf' ? 'ETF' : d.type==='adr' ? 'ADR' : 'Stock');
  txt('mk-count', T(`${F0.format(show.length)} of ${F0.format(rows.length)} shown`)+' · '+T(`${F0.format(MKT.list.length)} stocks, ETFs and ADRs · updated ${new Date(MKT.t).toLocaleTimeString(ST.lang==='tr'?'tr-TR':'en-US', { hour:'2-digit', minute:'2-digit' })}`));
  setHTML($('#mk-tbl'), show.length ? `<table class="tbl mk-tbl"><thead><tr><th>${esc(T('Ticker'))}</th><th>${esc(T('Name'))}</th><th class="r">${esc(T('Price'))}</th><th class="r">${esc(T('Change'))}</th><th class="r">${esc(T('Volume'))}</th><th class="r">${esc(T('Size'))}</th><th>${esc(T('Sector'))}</th></tr></thead><tbody>${show.map(d=>{ const q=Q[d.sym], last=q ? q.last : d.last, ch=q ? q.chg : d.chg;
      return `<tr><td><a href="#trade" data-go="${esc(d.sym)}" class="mk-tk">${esc(d.sym)}</a></td><td class="mk-nm">${esc(d.name)} <span class="muted">${esc(tl(d))}</span></td><td class="r mono">$${fpx(last)}</td><td class="r mono ${cls(ch)}">${pct(ch)}</td><td class="r mono">${big(d.vol)}</td><td class="r mono">$${big(d.type==='etf' ? d.val : d.cap)}</td><td class="muted">${esc(secT(d.sector))}</td></tr>`; }).join('')}</tbody></table>` : `<p class="empty">${esc(T('Nothing found.'))}</p>`);
  $('#mk-more').hidden = rows.length<=MKV.n; }
document.addEventListener('click', e=>{ const b=e.target.closest('[data-mk]'); if (b){ const [id, v]=b.dataset.mk.split(':'); if (id==='mk-type') MKV.type=v; else MKV.sort=v; MKV.n=50; render(); return; }
  if (e.target.closest('#mk-more')){ MKV.n+=50; render(); } });

// how a delayed stock did over time, drawn as bars, with its 52-week range
const PERF_L={ '1W':['1 week','1 hafta'], '1M':['1 month','1 ay'], '3M':['3 months','3 ay'], '6M':['6 months','6 ay'], 'YTD':['This year','Bu yıl'], '1Y':['1 year','1 yıl'], '5Y':['5 years','5 yıl'] };
function perfHTML(sym, q){ const d=MKT.all[sym], det=d && d.det; if (!det) return `<p class="empty">${esc(T('Loading how it did over time…'))}</p>`;
  const xs=det.perf.filter(x=>x[1]!=null), mx=Math.max(.01, ...xs.map(x=>Math.abs(x[1]))), L=k=>PERF_L[k][ST.lang==='tr'?1:0];
  const bars=xs.map(([k,v])=>`<li><span>${esc(L(k))}</span><span class="pf-bar" aria-hidden="true"><i class="${v>=0?'pos':'neg'}" style="width:${(Math.abs(v)/mx*50).toFixed(1)}%"></i></span><span class="mono ${cls(v)}">${pct(v)}</span></li>`).join('');
  const r=det.hi52>det.lo52 ? Math.max(0, Math.min(1, (q.last-det.lo52)/(det.hi52-det.lo52))) : null;
  return `<div class="perf"><h3 class="perf-h">${esc(T('How it did'))}</h3><ul class="perf-l" aria-label="${esc(T('How it did'))}">${bars}</ul>
    ${r!=null ? `<h3 class="perf-h">${esc(T('52-week range'))}</h3><div class="rng" role="img" aria-label="${esc(T('52-week range'))}: $${fpx(det.lo52)} – $${fpx(det.hi52)}, ${esc(T('now'))} $${fpx(q.last)}"><span class="mono">$${fpx(det.lo52)}</span><span class="rng-b"><i style="left:${(r*100).toFixed(1)}%"></i></span><span class="mono">$${fpx(det.hi52)}</span></div>` : ''}
    <p class="bd-sub">${esc(T('Daily candles for this stock need the free Alpaca key (only for the 14 big names). The minute view fills in while this page is open.'))}</p></div>`; }
function detHTML(sym, q){ const d=MKT.all[sym], det=d && d.det; if (!det) return ''; const f=(k,v)=>v ? `<span>${esc(T(k))} <b class="mono">${v}</b></span>` : '';
  const dt=det.next ? new Date(det.next).toLocaleDateString(ST.lang==='tr'?'tr-TR':'en-US', { day:'numeric', month:'short', year:'numeric' }) : '';
  return `<div class="tr-facts tr-det">${f('Type', T(d.type==='etf' ? 'ETF' : d.type==='adr' ? 'ADR' : 'Stock'))}${f('Sector', d.sector ? esc(secT(d.sector)) : '')}${f('Size', d.type==='etf' ? (d.val ? '$'+big(d.val) : '') : (d.cap ? '$'+big(d.cap) : ''))}${f('P/E', det.pe>0 ? F2.format(det.pe) : '')}${f('Dividend yield', det.dy>0 ? pct(det.dy).replace('+','') : '')}${f('Beta (1 y)', det.beta!=null ? F2.format(det.beta) : '')}${f('RSI (14)', det.rsi!=null ? F0.format(det.rsi) : '')}${f('50-day average', det.sma50 ? '$'+fpx(det.sma50) : '')}${f('200-day average', det.sma200 ? '$'+fpx(det.sma200) : '')}${f('Avg. volume (30 d)', det.avgv ? big(det.avgv) : '')}${f('Next earnings', dt)}</div>`; }
Object.assign(TR, { 'Loading how it did over time…':'Zaman içindeki performansı yükleniyor…','How it did':'Nasıl gitti','52-week range':'52 haftalık aralık','now':'şimdi','P/E':'F/K','Dividend yield':'Temettü verimi','Beta (1 y)':'Beta (1 y)','RSI (14)':'RSI (14)','50-day average':'50 günlük ortalama','200-day average':'200 günlük ortalama','Avg. volume (30 d)':'Ort. hacim (30 g)','Next earnings':'Sonraki bilanço' });

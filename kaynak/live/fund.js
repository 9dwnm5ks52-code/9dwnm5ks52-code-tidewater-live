/* ---------- Phoenix: a company's fundamentals under its chart ----------
   Valuation, profitability, income, growth, balance sheet, dividends, share data and performance, from the free
   TradingView screener (the same source as the US prices). TTM = trailing twelve months, FQ = the last reported quarter. */
const FD = { c:{}, busy:{} }, FD_SECT = new Set(['Electronic Technology','Technology Services','Finance','Health Technology','Health Services','Retail Trade','Consumer Services','Consumer Durables','Consumer Non-Durables','Energy Minerals','Non-Energy Minerals','Producer Manufacturing','Process Industries','Industrial Services','Commercial Services','Communications','Utilities','Transportation','Distribution Services','Miscellaneous']);
// [field, label en, label tr, format]  formats: $ money, x ratio, % percent, n count, d date, r analyst rating, s text
const FD_GROUPS = [
  ['about', ['About','Hakkında'], [['sector','Sector','Sektör','s'],['industry','Industry','Endüstri','s'],['country','Country','Ülke','s'],['exchange','Exchange','Borsa','s'],['number_of_employees','Employees','Çalışan','n'],['earnings_release_next_date','Next earnings','Sonraki bilanço','d'],['recommendation_mark','Analyst view','Analist görüşü','r']]],
  ['val', ['Valuation','Değerleme'], [['market_cap_basic','Market value','Piyasa değeri','$'],['enterprise_value_current','Enterprise value','Firma değeri','$'],['price_earnings_ttm','P/E (TTM)','F/K (TTM)','x'],['price_book_fq','Price / book','Piyasa / defter','x'],['price_sales_current','Price / sales','Fiyat / satış','x'],['enterprise_value_ebitda_ttm','EV / EBITDA','FD / FAVÖK','x'],['price_free_cash_flow_ttm','Price / free cash flow','Fiyat / serbest nakit','x']]],
  ['inc', ['Income (TTM)','Gelir tablosu (TTM)'], [['total_revenue_ttm','Revenue','Gelir','$'],['gross_profit_ttm','Gross profit','Brüt kâr','$'],['ebitda_ttm','EBITDA','FAVÖK','$'],['net_income_ttm','Net income','Net kâr','$'],['earnings_per_share_diluted_ttm','EPS (diluted)','Hisse başı kâr','$1'],['free_cash_flow_ttm','Free cash flow','Serbest nakit akışı','$']]],
  ['prof', ['Profitability','Kârlılık'], [['gross_margin_ttm','Gross margin','Brüt marj','%'],['operating_margin_ttm','Operating margin','Faaliyet marjı','%'],['net_margin_ttm','Net margin','Net marj','%'],['return_on_equity_fq','Return on equity','Özkaynak kârlılığı','%'],['return_on_assets_fq','Return on assets','Aktif kârlılığı','%'],['return_on_invested_capital_fq','Return on invested capital','Yatırılan sermaye getirisi','%']]],
  ['grow', ['Growth','Büyüme'], [['total_revenue_yoy_growth_ttm','Revenue growth (1 y)','Gelir büyümesi (1 y)','%s'],['earnings_per_share_diluted_yoy_growth_ttm','EPS growth (1 y)','HBK büyümesi (1 y)','%s'],['earnings_per_share_forecast_next_fq','EPS forecast (next quarter)','HBK beklentisi (sonraki çeyrek)','$1']]],
  ['bal', ['Balance sheet (FQ)','Bilanço (FQ)'], [['total_assets_fq','Total assets','Toplam varlıklar','$'],['total_debt_fq','Total debt','Toplam borç','$'],['total_equity_fq','Equity','Özkaynak','$'],['cash_n_short_term_invest_fq','Cash & short-term investments','Nakit ve kısa vadeli yatırımlar','$'],['debt_to_equity_fq','Debt / equity','Borç / özkaynak','x'],['current_ratio_fq','Current ratio','Cari oran','x'],['quick_ratio_fq','Quick ratio','Asit-test oranı','x']]],
  ['div', ['Dividends','Temettü'], [['dividends_yield_current','Dividend yield','Temettü verimi','%'],['dividends_per_share_fq','Dividend per share (quarter)','Hisse başı temettü (çeyrek)','$1'],['dividend_payout_ratio_ttm','Payout ratio','Dağıtım oranı','%']]],
  ['share', ['Shares & trading','Hisse ve işlem'], [['beta_1_year','Beta (1 y)','Beta (1 y)','x'],['Volatility.M','Volatility (month)','Oynaklık (ay)','%'],['volume','Volume today','Bugünkü hacim','n'],['average_volume_30d_calc','Average volume (30 d)','Ortalama hacim (30 g)','n'],['total_shares_outstanding_fundamental','Shares outstanding','Dolaşımdaki hisse','n'],['float_shares_outstanding_current','Free float','Halka açık hisse','n'],['High.All','All-time high','Tüm zamanların zirvesi','$1'],['Low.All','All-time low','Tüm zamanların dibi','$1']]],
  ['perf', ['Performance','Performans'], [['Perf.W','1 week','1 hafta','%s'],['Perf.1M','1 month','1 ay','%s'],['Perf.3M','3 months','3 ay','%s'],['Perf.6M','6 months','6 ay','%s'],['Perf.YTD','Year to date','Yılbaşından beri','%s'],['Perf.Y','1 year','1 yıl','%s'],['Perf.5Y','5 years','5 yıl','%s']]],
];
const FD_COLS = ['description','close','price_52_week_high','price_52_week_low'].concat(...FD_GROUPS.map(g=>g[2].map(f=>f[0])));
async function fdLoad(sym){ const d=typeof MKT!=='undefined' && MKT.all[sym]; if (!d || !d.tv || FD.busy[sym]) return; const c=FD.c[sym]; if (c && Date.now()-c.t<10*6e4) return;
  FD.busy[sym]=true; try{ const x=await mktPost({ symbols:{ tickers:[d.tv] }, columns:FD_COLS }), v=x && x.data && x.data[0] && x.data[0].d;
    if (v){ const o={}; FD_COLS.forEach((k,i)=>{ o[k]=v[i]; }); FD.c[sym]={ t:Date.now(), v:o }; } else FD.c[sym]={ t:Date.now(), v:null }; }
  catch(e){ FD.c[sym]={ t:Date.now()-9*6e4, v:null, err:String(e && e.message || e) }; }
  finally { FD.busy[sym]=false; if (typeof render==='function') render(); } }
function fdFmt(v, f){ if (v==null || v==='' || (typeof v==='number' && !isFinite(v))) return null;
  const loc=ST.lang==='tr' ? 'tr-TR' : 'en-US', num=(x, d)=>new Intl.NumberFormat(loc, { maximumFractionDigits:d, minimumFractionDigits:d }).format(x);
  if (f==='s') return typeof secT==='function' && FD_SECT.has(v) ? secT(v) : String(v);
  if (f==='$') return (v<0 ? '−' : '')+'$'+big(Math.abs(v));
  if (f==='$1') return (v<0 ? '−$' : '$')+num(Math.abs(v), 2);
  if (f==='x') return num(v, 2)+'×';
  if (f==='%') return ST.lang==='tr' ? '%'+num(v, 2) : num(v, 2)+'%';
  if (f==='%s') return pct(v/100);
  if (f==='n') return big(v);
  if (f==='d') return new Date(v*1000).toLocaleDateString(loc, { day:'numeric', month:'short', year:'numeric' });
  if (f==='r'){ const k=v<1.5 ? 0 : v<2.5 ? 1 : v<3.5 ? 2 : v<4.5 ? 3 : 4; return L2(...[['Strong buy','Güçlü al'],['Buy','Al'],['Hold','Tut'],['Sell','Sat'],['Strong sell','Güçlü sat']][k])+` (${num(v, 1)})`; }
  return String(v); }
function fdHTML(sym){ const c=FD.c[sym], v=c && c.v; if (!v) return `<p class="bd-sub">${esc(c && c.err ? L2('Fundamentals are unavailable right now.','Temel veriler şu an alınamıyor.') : L2('Loading the company’s fundamentals…','Şirketin temel verileri yükleniyor…'))}</p>`;
  const hi=v.price_52_week_high, lo=v.price_52_week_low, px=v.close, at=hi>lo ? Math.max(0, Math.min(100, (px-lo)/(hi-lo)*100)) : null;
  const range=at==null ? '' : `<div class="fd-rg"><span>${esc(L2('52-week range','52 haftalık aralık'))}</span><div class="fd-rb" role="img" aria-label="${esc(L2(`52-week range ${fdFmt(lo,'$1')} to ${fdFmt(hi,'$1')}, now ${fdFmt(px,'$1')}`, `52 haftalık aralık ${fdFmt(lo,'$1')} ile ${fdFmt(hi,'$1')} arası, şimdi ${fdFmt(px,'$1')}`))}"><i style="left:${at.toFixed(1)}%"></i></div><div class="fd-rl"><b>${fdFmt(lo,'$1')}</b><b>${fdFmt(hi,'$1')}</b></div></div>`;
  const groups=FD_GROUPS.map(([id, name, fs])=>{ const rows=fs.map(([k, en, tr, f])=>{ const t=fdFmt(v[k], f); if (t==null) return ''; const sign=(f==='%s' || f==='$') && typeof v[k]==='number' ? (v[k]>0 ? ' up' : v[k]<0 ? ' down' : '') : '';
      return `<div class="fd-kv"><dt>${esc(L2(en, tr))}</dt><dd class="${f==='%s' ? sign.trim() : ''}">${esc(t)}</dd></div>`; }).join('');
    return rows ? `<section class="fd-g fd-${id}"><h3>${esc(L2(...name))}</h3><dl>${rows}</dl></section>` : ''; }).join('');
  return `<div class="bd-th"><h2>${esc(v.description || sym)} · ${esc(L2('Fundamentals','Temel veriler'))}</h2></div>${range}<div class="fd-grid">${groups}</div>
    <p class="bd-sub fd-src">${esc(L2('Source: TradingView screener · TTM = last twelve months · FQ = last reported quarter · updated every 10 minutes','Kaynak: TradingView tarayıcısı · TTM = son on iki ay · FQ = son açıklanan çeyrek · 10 dakikada bir güncellenir'))}</p>`; }
// shown on the Trade screen under the chart, for US stocks and ETFs
function fdRender(){ const el=$('#tr-fund'); if (!el) return; const sym=ST.sel, d=typeof MKT!=='undefined' && MKT.all[sym], stock=d && d.tv && !(typeof liveDef==='function' && liveDef(sym));
  el.hidden=!stock; if (!stock) return; fdLoad(sym); const h=fdHTML(sym), k=sym+'|'+ST.lang+'|'+((FD.c[sym]||{}).t||0); if (el.__k!==k){ el.__k=k; setHTML(el, h); } }

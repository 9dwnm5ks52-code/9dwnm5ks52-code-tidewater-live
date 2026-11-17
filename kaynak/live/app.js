/* ---------- Phoenix Finance Club: the interface ----------
   One shared paper-trading fund. Its holdings, orders and trades come from fund.json (club.js); this page shows them with
   live prices and lets club members send orders. Your own settings (language, theme, watchlist, alerts) stay in this browser. */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INST=[...LIVE_CRYPTO.map(d=>({ ...d, kind:'crypto' })), ...LIVE_US.map(d=>({ ...d, kind:'stock' }))];
const IM0=Object.fromEntries(INST.map(d=>[d.sym, d]));
const IM=new Proxy(IM0, { get:(o, k)=>{ if (typeof k!=='string') return undefined; if (o[k]) return o[k]; const cx=LIVE_EXTRA.find(d=>d.sym===k); if (cx) return { ...cx, kind:'crypto' }; if (MKT.all[k]) return MKT.all[k];
  const held=ST && ST.A && ((ST.A.pos||{})[k] || (ST.A.orders||[]).find(x=>x.sym===k && x.status==='open')); if (held) return { sym:k, tk:k, name:k, kind:held.kind==='crypto' ? 'crypto' : 'stock' }; return undefined; } });
const KEY='tdl-state';
let ST=null;
// what this browser keeps: preferences, the watchlist and alerts, orders it is waiting on. The fund itself (ST.A) is never saved here.
function stNew(){ return { v:2, A:brkNew(), inbox:[], sel:'BTC', lang:'en', theme:'light', tf:'intra', side:'buy', type:'mkt', unit:'usd', pend:[] }; }
const ST_DROP=['A','bots','ai','accts','acct','mg','eqi','bm','fut','ch','botLim','botPeak','edge','fee','jr','wk','wkSnap','ntfy','bkT','welcomed','dayEq','learnLoss','rpB','fwd','mkt','oj'];
function load(){ ST=stNew(); try{ const x=JSON.parse(localStorage.getItem(KEY)||'null'); if (x && (x.v===1 || x.v===2)){ for (const k of ST_DROP) delete x[k]; Object.assign(ST, x, { v:2, A:brkNew() }); } }catch(e){}
  if (!['buy','sell','short','cover'].includes(ST.side)) ST.side='buy'; if (!['mkt','lmt','stp'].includes(ST.type)) ST.type='mkt'; if (!Array.isArray(ST.pend)) ST.pend=[]; if (!Array.isArray(ST.inbox)) ST.inbox=[];
  if (!localStorage.getItem(KEY)) try{ if (/^tr\b/i.test(navigator.language||'')) ST.lang='tr'; }catch(e){} }
let saveT=0; function saveNow(){ clearTimeout(saveT); saveT=0; try{ const o={}; for (const k of Object.keys(ST)) if (k!=='A') o[k]=ST[k]; localStorage.setItem(KEY, JSON.stringify(o, (k, v)=>k==='buf' || k==='rb' ? undefined : v)); }catch(e){} }
function save(){ clearTimeout(saveT); saveT=setTimeout(saveNow, 400); }
addEventListener('pagehide', ()=>{ if (saveT) saveNow(); }); document.addEventListener('visibilitychange', ()=>{ if (document.hidden && saveT) saveNow(); });
/* ---- language ---- */
const TR={ 'Board':'Pano','Fund':'Fon','Trade':'İşlem','Portfolio':'Portföy','Settings':'Ayarlar','Light':'Açık','Dark':'Koyu','Markets':'Piyasalar','News':'Haberler',
  'The fund':'Fon','Market map':'Piyasa haritası','Quick trade':'Hızlı işlem','Market mood':'Piyasa havası','Fund days':'Fonun günleri','Inbox':'Gelen kutusu','Data':'Veri','Recent trades':'Son işlemler','The fund against the market':'Fon piyasaya karşı',
  'Crypto':'Kripto','US stocks':'ABD hisseleri','Buy':'Al','Sell':'Sat','Short':'Açığa sat','Cover':'Geri al','Market':'Piyasa','Limit':'Limit','Stop':'Stop','Units':'Adet',
  'Order for the fund':'Fon için emir','Order book':'Emir defteri','The fund’s position':'Fonun pozisyonu','Open orders':'Açık emirler','Holdings':'Varlıklar','Trade history':'İşlem geçmişi','The club fund':'Kulüp fonu','Your watchlist':'İzleme listen','Full report →':'Tam rapor →',
  'Amount in dollars':'Dolar olarak tutar','Amount in units':'Adet olarak miktar','Limit price':'Limit fiyatı','Stop price':'Stop fiyatı','Note / thesis (optional, public)':'Not / tez (isteğe bağlı, herkese açık)',
  'Crypto prices':'Kripto fiyatları','US stock prices':'ABD hisse fiyatları','About':'Hakkında','Save and connect':'Kaydet ve bağlan','Remove the keys':'Anahtarları sil',
  "Live from Binance's public market data, with Coinbase as a backup. Free, no sign-up.":'Binance’in herkese açık piyasa verisinden canlı, yedek olarak Coinbase. Ücretsiz, kayıt yok.',
  "US stocks: the whole market, about 10,000 stocks, ETFs and ADRs, from TradingView's free screener. Prices are 15 minutes delayed. No sign-up.":'ABD hisseleri: piyasanın tamamı, yaklaşık 10.000 hisse, ETF ve ADR, TradingView’in ücretsiz tarayıcısından. Fiyatlar 15 dakika gecikmeli. Kayıt yok.',
  'Optional: paste the two keys of a free Alpaca account (paper trading is enough) to get real-time prices and daily candles for the 14 big names. They stay in this browser only and are sent only to Alpaca.':'İsteğe bağlı: 14 büyük isim için gerçek zamanlı fiyat ve günlük mum istersen ücretsiz bir Alpaca hesabının (sanal hesap yeterli) iki anahtarını yapıştır. Sadece bu tarayıcıda kalır ve sadece Alpaca’ya gönderilir.',
  'Optional backup: a free Finnhub key':'İsteğe bağlı yedek: ücretsiz bir Finnhub anahtarı',
  "Phoenix Finance Club is a school club’s shared paper-trading fund: $100,000 of play money, never real money, and nothing here is financial advice. Every holding, order and trade is public; only club members can trade, and no names are shown. Prices are real: crypto live from Binance; US stocks 15 minutes delayed from TradingView's screener (not an official public service, so it may change or stop). Crypto fees: 0.1% a trade. US stocks: no commission.":'Phoenix Finance Club, bir okul kulübünün ortak sanal yatırım fonudur: $100.000 oyun parası, asla gerçek para değil; buradaki hiçbir şey yatırım tavsiyesi değildir. Her varlık, emir ve işlem herkese açıktır; sadece kulüp üyeleri işlem yapabilir ve hiçbir isim gösterilmez. Fiyatlar gerçektir: kripto Binance’ten canlı; ABD hisseleri TradingView tarayıcısından 15 dakika gecikmeli (resmî bir kamu servisi değildir; değişebilir ya da durabilir). Kripto ücreti: işlem başına %0,1. ABD hisseleri: komisyon yok.',
  'Phoenix Finance Club: a school club’s paper-trading fund. Play money only. Not financial advice. Prices: Binance (crypto, live), TradingView screener (US, 15 min delayed).':'Phoenix Finance Club: bir okul kulübünün sanal yatırım fonu. Sadece oyun parası. Yatırım tavsiyesi değildir. Fiyatlar: Binance (kripto, canlı), TradingView tarayıcısı (ABD, 15 dk gecikmeli).',
  'since the start':'başlangıçtan beri','Cash':'Nakit','Invested':'Yatırımda','positions':'pozisyon','position':'pozisyon',
  'Live':'Canlı','Connecting…':'Bağlanıyor…','Reconnecting…':'Yeniden bağlanıyor…','Offline':'Bağlantı yok','Market closed':'Piyasa kapalı','Needs a free key':'Ücretsiz anahtar gerekli','Key refused':'Anahtar reddedildi','Keys in use elsewhere':'Anahtar başka yerde kullanımda','15 min delayed':'15 dk gecikmeli','real time':'gerçek zamanlı','Real time':'Gerçek zamanlı',
  'Open Settings →':'Ayarları aç →','Open the trade screen →':'İşlem ekranını aç →','Optional: free Alpaca keys make the 14 big names real time, with daily candles.':'İsteğe bağlı: ücretsiz Alpaca anahtarları 14 büyük ismi günlük mumlarla gerçek zamanlı yapar.',
  'Coins rising':'Yükselen coinler','Stocks rising':'Yükselen hisseler','Average move':'Ortalama hareket','Fear':'Korku','Neutral':'Nötr','Greed':'Açgözlülük','Extreme fear':'Aşırı korku','Extreme greed':'Aşırı açgözlülük',
  'Green: the fund grew that day. Red: it shrank.':'Yeşil: fon o gün büyüdü. Kırmızı: küçüldü.','The fund’s first day shows here tomorrow.':'Fonun ilk günü yarın burada görünür.',
  'Nothing yet. Your orders’ results and your alerts land here.':'Henüz bir şey yok. Emirlerinin sonuçları ve alarmların buraya düşer.',
  'Instrument':'Varlık','Price':'Fiyat','Qty':'Miktar','Avg cost':'Ort. maliyet','Value':'Değer','Profit/loss':'Kâr/zarar','When':'Zaman','Side':'Yön','Fee':'Ücret','Type':'Tür','Cancel':'İptal',
  'The fund holds nothing yet: all cash.':'Fon henüz bir şey tutmuyor: tamamı nakit.','The fund holds none.':'Fon bunu tutmuyor.',
  'Bid':'Alış','Ask':'Satış','Spread':'Makas','24 h high':'24 s en yüksek','24 h low':'24 s en düşük','Day high':'Gün en yüksek','Day low':'Gün en düşük','Prev. close':'Önceki kapanış',
  'Live order book from Binance':'Binance’ten canlı emir defteri','Best bid and ask (IEX)':'En iyi alış ve satış (IEX)','No order book yet.':'Henüz emir defteri yok.',
  'Waiting for prices…':'Fiyatlar bekleniyor…','Total value':'Toplam değer','Total profit/loss':'Toplam kâr/zarar',
  'Source: Binance public market data':'Kaynak: Binance herkese açık piyasa verisi','Source: TradingView screener · performance':'Kaynak: TradingView tarayıcısı · performans',
  'Close':'Kapat','Performance report':'Performans raporu','Hide amounts':'Tutarları gizle','Watchlist':'İzleme listesi','Alerts':'Alarmlar','Alert when':'Alarm koşulu','Set alert':'Alarm kur','Performance':'Performans',
  'Headlines':'Manşetler','All the news →':'Tüm haberler →','Coming reports':'Gelecek bilançolar','The order walked the real order book:':'Emir gerçek emir defterinde ilerledi:','Filled at the real price of the moment.':'O anki gerçek fiyattan doldu.',
  'Keys saved. Connecting…':'Anahtarlar kaydedildi. Bağlanıyor…','Keys removed.':'Anahtarlar silindi.','Connected to Alpaca.':'Alpaca’ya bağlandı.','Connected to Finnhub (backup).':'Finnhub’a bağlandı (yedek).','The keys were refused. Check that you copied the paper trading keys.':'Anahtarlar reddedildi. Sanal hesap anahtarlarını kopyaladığından emin ol.','Could not reach the stock data service.':'Hisse verisi servisine ulaşılamadı.',
  'The US market is closed now; limit orders wait for the open.':'ABD piyasası şu an kapalı; limit emirleri açılışı bekler.','Prices':'Fiyatlar','performance':'performans','Prices 15 min delayed':'Fiyatlar 15 dk gecikmeli',
  'Order type':'Emir türü','Amount in':'Tutar birimi','Fundamentals':'Temel veriler','Main':'Ana menü','Search any US stock or ETF':'Herhangi bir ABD hissesi ya da ETF ara',
  'Big US names':'Büyük ABD isimleri','The fund’s US picks':'Fonun ABD seçimleri','Nothing found.':'Bir şey bulunamadı.',
  'No live order book for delayed prices. Orders fill at the delayed price plus a 0.05% spread.':'Gecikmeli fiyatlar için canlı emir defteri yok. Emirler gecikmeli fiyata %0,05 makas eklenerek dolar.',
  'Minute candles fill in while this page is open: a new one every minute while the market is open.':'Dakikalık mumlar bu sayfa açıkken dolar: piyasa açıkken her dakika yeni bir mum.',
  'Daily candles for this stock need the free Alpaca key (only for the 14 big names). The minute view fills in while this page is open.':'Bu hissenin günlük mumları için ücretsiz Alpaca anahtarı gerekir (sadece 14 büyük isim). Dakikalık görünüm bu sayfa açıkken dolar.',
};
const TRP=[ // patterns for messages that carry numbers or names
  [/^(\S+) rose above \$(\S+): now \$(\S+)$/, m=>`${m[1]} $${m[2]} üstüne çıktı: şimdi $${m[3]}`],
  [/^(\S+) fell below \$(\S+): now \$(\S+)$/, m=>`${m[1]} $${m[2]} altına indi: şimdi $${m[3]}`],
  [/^(\S+) is up (\S+) today \(alert at \+(\S+)%\)$/, m=>`${m[1]} bugün ${m[2]} yükseldi (alarm +%${m[3]})`],
  [/^(\S+) is down (\S+) today \(alert at −(\S+)%\)$/, m=>`${m[1]} bugün ${m[2]} düştü (alarm −%${m[3]})`],
  [/^(\S+) reports (.+?), (before the open|after the close|time not set)(?:; expected EPS (.+))?$/, m=>`${m[1]} bilançosu ${m[2]}, ${({ 'before the open':'açılıştan önce', 'after the close':'kapanıştan sonra', 'time not set':'saat belli değil' })[m[3]]}${m[4] ? '; beklenen HBK '+m[4] : ''}`],
  [/^(\d+) of (\d+) days up$/, m=>`${m[2]} günün ${m[1]} tanesi artıda`],
  [/^Est\. (\S+) (\S+) for \$(\S+) incl\. fees$/, m=>`Tahmini ${m[1]} ${m[2]}, ücretler dahil $${m[3]}`], [/^Est\. \$(\S+) for (\S+) (\S+) incl\. fees$/, m=>`Tahmini $${m[1]}, ${m[2]} ${m[3]} için, ücretler dahil`],
  [/^(\d+) open order(s?)$/, m=>`${m[1]} açık emir`], [/^Source: (.+)$/, m=>`Kaynak: ${m[1]}`], [/^(.+) · (\d+) positions?$/, m=>`${m[1]} · ${m[2]} pozisyon`],
];
function T(s){ if (ST.lang!=='tr') return s; if (TR[s]) return TR[s]; if (ST.trMsg && ST.trMsg[s]) return ST.trMsg[s]; for (const [re, f] of TRP){ const m=String(s).match(re); if (m) return f(m); } const b=brkTr(s); return b; }
/* ---- numbers ---- */
const nf=(d)=>new Intl.NumberFormat('en-US', { minimumFractionDigits:d, maximumFractionDigits:d });
const F0=nf(0), F2=nf(2);
const pxd=v=>!(v>0) ? 2 : v>=1 ? 2 : v>=.01 ? 4 : 6;
const fpx=v=>v>0 ? nf(pxd(v)).format(v) : '—';
const money=v=>ST && ST.priv ? '$•••••' : (v<0?'−$':'$')+F2.format(Math.abs(v));
const pct=v=>{ if (v==null || !isFinite(v)) return '—'; const s=(v>=0?'+':'−'), n=F2.format(Math.abs(v*100)); return ST.lang==='tr' ? s+'%'+n : s+n+'%'; };
const fq=(q, kind)=>{ const d=BRK.DEC[kind||'crypto']||6; return String(+(+q).toFixed(d)); };
const cls=v=>v>0 ? 'up' : v<0 ? 'down' : '';
/* ---- quotes ---- */
function quote(sym){ const d=IM[sym]; if (!d) return null;
  if (d.kind==='crypto'){ const q=LIVE.q[sym]; return q && q.last>0 ? { kind:'crypto', last:q.last, bid:q.bid, ask:q.ask, book:(LIVE.focus===sym && LIVE.src==='binance') ? q.book : null, open:true, chg:q.open ? q.last/q.open-1 : null, high:q.high, low:q.low, daily:q.daily, intra:q.intra } : null; }
  const q=US.src && US.q[sym]; if (q && q.last>0) return { kind:'stock', last:q.last, bid:q.bid, ask:q.ask, book:null, open:usMarketOpen(), chg:q.chg, high:q.high, low:q.low, prev:q.prev, daily:q.daily, intra:q.intra };
  const m=MKT.all[sym]; return m && m.last>0 ? { kind:'stock', last:m.last, bid:null, ask:null, book:null, open:usMarketOpen(), chg:m.chg, high:m.high, low:m.low, prev:m.prev, daily:m.daily, intra:m.intra, delayed:true } : null; }
// what needs fresh prices: coins, the big names, the fund's holdings and open orders, the one on screen, the indexes and your watchlist
function watchList(){ const A=ST.A; const xs=LIVE_US.map(d=>d.sym).concat(Object.keys(A.pos||{}), (A.orders||[]).filter(o=>o.status==='open').map(o=>o.sym), [ST.sel], ['SPY','QQQ','DIA','IWM'], ST.watch||[]); return [...new Set(xs)]; }
function quotesAll(){ const o={}; for (const d of LIVE_CRYPTO){ const q=quote(d.sym); if (q) o[d.sym]=q; } for (const s of watchList()){ if (o[s]) continue; const q=quote(s); if (q) o[s]=q; } return o; }
/* ---- inbox and toast ---- */
function note(msg, ico){ ST.inbox.push({ t:Date.now(), msg, ico:ico||'•' }); if (ST.inbox.length>60) ST.inbox.shift(); save(); }
let toastT=0; function toast(msg){ const el=$('#toast'); el.textContent=T(msg); el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>{ el.hidden=true; }, 4500); }
let lastTick=0;
function onQuote(){ const now=Date.now(); if (now-lastTick<300){ render(); return; } lastTick=now; alCheck(quotesAll()); render(); }
/* ---- small drawings ---- */
function spark(vals){ if (vals.length<2) return `<p class="bd-sub">${esc(L2('The value line fills in as the club’s job records the fund (every 5 minutes or so).','Değer çizgisi, kulübün görevi fonu kaydettikçe dolar (yaklaşık 5 dakikada bir).'))}</p>`; const lo=Math.min(...vals), hi=Math.max(...vals), W=300, H=70, X=i=>i*W/(vals.length-1), Y=v=>H-4-(H-8)*(v-lo)/((hi-lo)||1), d=vals.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join('');
  return `<svg class="bd-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="bd-area" d="${d}L${W},${H}L0,${H}Z"/><path class="bd-line" d="${d}"/></svg>`; }
let CHM=null;   // the pro chart's coordinates (chart.js fills it in; term.js and draw.js read it)
// the last fill of an order sent from this browser: how it walked the real order book
function ojHTML(J){ const parts=J.f.parts||[], mx=Math.max(1e-12, ...parts.map(p=>+p.q||0)), kind=J.f.kind==='stock' ? 'stock' : 'crypto';
  return `<div class="oj"><div class="oj-h"><b>${esc(msgT(J.m))}</b><button class="oj-x" type="button" data-ojx aria-label="${esc(T('Close'))}">×</button></div>
    ${parts.length>1 || (parts[0] && parts[0].book) ? `<p class="bd-sub">${esc(T('The order walked the real order book:'))}</p><ol>${parts.slice(0,8).map(p=>`<li><span>$${esc(fpx(+p.px))}</span><span class="bar" aria-hidden="true"><i style="width:${((+p.q||0)/mx*100).toFixed(1)}%"></i></span><span>${esc(fq(+p.q, kind))}</span></li>`).join('')}</ol>` : `<p class="bd-sub">${esc(T('Filled at the real price of the moment.'))}</p>`}</div>`; }
/* ---- status ---- */
function cxStatus(){ return { live:'Live', loading:'Connecting…', reconnecting:'Reconnecting…', offline:'Offline', idle:'Connecting…' }[LIVE.status] || 'Connecting…'; }
function mktStatus(){ return { loading:'Connecting…', idle:'Connecting…', live:'15 min delayed', closed:'Market closed', stale:'Reconnecting…', offline:'Offline' }[MKT.status] || 'Connecting…'; }
function usStatus(){ return US.src ? apStatus() : mktStatus(); }
function apStatus(){ if (US.status==='nokey') return 'Needs a free key'; if (US.status==='badkey') return 'Key refused'; if (US.status==='busy') return 'Keys in use elsewhere'; if (US.status==='loading') return 'Connecting…'; if (US.status==='reconnecting') return 'Reconnecting…'; if (US.status==='offline') return 'Offline'; return usMarketOpen() ? 'Live' : 'Market closed'; }
const stCls=s=>['Live','15 min delayed'].includes(s) ? 'ok' : ['Offline','Key refused'].includes(s) ? 'bad' : 'mid';
/* ---- render ---- */
let rq=0; function render(){ if (rq) return; rq=requestAnimationFrame(()=>{ rq=0; try{ renderNow(); }catch(e){ console.error(e); } }); }
function setHTML(el, h){ if (el && el.__h!==h){ el.__h=h; el.innerHTML=h; } }
function txt(id, v){ const e=document.getElementById(id); if (e && e.textContent!==v) e.textContent=v; }
const VIEWS=['board','markets','crypto','news','report','trade','portfolio','settings'];
function view(){ const h=location.hash.slice(1); return VIEWS.includes(h) ? h : 'board'; }
function renderNow(){ const v=view(), Q=quotesAll(), A=ST.A, E=fundEq(Q);
  for (const s of $$('.lv-view')) s.hidden = s.id!=='v-'+v;
  for (const a of $$('.lv-nav a')){ if (a.dataset.nav===v) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); }
  txt('lv-nw', money(E)); const pl=E/A.start-1, ple=$('#lv-pl'); ple.className='mono '+cls(pl); txt('lv-pl', pct(pl));
  const cs=cxStatus(), us=usStatus(); setHTML($('#lv-dots'), `<span class="lv-dot ${stCls(cs)}"><i></i>${esc(T('Crypto'))}: ${esc(T(cs))}</span><span class="lv-dot ${stCls(us)}"><i></i>${esc(T('US stocks'))}: ${esc(T(us))}</span>`);
  mktSetWatch(watchList()); if (v==='board') renderBoard(Q, E); else if (v==='markets') renderMarkets(Q); else if (v==='crypto') renderCrypto(Q); else if (v==='news') renderNews(Q); else if (v==='report') renderReport(); else if (v==='trade') renderTrade(Q); else if (v==='portfolio') renderPortfolio(Q, E); else renderSettings(); if (typeof uiAfter==='function') uiAfter(v, Q); }
function tile(id, cls, title, inner, dot){ return `<section class="bd-t ${cls}" id="t-${id}" aria-labelledby="t-${id}-h"><div class="bd-th"><span class="bd-dot ${dot||''}" aria-hidden="true"></span><h2 id="t-${id}-h">${esc(T(title))}</h2></div>${inner}</section>`; }
function boardBuild(){ const el=$('#bd'); if (el.__lang===ST.lang) return; el.__lang=ST.lang;
  const H=typeof hmTiles==='function' ? hmTiles() : {};
  const rng=BRANGES.map(([k, en, tr])=>`<button type="button" class="pill" data-brange="${k}" aria-pressed="${(ST.brange||'all')===k}">${esc(L2(en, tr))}</button>`).join('');
  el.innerHTML = `<section class="bd-t hero-fund" id="t-money" aria-labelledby="t-money-h"><h2 class="hf-l" id="t-money-h">${esc(L2('Phoenix Finance Club fund','Phoenix Finance Club fonu'))}</h2>
      <div class="hf-v" id="b-eq"></div><div class="hf-c" id="b-pl"></div>
      <div class="pills hf-pills" role="group" aria-label="${esc(L2('Chart range','Grafik aralığı'))}">${rng}</div>
      <div class="hf-chart" id="b-perf"></div><p class="bd-sub hf-upd" id="b-upd"></p></section>`
    + (H.today||'')
    + tile('cash','bd-stat','Cash', `<div class="bd-big mono" id="b-cashv"></div><p class="bd-sub mono" id="b-cash"></p>`)
    + tile('mood','bd-stat','Market mood', `<div class="bd-big mono mood-v"><span id="m-v"></span><small id="m-l"></small></div><div class="mood-bar" aria-hidden="true"><i id="m-g"></i></div><p class="bd-sub mono" id="m-d"></p>`)
    + `<section class="bd-t w2" id="t-trades" aria-labelledby="t-trades-h"><div class="bd-th"><h2 id="t-trades-h">${esc(T('Recent trades'))}</h2><a class="bd-more" href="#portfolio">${esc(L2('All ›','Tümü ›'))}</a></div><div id="b-trades"></div></section>`
    + `<section class="bd-t w2 vs-card" id="t-vs" aria-labelledby="t-vs-h"><div><div class="bd-th"><h2 id="t-vs-h">${esc(L2('Against the S&P 500','S&P 500’e karşı'))}</h2></div><div class="vs-big mono" id="b-vs"></div><p class="vs-sub" id="b-vs-s"></p></div><a class="vs-go" href="#trade">${esc(L2('Trade','İşlem yap'))}</a></section>`
    + tile('map','w2 h2','Market map', `<div id="b-map"></div><a class="bd-more" href="#markets">${esc(L2('All US stocks and ETFs →','Tüm ABD hisseleri ve ETF’ler →'))}</a>`)
    + (H.week||'')
    + tile('watch','','Watchlist', `<div id="b-wl"></div>`)
    + tile('earn','','Coming reports', `<div id="b-earn"></div>`)
    + tile('news','w2','Headlines', `<div id="b-news"></div><a class="bd-more" href="#news">${esc(T('All the news →'))}</a>`); }
const BRANGES=[['all','Start','Başlangıç'],['1m','1 month','1 Ay'],['1w','1 week','1 Hafta'],['1d','Today','Bugün']];
function brangeFrom(k){ const now=Date.now(); if (k==='1m') return now-30*864e5; if (k==='1w') return now-7*864e5; if (k==='1d'){ const d=new Date(); d.setHours(0,0,0,0); return +d; } return 0; }
const FILL_DONE={ buy:['bought','alındı'], sell:['sold','satıldı'], short:['shorted','açığa satıldı'], cover:['covered','geri alındı'] };
function boardTrades(fills){ const fs=(fills||[]).slice().sort((a,b)=>b.t-a.t).slice(0, 3); if (!fs.length) return `<p class="empty">${esc(L2('No trades yet.','Henüz işlem yok.'))}</p>`;
  return `<ul class="rt-list">${fs.map(f=>`<li><span><b>${esc(f.sym)}</b> ${esc(L2(...FILL_DONE[fillAct(f)]))}${f.note ? ` <span class="rt-n">· “${esc(f.note)}”</span>` : ''}</span><span class="rt-p">$${esc(fpx(+f.px))}</span></li>`).join('')}</ul>`; }
function renderBoard(Q, E){ boardBuild(); const A=ST.A;
  txt('b-eq', money(E)); const pl=E-A.start, ple=$('#b-pl'); ple.className='hf-c mono '+cls(pl); txt('b-pl', `${pl>=0?'+':'−'}${money(Math.abs(pl)).replace('−','')} · ${pct(E/A.start-1)} ${T('since the start')}`);
  const inv=E-A.cash, np=Object.keys(A.pos).length; txt('b-cashv', money(A.cash)); txt('b-cash', `${np} ${T(np===1?'position':'positions')} · ${money(inv)} ${L2('invested','yatırımda')}`);
  const rk=ST.brange||'all'; for (const b of $$('#bd [data-brange]')) b.setAttribute('aria-pressed', String(b.dataset.brange===rk));
  setHTML($('#b-perf'), boardChart(A.eq||[], brangeFrom(rk), E, 'b-perf'));
  txt('b-upd', CLUB.fund ? L2(`Updated by the club’s job ${fundAgo()} (run ${CLUB.fund.seq||0}). Values move with live prices.`, `Kulübün görevi ${fundAgo()} güncelledi (${CLUB.fund.seq||0}. çalışma). Değerler canlı fiyatlarla oynar.`)
    : SRV.url ? (CLUB.err ? L2(`The fund could not be loaded (${CLUB.err}); trying again.`, `Fon yüklenemedi (${CLUB.err}); tekrar deneniyor.`) : L2('Loading the fund…','Fon yükleniyor…'))
    : L2('A blank $100,000 fund: the real one loads on the club’s website (GitHub Pages).','Boş bir $100.000 fon: gerçeği kulübün sitesinde (GitHub Pages) yüklenir.'));
  // the fund against the S&P 500 over the fund's whole history, in percentage points
  const B=perfBench(A.eq||[]), ret=E/A.start-1, gap=B.spy!=null ? (ret-B.spy)*100 : null, nf2=new Intl.NumberFormat(ST.lang==='tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  txt('b-vs', gap==null ? '—' : gap>=0 ? L2(`+${nf2.format(gap)} points ahead`, `+${nf2.format(gap)} puan önde`) : L2(`${nf2.format(-gap)} points behind`, `${nf2.format(-gap)} puan geride`));
  txt('b-vs-s', B.spy!=null ? L2(`Fund ${pct(ret)} · S&P 500 ${pct(B.spy)}`, `Fon ${pct(ret)} · S&P 500 ${pct(B.spy)}`) : L2('The comparison fills in as the club’s job records the fund.','Karşılaştırma, kulübün görevi fonu kaydettikçe dolar.'));
  // market map
  const tileBtn=d=>{ const q=Q[d.sym], ch=q ? q.chg : null, t=ch==null ? 0 : Math.max(-1, Math.min(1, ch/(d.kind==='crypto'?.06:.03))), bg=ch==null ? 'var(--surface-2)' : `color-mix(in srgb,${t>=0?'var(--gain)':'var(--loss)'} ${Math.round(10+Math.abs(t)*34)}%,var(--surface-1))`;
    return `<button type="button" data-sym="${esc(d.sym)}" aria-pressed="${ST.sel===d.sym}" style="background:${bg}" aria-label="${esc(d.name)} ${q ? '$'+fpx(q.last)+' '+pct(ch) : ''}"><b>${esc(d.sym)}</b><span class="mono">${q ? '$'+fpx(q.last) : '—'}</span><span class="mono">${pct(ch)}</span></button>`; };
  setHTML($('#b-map'), `<p class="hm-sec">${esc(T('Crypto'))}</p><div class="hm">${LIVE_CRYPTO.map(d=>tileBtn({ ...d, kind:'crypto' })).join('')}</div><p class="hm-sec">${esc(T('US stocks'))} · ${esc(T(US.src ? 'real time' : '15 min delayed'))}</p><div class="hm">${LIVE_US.map(d=>tileBtn({ ...d, kind:'stock' })).join('')}</div>`);
  // mood: share of coins and stocks rising, and the average move
  const ch=xs=>xs.map(s=>Q[s] && Q[s].chg).filter(x=>x!=null), cc=ch(LIVE_CRYPTO.map(x=>x.sym)), big=MKT.list.filter(d=>d.type==='stock' && d.cap>=2e9 && d.chg!=null), sc=big.length ? big.map(d=>d.chg) : ch(LIVE_US.map(x=>x.sym)), all=cc.concat(sc);
  if (all.length){ const half=xs=>xs.length ? xs.filter(x=>x>0).length/xs.length : null, hc=half(cc), hs=half(sc), up=hc!=null && hs!=null ? (hc+hs)/2 : (hc!=null ? hc : hs), mean=xs=>xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0, avg=cc.length && sc.length ? (mean(cc)+mean(sc))/2 : mean(all), sc100=Math.round(Math.max(0, Math.min(100, up*70+50+avg*300-35)));
    txt('m-v', String(sc100)); const lab=sc100<25?'Extreme fear':sc100<45?'Fear':sc100<56?'Neutral':sc100<76?'Greed':'Extreme greed'; txt('m-l', T(lab));
    const col=sc100<25 ? 'var(--loss)' : sc100<45 ? 'var(--warn)' : sc100<56 ? 'var(--ink-2)' : 'var(--gain)', g=$('#m-g'); g.style.width=Math.max(3, sc100)+'%'; g.style.background=col; $('#m-l').style.color=col;
    txt('m-d', `${T('Coins rising')}: ${cc.filter(x=>x>0).length}/${cc.length}` + (sc.length ? ` · ${T('Stocks rising')}: ${F0.format(sc.filter(x=>x>0).length)}/${F0.format(sc.length)}` : '')); }
  setHTML($('#b-trades'), boardTrades(A.fills));
  setHTML($('#b-wl'), wlTile(Q)); setHTML($('#b-news'), newsTile()); setHTML($('#b-earn'), earnTile()); }
function renderTrade(Q){ const sel=$('#tr-sym'), d=IM[ST.sel], q=Q[ST.sel], A=ST.A;
  const mine=[...new Set(Object.keys(A.pos).concat([ST.sel]))].filter(s=>!IM0[s] && IM[s]), opt=x=>`<option value="${esc(x.sym)}">${esc(x.sym)} · ${esc(x.name)}</option>`;
  const ok=mine.join()+'|'+ST.lang+'|'+mine.map(s=>IM[s].name).join(); if (sel.__k!==ok){ sel.__k=ok; sel.innerHTML=`<optgroup label="${esc(T('Crypto'))}">${LIVE_CRYPTO.map(opt).join('')}</optgroup><optgroup label="${esc(T('Big US names'))}">${LIVE_US.map(opt).join('')}</optgroup>${mine.length ? `<optgroup label="${esc(T('The fund’s US picks'))}">${mine.map(s=>opt(IM[s])).join('')}</optgroup>` : ''}`; }
  const fq0=ST.find||''; setHTML($('#tr-hits'), fq0 && MKT.list.length ? (()=>{ const hs=mktFind(fq0, 8); return hs.length ? hs.map(h=>`<li><button type="button" data-sym="${esc(h.sym)}" data-clear><b>${esc(h.sym)}</b><span>${esc(h.name)}</span><span class="mono">$${fpx(h.last)} <i class="${cls(h.chg)}">${pct(h.chg)}</i></span></button></li>`).join('') : `<li class="empty">${esc(T('Nothing found.'))}</li>`; })() : '');
  if (sel.value!==ST.sel) sel.value=ST.sel;
  const mk=MKT.all[ST.sel]; txt('tr-nm', d.name || d.sym); txt('tr-ex', d.kind==='crypto' ? `${d.sym} · ${T('Crypto')}` : `${d.sym}${mk && mk.ex ? ' · '+mk.ex : ''}`);
  { const f=$('#tr-find'), ph=T('Search any US stock or ETF'); if (f && f.placeholder!==ph) f.placeholder=ph; }
  txt('tr-px', q ? '$'+fpx(q.last) : '—'); const ce=$('#tr-chg'); ce.className='mono '+cls(q && q.chg); txt('tr-chg', q ? pct(q.chg)+(d.kind==='crypto' ? ' · 24 h' : '') : T('Waiting for prices…'));
  const fact=(k,v)=>`<span>${esc(T(k))} <b class="mono">${v}</b></span>`;
  setHTML($('#tr-facts'), q ? (d.kind==='crypto' ? fact('24 h high','$'+fpx(q.high))+fact('24 h low','$'+fpx(q.low)) : fact('Day high','$'+fpx(q.high))+fact('Day low','$'+fpx(q.low))+fact('Prev. close','$'+fpx(q.prev)))+(q.bid && q.ask ? fact('Bid','$'+fpx(q.bid))+fact('Ask','$'+fpx(q.ask)) : '')+(q.delayed ? `<span class="muted">${esc(T('Prices 15 min delayed'))}</span>` : '') : '');
  if (typeof chInit==='function') chInit();   // ST.chart (migrates an old ST.tf 'intra'/'daily' to '1m'/'1d' once) and keeps ST.tf in sync
  const ctf=typeof chTfEff==='function' && ST.chart ? chTfEff(ST.sel) : ST.chart && ST.chart.tf || (ST.tf==='daily' ? '1d' : '1m'), tb=$('#tr-tf'); if (tb && typeof cuToolbar==='function') setHTML(tb, cuToolbar());
  const bars0=typeof cdBars==='function' && d.kind==='stock' ? cdBars(ST.sel, ctf) : null, nb=Array.isArray(bars0) ? bars0.length : 0, perf=q && q.delayed && ST.tf==='daily' && !nb;
  const TFN={ '1s':['1-second candles, live from every trade','1 saniyelik mumlar, her işlemden canlı'], '1m':['1-minute candles','1 dakikalık mumlar'], '5m':['5-minute candles','5 dakikalık mumlar'], '15m':['15-minute candles','15 dakikalık mumlar'], '1h':['hourly candles','saatlik mumlar'], '4h':['4-hour candles','4 saatlik mumlar'], '1d':['daily candles','günlük mumlar'], '1w':['weekly candles','haftalık mumlar'] };
  txt('tr-src', T('Source: '+(d.kind==='crypto' ? (LIVE.src==='coinbase'?'Coinbase':'Binance') : (q && q.delayed ? 'TradingView screener' : US.src==='alpaca'?'Alpaca (IEX)':US.src==='finnhub'?'Finnhub':'—'))) + ' · ' + (perf ? T('performance') : L2(...(TFN[ctf]||TFN['1m']))));
  setHTML($('#tr-det'), q && q.delayed ? detHTML(ST.sel, q) : '');
  const host=$('#tr-chart');
  if ((perf || (d.kind==='stock' && q && q.delayed && nb<2)) && typeof chDetach==='function') chDetach();   // no chart here: drop the old one's state
  if (perf) setHTML(host, perfHTML(ST.sel, q));
  else if (d.kind==='stock' && q && q.delayed && nb<2) setHTML(host, `<p class="empty">${esc(T(ST.tf==='daily' ? 'Daily candles for this stock need the free Alpaca key (only for the 14 big names). The minute view fills in while this page is open.' : 'Minute candles fill in while this page is open: a new one every minute while the market is open.'))}</p>`);
  else chRender(host, ST.sel);
  // book
  if (d.kind==='crypto' && q && q.book && q.book.asks.length){ const a=q.book.asks.slice(0,8).reverse(), b=q.book.bids.slice(0,8), mx=Math.max(...a.concat(b).map(x=>x[1]));
    const row=(x,c)=>`<tr class="${c}"><td>$${fpx(x[0])}</td><td class="r">${fq(x[1],'crypto')}<span class="dep" style="width:${(x[1]/mx*100).toFixed(0)}%"></span></td></tr>`;
    txt('tr-bk-h', T('Live order book from Binance')); setHTML($('#tr-book'), `<table class="book"><tbody>${a.map(x=>row(x,'ask')).join('')}<tr class="mid"><td colspan="2">${esc(T('Spread'))} $${fpx(q.book.asks[0][0]-q.book.bids[0][0])}</td></tr>${b.map(x=>row(x,'bid')).join('')}</tbody></table>`); }
  else if (q && q.bid && q.ask){ txt('tr-bk-h', T(d.kind==='crypto'?'Order book':'Best bid and ask (IEX)')); setHTML($('#tr-book'), `<table class="book"><tbody><tr class="ask"><td>${esc(T('Ask'))}</td><td class="r">$${fpx(q.ask)}</td></tr><tr class="mid"><td colspan="2">${esc(T('Spread'))} $${fpx(q.ask-q.bid)}</td></tr><tr class="bid"><td>${esc(T('Bid'))}</td><td class="r">$${fpx(q.bid)}</td></tr></tbody></table>`); }
  else { txt('tr-bk-h', T('Order book')); setHTML($('#tr-book'), `<p class="empty">${esc(T(q && q.delayed ? 'No live order book for delayed prices. Orders fill at the delayed price plus a 0.05% spread.' : 'No order book yet.'))}</p>`); }
  // the ticket: members send orders to the club's job; everyone else sees why they cannot
  const mem=!!clubTok(), busy=clubPending('t'), lock=$('#tk-lock');
  lock.hidden=mem; setHTML(lock, mem ? '' : `<p>${esc(clubLockMsg())}</p><p class="bd-sub">${esc(L2('Members: save your GitHub member token in Settings, then come back here.','Üyeler: GitHub üye token’ını Ayarlar’a kaydet, sonra buraya dön.'))} <a href="#settings">${esc(L2('Open Settings →','Ayarları aç →'))}</a></p>`);
  $('#tk').classList.toggle('locked', !mem);
  for (const b of $$('#tk-side [data-side]')) b.setAttribute('aria-pressed', String(b.dataset.side===ST.side));
  for (const b of $$('#tk-type [data-type]')) b.setAttribute('aria-pressed', String(b.dataset.type===ST.type));
  for (const b of $$('#tk-unit [data-unit]')) b.setAttribute('aria-pressed', String(b.dataset.unit===ST.unit));
  $('#tk-pxw').hidden = ST.type==='mkt'; txt('tk-px-l', T(ST.type==='stp'?'Stop price':'Limit price')); txt('tk-amt-l', T(ST.unit==='usd'?'Amount in dollars':'Amount in units'));
  const buyish=ST.side==='buy' || ST.side==='cover', go=$('#tk-go'); txt('tk-go', busy ? L2('Waiting for GitHub…','GitHub bekleniyor…') : actName(ST.side)+' '+d.sym); go.className='go'+(buyish ? '' : ' b-sell'); go.disabled=!q || !mem || busy;
  const amt=+$('#tk-amt').value, px=ST.type==='mkt' ? (q ? brkPrice(q, buyish ? 'b' : 's') : 0) : +$('#tk-px').value, fee=1+BRK.FEES[d.kind];
  txt('tk-est', q && amt>0 && px>0 ? (ST.unit==='usd' ? T(`Est. ${fq(amt/px, d.kind)} ${d.sym} for $${F2.format(amt*(buyish?fee:1))} incl. fees`) : T(`Est. $${F2.format(amt*px*(buyish?fee:2-fee))} for ${fq(amt, d.kind)} ${d.sym} incl. fees`)) : '');
  txt('tk-msg', ST.tmsg ? msgT(ST.tmsg) : d.kind==='stock' && q && !q.open ? T('The US market is closed now; limit orders wait for the open.') : '');
  setHTML($('#tk-oj'), ST.oj && ST.oj.sym===ST.sel && Date.now()-ST.oj.k<120000 ? ojHTML(ST.oj) : '');
  setHTML($('#tr-news'), tradeNews(ST.sel)); renderTradeWatch(ST.sel, q);
  // the fund in a few numbers, and its open orders
  const p=A.pos[ST.sel], kind=d.kind, E=fundEq(Q), row=(k, v)=>`<div><span>${esc(k)}</span><b>${v}</b></div>`;
  setHTML($('#tk-sum'), row(L2('Fund','Fon'), money(E)) + row(L2('Free cash','Serbest nakit'), money(brkFree(A))) + row(L2(`${d.sym} in the fund`, `Fondaki ${d.sym}`), p ? `${esc(fq(p.q, kind))}${p.q<0 ? ' ('+esc(L2('short','açık'))+')' : ''}${q ? ` · <span class="${cls(p.q*(q.last-p.avg))}">${pct((q.last/p.avg-1)*(p.q<0 ? -1 : 1))}</span>` : ''}` : esc(L2('none','yok'))));
  setHTML($('#tr-ord'), `<div class="tblw" tabindex="0" role="region" aria-label="${esc(T('Open orders'))}">${clubOrdersTable(A.orders, null, true)}</div>`); }
function renderPortfolio(Q, E){ renderPerf(Q, E); renderWatch(Q); const A=ST.A, inv=E-A.cash, pl=E-A.start, FQ=fundQuotes(Q);
  const stat=(id, k, v, sub, c)=>`<section class="bd-t bd-stat" aria-labelledby="pf-${id}"><div class="bd-th"><h2 id="pf-${id}">${esc(T(k))}</h2></div><div class="bd-big mono ${c||''}">${v}</div>${sub ? `<p class="bd-sub mono">${esc(sub)}</p>` : ''}</section>`;
  setHTML($('#pf-top'), stat('tv', 'Total value', money(E), CLUB.fund ? L2(`updated ${fundAgo()}`, `${fundAgo()} güncellendi`) : '') + stat('pl', 'Total profit/loss', money(pl), pct(E/A.start-1), cls(pl)) + stat('cash', 'Cash', money(A.cash)) + stat('inv', 'Invested', money(inv)));
  const ps=Object.keys(A.pos).sort((a,b)=>{ const v=s=>{ const q=FQ[s], p=A.pos[s]; return Math.abs(p.q*(q ? q.last : p.avg)); }; return v(b)-v(a); });
  txt('pf-hint', ps.length ? L2('Select a holding for its company, news, chart and our trades.','Şirketi, haberleri, grafiği ve işlemlerimiz için bir varlığa dokun.') : '');
  setHTML($('#pf-pos'), ps.length ? `<table class="tbl pf-tbl"><thead><tr><th>${esc(L2('Asset','Varlık'))}</th><th class="r pf-q">${esc(T('Qty'))}</th><th class="r pf-px">${esc(T('Price'))}</th><th class="r">${esc(T('Value'))}</th><th class="r">${esc(T('Profit/loss'))}</th></tr></thead><tbody>${ps.map(s=>{ const p=A.pos[s], q=FQ[s], last=q ? q.last : p.avg, k=p.kind==='stock' ? 'stock' : 'crypto', d=IM[s], nm=d && d.name && d.name!==s ? d.name : s, r=(last/p.avg-1)*(p.q<0 ? -1 : 1);
      return `<tr data-dw="${esc(s)}"${DW.sym===s && DW.open ? ' class="on"' : ''}><td><button type="button" class="pf-open" data-dw="${esc(s)}" aria-haspopup="dialog"><b>${esc(nm)}</b><span>${esc(s)}${p.q<0 ? ' · '+esc(L2('short','açık')) : ''}</span></button></td><td class="r mono pf-q">${esc(fq(p.q, k))}</td><td class="r mono pf-px">$${fpx(last)}</td><td class="r mono">${money(p.q*last)}</td><td class="r mono pl ${cls(r)}" title="${esc(money(p.q*(last-p.avg)))}">${pct(r)}</td></tr>`; }).join('')}</tbody></table>` : `<p class="empty" style="padding:0 26px">${esc(T('The fund holds nothing yet: all cash.'))}</p>`);
  setHTML($('#pf-ord'), clubOrdersTable(A.orders));
  setHTML($('#pf-fills'), clubTradesTable((A.fills||[]).slice(-200))); }
function renderSettings(){ renderSettingsExtra(); setHTML($('#set-club'), clubSettingsHTML()); setHTML($('#set-mk'), `<span class="st-${stCls(mktStatus())}">${esc(T(mktStatus()))}</span> · ${esc(T('Source: TradingView screener'))}${MKT.list.length ? ' · '+esc(T(`${F0.format(MKT.list.length)} listings`)) : ''}`); setHTML($('#set-cx'), `<span class="st-${stCls(cxStatus())}">${esc(T(cxStatus()))}</span> · ${esc(T('Source: '+(LIVE.src==='coinbase'?'Coinbase':'Binance public market data')))}`);
  if (!usKeys().apId && !US.src){ setHTML($('#set-us'), ''); return; }
  setHTML($('#set-us'), `<span class="st-${stCls(usStatus())}">${esc(T(usStatus()))}</span>${US.src ? ' · '+esc(T('Source: '+(US.src==='alpaca'?'Alpaca (IEX)':'Finnhub'))) : ''}${US.err && US.status!=='live' && US.status!=='closed' ? ' · <span class="muted">'+esc(US.err)+'</span>' : ''}`); }
/* ---- static text, language and theme ---- */
function applyLang(){ document.documentElement.lang=ST.lang; const b=$('#lv-lang'); b.textContent = ST.lang==='tr' ? 'EN' : 'TR'; b.setAttribute('aria-label', ST.lang==='tr' ? 'English' : 'Türkçe');
  for (const el of $$('[data-i18n]')) el.textContent=T(el.dataset.i18n); for (const el of $$('[data-i18n-label]')) el.setAttribute('aria-label', T(el.dataset.i18nLabel)); $('#bd').__lang=null; render(); }
function applyTheme(){ document.documentElement.dataset.tdxTheme=ST.theme; const b=$('#lv-theme'); if (!b) return; const lt=ST.theme==='light';
  b.classList.add('th-sw'); b.setAttribute('aria-label', L2(lt ? 'Switch to the dark theme' : 'Switch to the light theme', lt ? 'Koyu temaya geç' : 'Açık temaya geç'));
  b.innerHTML=`<span class="th-i${lt ? '' : ' on'}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></span><span class="th-i${lt ? ' on' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></span>`;
  const m=document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', lt ? '#f5f5f7' : '#000000'); }
function markI18n(){ // remember the English text of the static labels so they can switch language
  const sel='.lv-nav a span, .pn h2, .lv-h1, h1.sr, .seg button, #set-save, #set-del, .set .bd-sub, details summary, .fld > span:first-child, #foot, .pn h3, #al-go, .pn > p > a.bd-more, .bd-th > a.bd-more';
  for (const el of $$(sel)) if (!el.dataset.i18n && el.children.length===0) el.dataset.i18n=el.textContent.trim();
  for (const el of $$('[aria-label]')) if (el.closest('main, .lv-nav') && !el.dataset.i18nLabel && /^[A-Z]/.test(el.getAttribute('aria-label'))) el.dataset.i18nLabel=el.getAttribute('aria-label');
  for (const el of $$('.fld')){ const n=el.firstChild; if (n && n.nodeType===3 && n.textContent.trim()){ const s=document.createElement('span'); s.textContent=n.textContent.trim(); s.dataset.i18n=s.textContent; el.replaceChild(s, n); } } }
/* ---- events ---- */
function selectSym(sym){ if (!IM[sym]) return; if (typeof cmClose==='function') cmClose(); ST.sel=sym; ST.tmsg=''; if (MKT.all[sym]) mktDetail(sym).catch(()=>{}); if (IM[sym].kind==='crypto'){ liveFocus(sym); cxDaily(sym); } else if (US.src) usIntra(sym).catch(()=>{}); save(); render(); }
// the order on the ticket, as the club's job reads it (prices are never sent: the job fetches its own)
function tkOrder(){ const d=IM[ST.sel], amt=+$('#tk-amt').value, o={ sym:ST.sel, kind:d.kind, side:ST.side, type:ST.type }; if (ST.unit==='usd') o.usd=amt; else o.q=amt; if (ST.type!=='mkt') o.px=+$('#tk-px').value;
  const n=($('#tk-note').value||'').replace(/\s+/g, ' ').trim().slice(0, 280); if (n) o.note=n; return o; }
async function sendOrder(o, where, key){ const pre=o.cancel ? null : clubPrecheck(o); if (pre){ ST.tmsg=pre; render(); return; }
  const r=await clubSend(o, where, key); ST.tmsg=r.msg; if (r.ok && where==='t' && !o.cancel) $('#tk-note').value=''; if (r.ok) toast(r.msg); render(); }
document.addEventListener('click', e=>{ const t=e.target;
  const s=t.closest('[data-sym]'); if (s){ if (s.hasAttribute('data-clear')){ ST.find=''; const f=$('#tr-find'); if (f) f.value=''; } selectSym(s.dataset.sym); if (s.closest('#b-map')) location.hash='#trade'; return; }
  const g=t.closest('[data-go]'); if (g){ selectSym(g.dataset.go); return; }
  const br=t.closest('[data-brange]'); if (br){ ST.brange=br.dataset.brange; save(); render(); return; }
  const sd=t.closest('[data-side]'); if (sd){ ST.side=sd.dataset.side; ST.tmsg=''; const held=brkHeld(ST.A, ST.sel);
    if (ST.side==='cover' && held<0){ ST.unit='qty'; $('#tk-amt').value=String(+(-held).toFixed(6)); } render(); return; }
  const ty=t.closest('[data-type]'); if (ty){ ST.type=ty.dataset.type; ST.tmsg=''; const q=quote(ST.sel), up=ST.side==='buy' || ST.side==='cover'; if (ST.type!=='mkt' && q){ const k=ST.type==='lmt' ? (up ? .99 : 1.01) : (up ? 1.05 : .95); $('#tk-px').value=String(+(q.last*k).toFixed(pxd(q.last))); } render(); return; }
  const un=t.closest('[data-unit]'); if (un){ ST.unit=un.dataset.unit; render(); return; }
  if (t.closest('#tk-go')){ sendOrder(tkOrder(), 't', 't'); return; }
  const cn=t.closest('[data-cancel]'); if (cn){ const id=+cn.dataset.cancel; if (id>0){ cn.disabled=true; sendOrder({ cancel:id }, 't', 'c'+id); } return; }
  if (t.closest('[data-ojx]')){ ST.oj=null; render(); return; }
  if (t.closest('#set-save')){ usSaveKeys({ apId:$('#set-ap-id').value, apSecret:$('#set-ap-sec').value, fh:$('#set-fh').value }); $('#set-ap-sec').value=''; $('#set-fh').value=''; txt('set-msg', T('Keys saved. Connecting…'));
    usStart().then(src=>{ txt('set-msg', T(src==='alpaca' ? 'Connected to Alpaca.' : src==='finnhub' ? 'Connected to Finnhub (backup).' : US.status==='badkey' ? 'The keys were refused. Check that you copied the paper trading keys.' : 'Could not reach the stock data service.')); render(); }); return; }
  if (t.closest('#set-del')){ usSaveKeys({ apId:'', apSecret:'', fh:'' }); usStop(); $('#set-ap-id').value=''; txt('set-msg', T('Keys removed.')); render(); return; }
  if (t.closest('#lv-lang')){ ST.lang = ST.lang==='tr' ? 'en' : 'tr'; save(); applyLang(); applyTheme(); return; }
  if (t.closest('#lv-theme')){ ST.theme = ST.theme==='light' ? 'dark' : 'light'; save(); applyTheme(); return; }
});
document.addEventListener('change', e=>{ if (e.target.id==='tr-sym') selectSym(e.target.value); if (e.target.id==='mk-sec'){ MKV.sec=e.target.value; MKV.n=50; render(); } });
document.addEventListener('input', e=>{ const id=e.target.id; if (id==='tk-amt' || id==='tk-px'){ ST.tmsg=''; render(); } else if (id==='tr-find'){ ST.find=e.target.value; render(); } else if (id==='mk-q'){ MKV.q=e.target.value; MKV.n=50; render(); } });
document.addEventListener('keydown', e=>{ if (e.target.id!=='tr-find') return; if (e.key==='Enter'){ const h=mktFind(e.target.value, 1)[0]; if (h){ e.preventDefault(); ST.find=''; e.target.value=''; selectSym(h.sym); } } else if (e.key==='Escape'){ ST.find=''; e.target.value=''; render(); } });
addEventListener('hashchange', render); addEventListener('resize', render);
/* ---- start ---- */
function start(){ load(); privApply(); uiApply(); termApply(); wlInit(); markI18n(); applyTheme(); applyLang(); { const k=usKeys(); $('#set-ap-id').value=k.apId; }
  liveOn(()=>onQuote()); usOn(()=>onQuote()); mktOn(()=>onQuote());
  cxOn(()=>render());
  const cxFirst=Promise.race([cxStart(), new Promise(r=>setTimeout(r, 6000))]).catch(()=>{});
  cxFirst.then(()=>{ for (const d of CX.list) MKT_TAKEN.add(d.sym); mktSetWatch(watchList()); return mktStart(); }).then(()=>{ mktSetWatch(watchList()); if (MKT.all[ST.sel]) mktDetail(ST.sel).catch(()=>{}); render(); });
  liveStart().then(()=>{ if (IM[ST.sel] && IM[ST.sel].kind==='crypto') setTimeout(()=>liveFocus(ST.sel), 800); render(); });
  srvLoad().then(()=>{ if ((ST.pend||[]).length) clubPoll(); });
  usStart().then(()=>{ if (IM[ST.sel] && IM[ST.sel].kind==='stock') usIntra(ST.sel).catch(()=>{}); render(); });
  setInterval(render, 30000);
  render(); }

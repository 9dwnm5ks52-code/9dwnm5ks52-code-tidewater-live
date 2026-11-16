/* ---------- Tidewater Live: the interface ---------- */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INST=[...LIVE_CRYPTO.map(d=>({ ...d, kind:'crypto' })), ...LIVE_US.map(d=>({ ...d, kind:'stock' }))];
const IM0=Object.fromEntries(INST.map(d=>[d.sym, d]));
const IM=new Proxy(IM0, { get:(o, k)=>{ if (typeof k!=='string') return undefined; if (o[k]) return o[k]; const cx=LIVE_EXTRA.find(d=>d.sym===k); if (cx) return { ...cx, kind:'crypto' }; if (MKT.all[k]) return MKT.all[k];
  const held=ST && (ST.A.pos[k] || ST.A.orders.find(x=>x.sym===k && x.status==='open')); if (held) return { sym:k, tk:k, name:k, kind:held.kind||'stock' }; return undefined; } });
const KEY='tdl-state';
const BOTS=[
  { id:'hodl', name:'Buy & Hold', d:'Bought Bitcoin and Ethereum on day one and never sells.' },
  { id:'mom', name:'Daily Momentum', d:'Each day buys the three coins rising fastest.' },
  { id:'dip', name:'Dip Buyer', d:'Each day buys the three coins that fell the most.' },
  { id:'idx', name:'Equal Weight', d:'Spreads its money evenly over every coin, rebalanced each day.' },
];
let ST=null;
function stNew(){ return { v:1, A:brkNew(), bots:BOTS.map(b=>({ id:b.id, A:brkNew(), day:null })), ai:aiNew(), inbox:[], sel:'BTC', lang:'en', theme:'dark', tf:'intra', side:'b', type:'mkt', unit:'usd' }; }
function load(){ try{ const x=JSON.parse(localStorage.getItem(KEY)||'null'); if (x && x.v===1 && x.A){ const s=stNew(); ST=Object.assign(s, x); for (const b of BOTS) if (!ST.bots.find(y=>y.id===b.id)) ST.bots.push({ id:b.id, A:brkNew(), day:null }); if (!Array.isArray(ST.ai)) ST.ai=aiNew(); for (const d of AI_DEFS) if (!ST.ai.find(y=>y.id===d.id)) ST.ai.push(aiBot(d.id)); return; } }catch(e){} ST=stNew();
  try{ if (/^tr\b/i.test(navigator.language||'')) ST.lang='tr'; if (matchMedia('(prefers-color-scheme: light)').matches) ST.theme='light'; }catch(e){} }
// a saved state from before some bots were retired: drop them with their loss limits, peaks and edge flags; money handed to one comes back (manage.js mgOrphans,
// at once if it holds only cash, otherwise as soon as its holdings have live prices). Safe to run any number of times.
function stRetireBots(){ const n0=(ST.ai||[]).length; ST.ai=(ST.ai||[]).filter(aiKeep); let ch=ST.ai.length!==n0;
  for (const k of ['botLim','botPeak','edge']) if (ST[k]) for (const id of Object.keys(ST[k])) if (!ST.ai.some(b=>b.id===id)){ delete ST[k][id]; ch=true; }
  if (mgOrphans(quotesAll())) ch=true; if (ch) save(); return ch; }
let saveT=0; function saveNow(){ clearTimeout(saveT); saveT=0; try{ localStorage.setItem(KEY, JSON.stringify(ST, (k, v)=>k==='buf' || k==='rb' ? undefined : k==='ai' && Array.isArray(v) ? v.filter(b=>!b.srv) : v)); }catch(e){} }
function save(){ clearTimeout(saveT); saveT=setTimeout(saveNow, 400); }
addEventListener('pagehide', ()=>{ if (saveT) saveNow(); }); document.addEventListener('visibilitychange', ()=>{ if (document.hidden && saveT) saveNow(); });
/* ---- language ---- */
const TR={ 'Board':'Pano','Trade':'İşlem','Portfolio':'Portföy','Settings':'Ayarlar','Light':'Açık','Dark':'Koyu',
  'Your money':'Paran','Market map':'Piyasa haritası','Quick trade':'Hızlı işlem','Market mood':'Piyasa havası','League: you against the bots':'Lig: botlara karşı sen','Your days':'Günlerin','Inbox':'Gelen kutusu','Data':'Veri',
  'Crypto':'Kripto','US stocks':'ABD hisseleri','Buy':'Al','Sell':'Sat','Market':'Piyasa','Limit':'Limit','Stop':'Stop','Units':'Adet','Minutes':'Dakikalar','Days':'Günler',
  'Order':'Emir','Order book':'Emir defteri','Your position':'Pozisyonun','Open orders':'Açık emirler','Holdings':'Varlıklar','Trade history':'İşlem geçmişi',
  'Start again with $100,000':'$100.000 ile baştan başla','Amount in dollars':'Dolar olarak tutar','Amount in units':'Adet olarak miktar','Limit price':'Limit fiyatı','Stop price':'Stop fiyatı',
  'Crypto prices':'Kripto fiyatları','US stock prices':'ABD hisse fiyatları','About':'Hakkında','Save and connect':'Kaydet ve bağlan','Remove the keys':'Anahtarları sil',
  "Live from Binance's public market data, with Coinbase as a backup. Free, no sign-up.":'Binance’in herkese açık piyasa verisinden canlı, yedek olarak Coinbase. Ücretsiz, kayıt yok.',
  "US stocks: the whole market, about 10,000 stocks, ETFs and ADRs, from TradingView's free screener. Prices are 15 minutes delayed. No sign-up.":'ABD hisseleri: piyasanın tamamı, yaklaşık 10.000 hisse, ETF ve ADR, TradingView’in ücretsiz tarayıcısından. Fiyatlar 15 dakika gecikmeli. Kayıt yok.',
  'Optional: paste the two keys of a free Alpaca account (paper trading is enough) to get real-time prices and daily candles for the 14 big names. They stay in this browser only and are sent only to Alpaca.':'İsteğe bağlı: 14 büyük isim için gerçek zamanlı fiyat ve günlük mum istersen ücretsiz bir Alpaca hesabının (sanal hesap yeterli) iki anahtarını yapıştır. Sadece bu tarayıcıda kalır ve sadece Alpaca’ya gönderilir.',
  'Optional backup: a free Finnhub key':'İsteğe bağlı yedek: ücretsiz bir Finnhub anahtarı',
  "Play money only: nothing here is real trading or financial advice. Prices are real: crypto live from Binance or Coinbase; US stocks 15 minutes delayed from TradingView's screener, or real time from Alpaca's free IEX feed if you add its keys. TradingView's screener is not an official public service, so it may change or stop. Crypto fees: 0.1% a trade. US stocks: no commission.":'Sadece oyun parası: buradaki hiçbir şey gerçek işlem ya da yatırım tavsiyesi değildir. Fiyatlar gerçektir: kripto Binance ya da Coinbase’den canlı; ABD hisseleri TradingView tarayıcısından 15 dakika gecikmeli, anahtarını eklersen Alpaca’nın ücretsiz IEX akışından gerçek zamanlı. TradingView tarayıcısı resmî bir kamu servisi değildir; değişebilir ya da durabilir. Kripto ücreti: işlem başına %0,1. ABD hisseleri: komisyon yok.',
  'old-about':'Sadece oyun parası: buradaki hiçbir şey gerçek işlem ya da yatırım tavsiyesi değildir. Fiyatlar gerçektir: kripto Binance ya da Coinbase’den, ABD hisseleri Alpaca’nın ücretsiz IEX akışından (tek bir borsa, bu yüzden başka fiyatlardan birkaç sent farklı olabilir). Kripto ücreti: işlem başına %0,1. ABD hisseleri: komisyon yok.',
  'Play money only. Not financial advice. Prices: Binance or Coinbase (crypto, live), TradingView screener (US, 15 min delayed), Alpaca IEX (optional).':'Sadece oyun parası. Yatırım tavsiyesi değildir. Fiyatlar: Binance ya da Coinbase (kripto, canlı), TradingView tarayıcısı (ABD, 15 dk gecikmeli), Alpaca IEX (isteğe bağlı).',
  'old-foot':'Sadece oyun parası. Yatırım tavsiyesi değildir. Fiyatlar: Binance ya da Coinbase (kripto), Alpaca IEX (ABD hisseleri).',
  'since you started':'başladığından beri','Cash':'Nakit','Invested':'Yatırımda','positions':'pozisyon','position':'pozisyon',
  'Live':'Canlı','Connecting…':'Bağlanıyor…','Reconnecting…':'Yeniden bağlanıyor…','Offline':'Bağlantı yok','Market closed':'Piyasa kapalı','Needs a free key':'Ücretsiz anahtar gerekli','Key refused':'Anahtar reddedildi','Keys in use elsewhere':'Anahtar başka yerde kullanımda',
  'Add the free Alpaca keys in Settings to trade US stocks.':'ABD hisseleriyle işlem yapmak için Ayarlar’a ücretsiz Alpaca anahtarlarını ekle.','Open Settings →':'Ayarları aç →','Open the trade screen →':'İşlem ekranını aç →',
  'Coins rising':'Yükselen coinler','Stocks rising':'Yükselen hisseler','Average move':'Ortalama hareket','Fear':'Korku','Neutral':'Nötr','Greed':'Açgözlülük','Extreme fear':'Aşırı korku','Extreme greed':'Aşırı açgözlülük',
  'You':'Sen','Bots trade crypto only, with the same rules and fees as you.':'Botlar sadece kriptoda, seninle aynı kurallar ve ücretlerle işlem yapar.',
  'Green: your money grew that day. Red: it shrank.':'Yeşil: o gün paran büyüdü. Kırmızı: küçüldü.','Your first day shows here tomorrow.':'İlk günün yarın burada görünür.',
  'Nothing yet. Your trades and filled orders land here.':'Henüz bir şey yok. İşlemlerin ve dolan emirlerin buraya düşer.',
  'Instrument':'Varlık','Price':'Fiyat','Qty':'Miktar','Avg cost':'Ort. maliyet','Value':'Değer','Profit/loss':'Kâr/zarar','When':'Zaman','Side':'Yön','Fee':'Ücret','Type':'Tür','Cancel':'İptal',
  'No holdings yet. Buy something on the Board or the Trade screen.':'Henüz varlık yok. Pano’dan ya da İşlem ekranından bir şey al.','No trades yet.':'Henüz işlem yok.','No open orders.':'Açık emir yok.','You hold none.':'Sende yok.',
  'Bid':'Alış','Ask':'Satış','Spread':'Makas','24 h high':'24 s en yüksek','24 h low':'24 s en düşük','Day high':'Gün en yüksek','Day low':'Gün en düşük','Prev. close':'Önceki kapanış',
  'Live order book from Binance':'Binance’ten canlı emir defteri','Best bid and ask (IEX)':'En iyi alış ve satış (IEX)','No order book yet.':'Henüz emir defteri yok.',
  'Waiting for prices…':'Fiyatlar bekleniyor…','Total value':'Toplam değer','Total profit/loss':'Toplam kâr/zarar',
  'Source: Binance public market data':'Kaynak: Binance herkese açık piyasa verisi','Source: TradingView screener · performance':'Kaynak: TradingView tarayıcısı · performans',
  'Close':'Kapat','Bot Arena':'Bot Arenası','Desk':'Masa','Strategy Desk':'Strateji Masası','Journal':'Defter','Academy':'Akademi','Welcome':'Tanıtım','Performance report':'Performans raporu','Challenge':'Sınav','Account':'Hesap','Hide amounts':'Tutarları gizle','Trading costs':'İşlem maliyetleri','Used by your paper account, the bots and the Strategy Desk. Check your exchange’s fee page: these are typical Binance rates.':'Kâğıt hesabın, botlar ve Strateji Masası kullanır. Borsanın ücret sayfasını kontrol et: bunlar tipik Binance oranları.','Standard 0.10%':'Standart %0,10','Limit orders + BNB 0.075%':'Limit emir + BNB %0,075','Strategy lab':'Strateji laboratuvarı','Managed by bots':'Botların yönettiği','Hand money to a bot →':'Bir bota para ver →','Watchlist':'İzleme listesi','Alerts':'Alarmlar','Alert when':'Alarm koşulu','Set alert':'Alarm kur','Performance':'Performans','Trailing':'Kayan','Trailing stop':'Kayan stop','Trail (% below the high)':'İz (zirvenin % altında)','Take profit':'Kâr al','Stop-loss':'Zarar kes','Protect this position':'Bu pozisyonu koru','Take profit at':'Kâr al fiyatı','Stop-loss at':'Zarar kes fiyatı','Protect it':'Koru','Take profit above the price and a stop-loss below it, at the same time: whichever trades first cancels the other.':'Fiyatın üstünde kâr al, altında zarar kes, ikisi birden: hangisi önce gerçekleşirse diğerini iptal eder.','A trailing stop protects something you hold, so it sells.':'Kayan stop elindekini korur, bu yüzden satış emridir.','Enter a trail between 0.5% and 50%.':'%0,5 ile %50 arasında bir iz gir.','The take-profit must be above the current price and the stop below it.':'Kâr al şu anki fiyatın üstünde, zarar kes altında olmalı.','Headlines':'Manşetler','All the news →':'Tüm haberler →','Coming reports':'Gelecek bilançolar','News':'Haberler','Markets':'Piyasalar','Your value line fills in over the next minutes.':'Değer çizgin önümüzdeki dakikalarda dolmaya başlar.','The order walked the real order book:':'Emir gerçek emir defterinde ilerledi:','Filled at the real price of the moment.':'O anki gerçek fiyattan doldu.',
  'Keys saved. Connecting…':'Anahtarlar kaydedildi. Bağlanıyor…','Keys removed.':'Anahtarlar silindi.','Connected to Alpaca.':'Alpaca’ya bağlandı.','Connected to Finnhub (backup).':'Finnhub’a bağlandı (yedek).','The keys were refused. Check that you copied the paper trading keys.':'Anahtarlar reddedildi. Sanal hesap anahtarlarını kopyaladığından emin ol.','Could not reach the stock data service.':'Hisse verisi servisine ulaşılamadı.',
  'Start again with $100,000? Your holdings, orders and history will be cleared.':'$100.000 ile baştan başlansın mı? Varlıkların, emirlerin ve geçmişin silinecek.','A fresh start: $100,000 in play money.':'Yeni başlangıç: $100.000 oyun parası.',
  'The US market is closed now; limit orders wait for the open.':'ABD piyasası şu an kapalı; limit emirleri açılışı bekler.','Prices':'Fiyatlar','performance':'performans','minute candles':'dakikalık mumlar','daily candles':'günlük mumlar',
};
const TRP=[ // patterns for messages that carry numbers or names
  [/^Bought (.+) (\S+) at an average of \$(\S+)\.$/, (m)=>`${m[2]} aldın: ${m[1]} adet, ortalama $${m[3]}.`],
  [/^Sold (.+) (\S+) at an average of \$(\S+)\.$/, (m)=>`${m[2]} sattın: ${m[1]} adet, ortalama $${m[3]}.`],
  [/^Filled at once: (bought|sold) (.+) (\S+) at \$(\S+)\.$/, (m)=>`Hemen doldu: ${m[3]} ${m[1]==='bought'?'alındı':'satıldı'}, ${m[2]} adet, $${m[4]}.`],
  [/^Limit order placed: (buy|sell) (.+) (\S+) at \$(\S+)\.$/, (m)=>`Limit emri verildi: ${m[2]} ${m[3]} ${m[1]==='buy'?'al':'sat'}, fiyat $${m[4]}.`],
  [/^Stop placed: (buy|sell) (.+) (\S+) if it trades at \$(\S+)\.$/, (m)=>`Stop verildi: ${m[3]} $${m[4]} fiyatına gelirse ${m[2]} adet ${m[1]==='buy'?'al':'sat'}.`],
  [/^No price yet for (\S+)\.$/, m=>`${m[1]} için henüz fiyat yok.`], [/^Enter an amount above zero\.$/, ()=>'Sıfırdan büyük bir miktar gir.'], [/^Enter a limit price\.$/, ()=>'Bir limit fiyatı gir.'], [/^Enter a stop price\.$/, ()=>'Bir stop fiyatı gir.'],
  [/^A stop-loss must sit below the current price\.$/, ()=>'Zarar kes, şu anki fiyatın altında olmalı.'], [/^A buy stop must sit above the current price\.$/, ()=>'Alış stopu şu anki fiyatın üstünde olmalı.'],
  [/^The smallest order is \$(\S+)\.$/, m=>`En küçük emir $${m[1]}.`], [/^You hold (\S+) (\S+) that is free to sell\. This account does not short\.$/, m=>`Satabileceğin ${m[2]} miktarı: ${m[1]}. Bu hesapta açığa satış yok.`],
  [/^Not enough cash for this order\.$/, ()=>'Bu emir için yeterli nakit yok.'], [/^The US market is closed\. Use a limit order; it fills when the market opens and the price allows\.$/, ()=>'ABD piyasası kapalı. Limit emri ver; piyasa açılınca ve fiyat uygunsa dolar.'],
  [/^Your (limit|stop|trailing stop) order (filled): (bought|sold) (.+) (\S+) at \$(\S+)\.$/, m=>`${m[1]==='limit'?'Limit':m[1]==='stop'?'Stop':'Kayan stop'} emrin doldu: ${m[5]} ${m[3]==='bought'?'alındı':'satıldı'}, ${m[4]} adet, $${m[6]}.`],
  [/^Your stop on (\S+) was cancelled: (not enough held|not enough cash)\.$/, m=>`${m[1]} stopun iptal edildi: ${m[2]==='not enough held'?'yeterli miktar yok':'yeterli nakit yok'}.`],
  [/^Trailing stop placed: sell (.+) (\S+) if it falls (\S+)% from its high\.$/, m=>`Kayan stop verildi: ${m[2]} zirvesinden %${m[3]} düşerse ${m[1]} adet satılacak.`],
  [/^Protection placed on (.+) (\S+): take profit at \$(\S+), stop at \$(\S+)\.$/, m=>`${m[1]} ${m[2]} korumaya alındı: kâr al $${m[3]}, zarar kes $${m[4]}.`],
  [/^Your stop on (\S+) was cancelled: the other side filled\.$/, m=>`${m[1]} için diğer emir doldu; bu emir iptal edildi.`],
  [/^Your bot “(.+)” starts trading (\S+) with \$10,000\.$/, m=>`“${m[1]}” botun $10.000 ile ${m[2]} işlemine başlıyor.`],
  [/^\$(\S+) handed to (.+)\. It now copies the bot’s portfolio\.$/, m=>`$${m[1]} ${m[2]} botuna verildi. Artık botun portföyünü kopyalıyor.`],
  [/^Withdrew \$(\S+) from (.+) \((.+)\)\.$/, m=>`${m[2]} botundan $${m[1]} çekildi (${m[3]}).`],
  [/^(\S+) rose above \$(\S+): now \$(\S+)$/, m=>`${m[1]} $${m[2]} üstüne çıktı: şimdi $${m[3]}`],
  [/^(\S+) fell below \$(\S+): now \$(\S+)$/, m=>`${m[1]} $${m[2]} altına indi: şimdi $${m[3]}`],
  [/^(\S+) is up (\S+) today \(alert at \+(\S+)%\)$/, m=>`${m[1]} bugün ${m[2]} yükseldi (alarm +%${m[3]})`],
  [/^(\S+) is down (\S+) today \(alert at −(\S+)%\)$/, m=>`${m[1]} bugün ${m[2]} düştü (alarm −%${m[3]})`],
  [/^(\S+) reports (.+?), (before the open|after the close|time not set)(?:; expected EPS (.+))?$/, m=>`${m[1]} bilançosu ${m[2]}, ${({ 'before the open':'açılıştan önce', 'after the close':'kapanıştan sonra', 'time not set':'saat belli değil' })[m[3]]}${m[4] ? '; beklenen HBK '+m[4] : ''}`],
  [/^(\d+) of (\d+) days up$/, m=>`${m[2]} günün ${m[1]} tanesi artıda`], [/^You are #(\d+) of (\d+)$/, m=>`${m[2]} katılımcı içinde ${m[1]}. sıradasın`],
  [/^Est\. (\S+) (\S+) for \$(\S+) incl\. fees$/, m=>`Tahmini ${m[1]} ${m[2]}, ücretler dahil $${m[3]}`], [/^Est\. \$(\S+) for (\S+) (\S+) incl\. fees$/, m=>`Tahmini $${m[1]}, ${m[2]} ${m[3]} için, ücretler dahil`],
  [/^(\d+) open order(s?)$/, m=>`${m[1]} açık emir`], [/^Source: (.+)$/, m=>`Kaynak: ${m[1]}`], [/^(.+) · (\d+) positions?$/, m=>`${m[1]} · ${m[2]} pozisyon`],
  [/^Bots trade crypto only, with the same rules and fees as you\.$/, ()=>TR['Bots trade crypto only, with the same rules and fees as you.']],
];
const BOT_TR={ 'Bought Bitcoin and Ethereum on day one and never sells.':'İlk gün Bitcoin ve Ethereum aldı, hiç satmıyor.', 'Each day buys the three coins rising fastest.':'Her gün en hızlı yükselen üç coini alır.', 'Each day buys the three coins that fell the most.':'Her gün en çok düşen üç coini alır.', 'Spreads its money evenly over every coin, rebalanced each day.':'Parasını her coine eşit dağıtır, her gün yeniden dengeler.' };
function T(s){ if (ST.lang!=='tr') return s; if (TR[s]) return TR[s]; if (ST.trMsg && ST.trMsg[s]) return ST.trMsg[s]; if (BOT_TR[s]) return BOT_TR[s]; for (const [re, f] of TRP){ const m=String(s).match(re); if (m) return f(m); } return s; }
/* ---- numbers ---- */
const nf=(d)=>new Intl.NumberFormat('en-US', { minimumFractionDigits:d, maximumFractionDigits:d });
const F0=nf(0), F2=nf(2);
const pxd=v=>!(v>0) ? 2 : v>=1 ? 2 : v>=.01 ? 4 : 6;
const fpx=v=>v>0 ? nf(pxd(v)).format(v) : '—';
const money=v=>ST && ST.priv ? '$•••••' : (v<0?'−$':'$')+F2.format(Math.abs(v));
const pct=v=>{ if (v==null || !isFinite(v)) return '—'; const s=(v>=0?'+':'−'), n=F2.format(Math.abs(v*100)); return ST.lang==='tr' ? s+'%'+n : s+n+'%'; };
const fq=(q, kind)=>{ const d=BRK.DEC[kind||'crypto']; return String(+(+q).toFixed(d)); };
const cls=v=>v>0 ? 'up' : v<0 ? 'down' : '';
/* ---- quotes ---- */
function quote(sym){ const d=IM[sym]; if (!d) return null;
  if (d.kind==='crypto'){ const q=LIVE.q[sym]; return q && q.last>0 ? { kind:'crypto', last:q.last, bid:q.bid, ask:q.ask, book:(LIVE.focus===sym && LIVE.src==='binance') ? q.book : null, open:true, chg:q.open ? q.last/q.open-1 : null, high:q.high, low:q.low, daily:q.daily, intra:q.intra } : null; }
  const q=US.src && US.q[sym]; if (q && q.last>0) return { kind:'stock', last:q.last, bid:q.bid, ask:q.ask, book:null, open:usMarketOpen(), chg:q.chg, high:q.high, low:q.low, prev:q.prev, daily:q.daily, intra:q.intra };
  const m=MKT.all[sym]; return m && m.last>0 ? { kind:'stock', last:m.last, bid:null, ask:null, book:null, open:usMarketOpen(), chg:m.chg, high:m.high, low:m.low, prev:m.prev, daily:m.daily, intra:m.intra, delayed:true } : null; }
// what needs fresh prices: coins, the big names, your holdings, your open orders and the one on screen
function watchList(){ const xs=LIVE_US.map(d=>d.sym).concat(Object.keys(ST.A.pos), ST.A.orders.filter(o=>o.status==='open').map(o=>o.sym), [ST.sel], ['SPY','QQQ','DIA','IWM'], AI_STOCKS, (ST.ai||[]).flatMap(b=>Object.keys(b.meta)), ST.watch||[], (ST.mg||[]).flatMap(m=>Object.keys(m.A.pos))); return [...new Set(xs)]; }
function quotesAll(){ const o={}; for (const d of LIVE_CRYPTO){ const q=quote(d.sym); if (q) o[d.sym]=q; } for (const s of watchList()){ if (o[s]) continue; const q=quote(s); if (q) o[s]=q; } return o; }
/* ---- inbox and toast ---- */
function note(msg, ico){ ST.inbox.push({ t:Date.now(), msg, ico:ico||'•' }); if (ST.inbox.length>60) ST.inbox.shift(); save(); }
let toastT=0; function toast(msg){ const el=$('#toast'); el.textContent=T(msg); el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>{ el.hidden=true; }, 4500); }
/* ---- trading ---- */
function place(o){ const q=quote(o.sym); const r=brkOrder(ST.A, { ...o, kind:IM[o.sym].kind }, q);
  if (r.ok){ note(r.msg, r.fill ? (o.side==='b' ? '🟢' : '🔴') : '🕒'); if (r.fill) ST.oj={ sym:o.sym, side:o.side, f:r.fill, k:Date.now() }; } save(); render(); return r; }
function onFill(f, o){ const kind=o.type==='lmt' ? 'limit' : o.type==='trl' ? 'trailing stop' : 'stop'; const m=`Your ${kind} order filled: ${f.side==='b'?'bought':'sold'} ${fq(f.q, f.kind)} ${f.sym} at $${fpx(f.px).replace(/,/g,'')}.`; note(m, '⚡'); toast(m); }
let lastTick=0;
function onQuote(){ const now=Date.now(); if (now-lastTick<300){ render(); return; } lastTick=now; const Q=quotesAll();
  const before=ST.A.orders.filter(o=>o.status==='open').map(o=>o.id), fills=brkTick(ST.A, Q, now);
  for (const f of fills){ const o=ST.A.orders.find(x=>x.id===f.oid); if (o) onFill(f, o); }
  for (const id of before){ const o=ST.A.orders.find(x=>x.id===id); if (o && o.status==='cancelled' && o.why && o.why!=='by you' && o.why!=='the other side filled' && !o.noted){ o.noted=1; const m=`Your stop on ${o.sym} was cancelled: ${o.why}.`; note(m, '⚠️'); toast(m); } }
  for (const b of ST.bots) brkTick(b.A, Q, now);
  const ais=aiTick(ST.ai, Q, now); if (ais.length) onBotTrades(ais);
  alCheck(Q);
  if (fills.length) save(); render(); }
/* ---- bots: rival paper accounts that trade crypto on the same real prices ---- */
function botsRun(){ const Q=quotesAll(), coins=LIVE_CRYPTO.map(d=>d.sym).filter(s=>Q[s]); if (coins.length<6) return; const day=Math.floor(Date.now()/864e5);
  for (const b of ST.bots){ if (b.day===day) continue; const A=b.A, sellAll=()=>{ for (const s of Object.keys(A.pos)) if (Q[s]) brkOrder(A, { sym:s, kind:'crypto', side:'s', q:A.pos[s].q }, Q[s]); };
    const buyEq=xs=>{ const each=A.cash/xs.length*.995; for (const s of xs) if (each>=BRK.MIN_ORDER) brkOrder(A, { sym:s, kind:'crypto', side:'b', usd:each }, Q[s]); };
    const byChg=coins.slice().sort((a,c)=>(Q[c].chg||0)-(Q[a].chg||0));
    if (b.id==='hodl'){ if (!Object.keys(A.pos).length && A.fills.length===0) buyEq(['BTC','ETH'].filter(s=>Q[s])); }
    else if (b.id==='mom'){ sellAll(); buyEq(byChg.slice(0,3)); }
    else if (b.id==='dip'){ sellAll(); buyEq(byChg.slice(-3)); }
    else if (b.id==='idx'){ sellAll(); buyEq(coins); }
    b.day=day; }
  save(); }
/* ---- small drawings ---- */
function spark(vals){ if (vals.length<2) return `<p class="bd-sub">${esc(T('Your value line fills in over the next minutes.'))}</p>`; const lo=Math.min(...vals), hi=Math.max(...vals), W=300, H=70, X=i=>i*W/(vals.length-1), Y=v=>H-4-(H-8)*(v-lo)/((hi-lo)||1), d=vals.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join('');
  return `<svg class="bd-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="bd-area" d="${d}L${W},${H}L0,${H}Z"/><path class="bd-line" d="${d}"/></svg>`; }
let CHM=null;
function candles(bars, label){ const xs=(bars||[]).slice(-90); if (xs.length<2){ CHM=null; return `<p class="empty">${esc(T('Waiting for prices…'))}</p>`; }
  const lo=Math.min(...xs.map(b=>b.l)), hi=Math.max(...xs.map(b=>b.h)), W=Math.max(300, Math.round(($('#tr-chart')||{}).clientWidth||720)), H=W<560 ? 230 : document.documentElement.classList.contains('term') ? 430 : 300, pad=W<560 ? 58 : 64, n=xs.length, cw=(W-pad-8)/n, X=i=>8+i*cw+cw/2, Y=v=>10+(H-34)*(1-(v-lo)/((hi-lo)||1));
  let g=''; for (let k=0;k<=4;k++){ const v=lo+(hi-lo)*k/4, y=Y(v).toFixed(1); g+=`<line class="gl" x1="8" x2="${W-pad}" y1="${y}" y2="${y}"/><text x="${W-pad+4}" y="${(+y+3).toFixed(1)}">${fpx(v)}</text>`; }
  const c=xs.map((b,i)=>{ const up=b.c>=b.o, x=X(i).toFixed(1), y1=Y(Math.max(b.o,b.c)), y2=Y(Math.min(b.o,b.c)); return `<g class="${up?'cu':'cd'}"><line x1="${x}" x2="${x}" y1="${Y(b.h).toFixed(1)}" y2="${Y(b.l).toFixed(1)}" stroke-width="1"/><rect x="${(X(i)-cw*.35).toFixed(1)}" width="${Math.max(1,cw*.7).toFixed(1)}" y="${y1.toFixed(1)}" height="${Math.max(1,y2-y1).toFixed(1)}" stroke-width="0"/></g>`; }).join('');
  const first=xs[0].o, last=xs[n-1].c; CHM={ lo, hi, W, H, pad };
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label+': '+pct(last/first-1))}">${g}${c}</svg>`; }
function ojHTML(J){ const parts=J.f.parts||[], mx=Math.max(1e-12, ...parts.map(p=>p.q));
  return `<div class="oj"><div class="oj-h"><b>${esc(T(J.side==='b' ? `Bought ${fq(J.f.q, J.f.kind)} ${J.sym} at an average of $${fpx(J.f.px).replace(/,/g,'')}.` : `Sold ${fq(J.f.q, J.f.kind)} ${J.sym} at an average of $${fpx(J.f.px).replace(/,/g,'')}.`))}</b><button class="oj-x" type="button" data-ojx aria-label="${esc(T('Close'))}">×</button></div>
    ${parts.length>1 || (parts[0] && parts[0].book) ? `<p class="bd-sub">${esc(T('The order walked the real order book:'))}</p><ol>${parts.slice(0,8).map(p=>`<li><span>$${fpx(p.px)}</span><span class="bar" aria-hidden="true"><i style="width:${(p.q/mx*100).toFixed(1)}%"></i></span><span>${fq(p.q, J.f.kind)}</span></li>`).join('')}</ol>` : `<p class="bd-sub">${esc(T('Filled at the real price of the moment.'))}</p>`}</div>`; }
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
function view(){ const h=location.hash.slice(1); return ['welcome','board','markets','crypto','bots','desk','journal','learn','report','challenge','news','lab','arena','trade','portfolio','settings'].includes(h) ? h : 'board'; }
function renderNow(){ const v=view(), Q=quotesAll(), A=ST.A, E=totalEq(Q);
  for (const s of $$('.lv-view')) s.hidden = s.id!=='v-'+v;
  for (const a of $$('.lv-nav a')){ if (a.dataset.nav===v) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); }
  txt('lv-nw', money(E)); const pl=E/A.start-1, ple=$('#lv-pl'); ple.className='mono '+cls(pl); txt('lv-pl', pct(pl));
  const cs=cxStatus(), us=usStatus(); setHTML($('#lv-dots'), `<span class="lv-dot ${stCls(cs)}"><i></i>${esc(T('Crypto'))}: ${esc(T(cs))}</span><span class="lv-dot ${stCls(us)}"><i></i>${esc(T('US stocks'))}: ${esc(T(us))}</span>`);
  mktSetWatch(watchList()); if (v==='board') renderBoard(Q, E); else if (v==='markets') renderMarkets(Q); else if (v==='crypto') renderCrypto(Q); else if (v==='bots') renderBots(Q); else if (v==='news') renderNews(Q); else if (v==='lab') renderLab(); else if (v==='arena') renderArena(); else if (v==='desk') renderDesk(); else if (v==='journal') renderJournal(); else if (v==='learn') renderLearn(); else if (v==='welcome') renderWelcome(); else if (v==='report') renderReport(); else if (v==='challenge') renderChallenge(); else if (v==='trade') renderTrade(Q); else if (v==='portfolio') renderPortfolio(Q, E); else renderSettings(); if (typeof uiAfter==='function') uiAfter(v, Q); }
function tile(id, cls, title, inner, dot){ return `<section class="bd-t ${cls}" id="t-${id}" aria-labelledby="t-${id}-h"><div class="bd-th"><span class="bd-dot ${dot||''}" aria-hidden="true"></span><h2 id="t-${id}-h">${esc(T(title))}</h2></div>${inner}</section>`; }
function boardBuild(){ const el=$('#bd'); if (el.__lang===ST.lang) return; el.__lang=ST.lang;
  const H=typeof hmTiles==='function' ? hmTiles() : {};
  el.innerHTML = tile('money','w2','Your money', `<div class="bd-row"><div class="bd-big mono" id="b-eq"></div><div class="mono" id="b-pl"></div></div><p class="bd-sub mono" id="b-cash"></p><div id="b-spark"></div>`)
    + (H.today||'')
    + tile('quick','','Quick trade', `<div><div class="bd-big mono" id="q-px"></div><p class="bd-sub" id="q-nm"></p></div><span class="seg" role="group" aria-label="Amount" id="q-amt">${[100,1000,5000].map(a=>`<button type="button" data-qa="${a}" aria-pressed="false">$${F0.format(a)}</button>`).join('')}</span><div class="bs"><button class="b-buy" type="button" data-q="b">${esc(T('Buy'))}</button><button class="b-sell" type="button" data-q="s">${esc(T('Sell'))}</button></div><p class="msg" id="q-msg" role="status"></p><div id="q-oj"></div>`, 'mk')
    + tile('mood','','Market mood', `<div class="hm-gw"><div id="hm-gauge"></div><div class="bd-big mono" id="m-v"></div></div><p class="bd-sub" id="m-l"></p><div class="gauge" aria-hidden="true"><i id="m-g"></i></div><p class="bd-sub mono" id="m-d"></p>`, 'mk')
    + (H.week||'')
    + tile('map','w2 h2','Market map', `<div id="b-map"></div><a class="bd-more" href="#trade">${esc(T('Open the trade screen →'))}</a>`, 'mk')
    + (H.strat||'')
    + tile('league','w2','League: you against the bots', `<ol class="lg" id="b-lg"></ol><p class="bd-sub" id="b-lg-s"></p>`, 'game')
    + tile('inbox','','Inbox', `<ul class="ib" id="b-ib"></ul>`, 'news')
    + tile('watch','','Watchlist', `<div id="b-wl"></div>`, 'mk')
    + tile('news','w2','Headlines', `<div id="b-news"></div><a class="bd-more" href="#news">${esc(T('All the news →'))}</a>`, 'news')
    + tile('earn','','Coming reports', `<div id="b-earn"></div>`, 'news')
    + tile('cal','','Your days', `<div class="cal" id="b-cal"></div><p class="bd-sub" id="b-cal-s"></p>`)
    + tile('src','w2','Data', `<div id="b-src"></div>`, 'mk'); }
function renderBoard(Q, E){ boardBuild(); const A=ST.A;
  txt('b-eq', money(E)); const pl=E-A.start, ple=$('#b-pl'); ple.className='mono '+cls(pl); txt('b-pl', `${pl>=0?'+':'−'}${money(Math.abs(pl)).replace('−','')} (${pct(E/A.start-1)}) ${T('since you started')}`);
  const inv=E-A.cash, np=Object.keys(A.pos).length; txt('b-cash', T(`${T('Cash')} ${money(A.cash)} · ${T('Invested')} ${money(inv)} · ${np} positions`).replace(/ positions?$/, ' '+T(np===1?'position':'positions')));
  setHTML($('#b-spark'), spark((ST.eqi||[]).filter(x=>Date.now()-x.t<864e5).map(x=>x.v).concat([E])));
  // market map
  const tileBtn=d=>{ const q=Q[d.sym], ch=q ? q.chg : null, t=ch==null ? 0 : Math.max(-1, Math.min(1, ch/(d.kind==='crypto'?.06:.03))), bg=ch==null ? 'var(--surface-3)' : `color-mix(in srgb,${t>=0?'var(--gain)':'var(--loss)'} ${Math.round(14+Math.abs(t)*46)}%,var(--surface-2))`;
    return `<button type="button" data-sym="${d.sym}" aria-pressed="${ST.sel===d.sym}" style="background:${bg}" aria-label="${esc(d.name)} ${q ? '$'+fpx(q.last)+' '+pct(ch) : ''}"><b>${esc(d.sym)}</b><span class="mono">${q ? '$'+fpx(q.last) : '—'}</span><span class="mono">${pct(ch)}</span></button>`; };
  setHTML($('#b-map'), `<p class="hm-sec">${esc(T('Crypto'))}</p><div class="hm">${LIVE_CRYPTO.map(d=>tileBtn({ ...d, kind:'crypto' })).join('')}</div><p class="hm-sec">${esc(T('US stocks'))} · ${esc(T(US.src ? 'real time' : '15 min delayed'))}${MKT.list.length ? ` · <a href="#markets">${esc(T(`All ${F0.format(MKT.list.length)} US stocks and ETFs →`))}</a>` : ''}</p><div class="hm">${LIVE_US.map(d=>tileBtn({ ...d, kind:'stock' })).join('')}</div>`);
  // quick trade
  const d=IM[ST.sel], q=Q[ST.sel]; txt('q-px', q ? '$'+fpx(q.last) : '—'); txt('q-nm', `${d.name} (${d.sym}) · ${q ? pct(q.chg) : ''}`);
  const qa=ST.qa||1000; for (const b of $$('#q-amt [data-qa]')) b.setAttribute('aria-pressed', String(+b.dataset.qa===qa));
  for (const b of $$('#t-quick [data-q]')) b.disabled = !q || (d.kind==='stock' && !q.open);
  txt('q-msg', d.kind==='stock' && q && !q.open ? T('The US market is closed now; limit orders wait for the open.') : ST.qmsg ? T(ST.qmsg) : '');
  setHTML($('#q-oj'), ST.oj && ST.oj.sym===ST.sel && Date.now()-ST.oj.k<120000 ? ojHTML(ST.oj) : '');
  // mood: share of coins and stocks rising, and the average move
  const ch=xs=>xs.map(s=>Q[s] && Q[s].chg).filter(x=>x!=null), cc=ch(LIVE_CRYPTO.map(x=>x.sym)), big=MKT.list.filter(d=>d.type==='stock' && d.cap>=2e9 && d.chg!=null), sc=big.length ? big.map(d=>d.chg) : ch(LIVE_US.map(x=>x.sym)), all=cc.concat(sc);
  if (all.length){ const half=xs=>xs.length ? xs.filter(x=>x>0).length/xs.length : null, hc=half(cc), hs=half(sc), up=hc!=null && hs!=null ? (hc+hs)/2 : (hc!=null ? hc : hs), mean=xs=>xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0, avg=cc.length && sc.length ? (mean(cc)+mean(sc))/2 : mean(all), sc100=Math.round(Math.max(0, Math.min(100, up*70+50+avg*300-35)));
    txt('m-v', String(sc100)); txt('m-l', T(sc100<25?'Extreme fear':sc100<45?'Fear':sc100<56?'Neutral':sc100<76?'Greed':'Extreme greed')); $('#m-g').style.left=sc100+'%';
    txt('m-d', `${T('Coins rising')}: ${cc.filter(x=>x>0).length}/${cc.length}` + (sc.length ? ` · ${T('Stocks rising')}: ${F0.format(sc.filter(x=>x>0).length)}/${F0.format(sc.length)}` : '') + ` · ${T('Average move')} ${pct(avg)}`); }
  // league
  const rows=[{ name:T('You'), r:E/A.start-1, me:true }].concat(ST.bots.map(b=>({ name:BOTS.find(x=>x.id===b.id).name, d:BOTS.find(x=>x.id===b.id).d, r:brkEquity(b.A, Q)/b.A.start-1 })), ST.ai.map(b=>({ name:AI_INFO[b.id].ico+' '+aiName(b.id), d:L2(...AI_INFO[b.id].m), r:brkEquity(b.A, Q)/b.A.start-1 }))).sort((a,b)=>b.r-a.r), mx=Math.max(.001, ...rows.map(x=>Math.abs(x.r)));
  setHTML($('#b-lg'), rows.map((x,i)=>i<8 || x.me ? `<li class="${x.me?'me':''}"${x.d ? ` title="${esc(T(x.d))}"` : ''}><span class="mono">#${i+1}</span><span>${esc(x.name)}</span><span class="bar" aria-hidden="true"><i style="width:${Math.max(2, Math.abs(x.r)/mx*100).toFixed(0)}%;background:${x.me?'var(--accent)':x.r>=0?'var(--gain)':'var(--loss)'}"></i></span><span class="mono ${cls(x.r)}" style="text-align:right">${pct(x.r)}</span></li>` : '').join(''));
  txt('b-lg-s', T(`You are #${rows.findIndex(x=>x.me)+1} of ${rows.length}`)+'. '+T('Bots trade crypto only, with the same rules and fees as you.'));
  // days
  const eq=A.eq, days=eq.slice(1).map((x,i)=>x.v/eq[i].v-1); setHTML($('#b-cal'), days.slice(-45).map(r=>`<i class="${r>5e-4?'g':r<-5e-4?'r':''}" title="${pct(r)}"></i>`).join(''));
  txt('b-cal-s', days.length ? T(`${days.filter(r=>r>5e-4).length} of ${days.length} days up`)+'. '+T('Green: your money grew that day. Red: it shrank.') : T('Your first day shows here tomorrow.'));
  // inbox
  const ib=ST.inbox.slice(-6).reverse(); setHTML($('#b-ib'), ib.length ? ib.map(x=>`<li><span aria-hidden="true">${x.ico}</span><span>${esc(T(x.msg))}<time>${new Date(x.t).toLocaleString(ST.lang==='tr'?'tr-TR':'en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</time></span></li>`).join('') : `<li><span></span><span class="bd-sub">${esc(T('Nothing yet. Your trades and filled orders land here.'))}</span></li>`);
  setHTML($('#b-wl'), wlTile(Q)); setHTML($('#b-news'), newsTile()); setHTML($('#b-earn'), earnTile());
  // sources
  setHTML($('#b-src'), `<p class="bd-sub"><b>${esc(T('Crypto'))}:</b> <span class="st-${stCls(cxStatus())}">${esc(T(cxStatus()))}</span> · ${esc(T('Source: '+(LIVE.src==='coinbase'?'Coinbase':'Binance public market data')))}</p>
    <p class="bd-sub"><b>${esc(T('US stocks'))}:</b> <span class="st-${stCls(mktStatus())}">${esc(T(mktStatus()))}</span> · ${esc(T('Source: TradingView screener'))}${MKT.list.length ? ' · '+esc(T(`${F0.format(MKT.list.length)} listings`)) : ''}</p>
    ${US.src ? `<p class="bd-sub"><b>${esc(T('Real time'))}:</b> <span class="st-${stCls(apStatus())}">${esc(T(apStatus()))}</span> · ${esc(T('Source: '+(US.src==='alpaca'?'Alpaca (IEX)':'Finnhub')))}</p>` : `<p class="bd-sub">${esc(T('Optional: free Alpaca keys make the 14 big names real time, with daily candles.'))} <a class="bd-more" href="#settings">${esc(T('Open Settings →'))}</a></p>`}`); }
function renderTrade(Q){ const sel=$('#tr-sym'), d=IM[ST.sel], q=Q[ST.sel];
  const mine=[...new Set(Object.keys(ST.A.pos).concat([ST.sel]))].filter(s=>!IM0[s] && IM[s]), opt=x=>`<option value="${esc(x.sym)}">${esc(x.sym)} · ${esc(x.name)}</option>`;
  const ok=mine.join()+'|'+ST.lang+'|'+mine.map(s=>IM[s].name).join(); if (sel.__k!==ok){ sel.__k=ok; sel.innerHTML=`<optgroup label="${esc(T('Crypto'))}">${LIVE_CRYPTO.map(opt).join('')}</optgroup><optgroup label="${esc(T('Big US names'))}">${LIVE_US.map(opt).join('')}</optgroup>${mine.length ? `<optgroup label="${esc(T('Your US picks'))}">${mine.map(s=>opt(IM[s])).join('')}</optgroup>` : ''}`; }
  const fq0=ST.find||''; setHTML($('#tr-hits'), fq0 && MKT.list.length ? (()=>{ const hs=mktFind(fq0, 8); return hs.length ? hs.map(h=>`<li><button type="button" data-sym="${esc(h.sym)}" data-clear><b>${esc(h.sym)}</b><span>${esc(h.name)}</span><span class="mono">$${fpx(h.last)} <i class="${cls(h.chg)}">${pct(h.chg)}</i></span></button></li>`).join('') : `<li class="empty">${esc(T('Nothing found.'))}</li>`; })() : '');
  if (sel.value!==ST.sel) sel.value=ST.sel;
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
  else if (typeof chRender==='function') chRender(host, ST.sel);
  else { const bars = q ? (ST.tf==='intra' ? q.intra : q.daily) : [], cur=bars && bars.length ? bars.slice() : []; setHTML(host, candles(cur, d.sym)); }
  // book
  if (d.kind==='crypto' && q && q.book && q.book.asks.length){ const a=q.book.asks.slice(0,8).reverse(), b=q.book.bids.slice(0,8), mx=Math.max(...a.concat(b).map(x=>x[1]));
    const row=(x,c)=>`<tr class="${c}"><td>$${fpx(x[0])}</td><td class="r">${fq(x[1],'crypto')}<span class="dep" style="width:${(x[1]/mx*100).toFixed(0)}%"></span></td></tr>`;
    txt('tr-bk-h', T('Live order book from Binance')); setHTML($('#tr-book'), `<table class="book"><tbody>${a.map(x=>row(x,'ask')).join('')}<tr class="mid"><td colspan="2">${esc(T('Spread'))} $${fpx(q.book.asks[0][0]-q.book.bids[0][0])}</td></tr>${b.map(x=>row(x,'bid')).join('')}</tbody></table>`); }
  else if (q && q.bid && q.ask){ txt('tr-bk-h', T(d.kind==='crypto'?'Order book':'Best bid and ask (IEX)')); setHTML($('#tr-book'), `<table class="book"><tbody><tr class="ask"><td>${esc(T('Ask'))}</td><td class="r">$${fpx(q.ask)}</td></tr><tr class="mid"><td colspan="2">${esc(T('Spread'))} $${fpx(q.ask-q.bid)}</td></tr><tr class="bid"><td>${esc(T('Bid'))}</td><td class="r">$${fpx(q.bid)}</td></tr></tbody></table>`); }
  else { txt('tr-bk-h', T('Order book')); setHTML($('#tr-book'), `<p class="empty">${esc(T(q && q.delayed ? 'No live order book for delayed prices. Orders fill at the delayed price plus a 0.05% spread.' : 'No order book yet.'))}</p>`); }
  // ticket
  for (const b of $$('#tk-side [data-side]')) b.setAttribute('aria-pressed', String(b.dataset.side===ST.side));
  for (const b of $$('#tk-type [data-type]')) b.setAttribute('aria-pressed', String(b.dataset.type===ST.type));
  for (const b of $$('#tk-unit [data-unit]')) b.setAttribute('aria-pressed', String(b.dataset.unit===ST.unit));
  $('#tk-pxw').hidden = ST.type==='mkt' || ST.type==='trl'; $('#tk-trw').hidden = ST.type!=='trl'; txt('tk-px-l', T(ST.type==='stp'?'Stop price':'Limit price')); txt('tk-amt-l', T(ST.unit==='usd'?'Amount in dollars':'Amount in units'));
  const go=$('#tk-go'); txt('tk-go', T(ST.side==='b'?'Buy':'Sell')+' '+d.sym); go.className='go '+(ST.side==='b'?'b-buy':'b-sell'); go.disabled=!q;
  const amt=+$('#tk-amt').value, px=ST.type==='mkt' ? (q ? brkPrice(q, ST.side) : 0) : +$('#tk-px').value, fee=1+BRK.FEES[d.kind];
  txt('tk-est', q && amt>0 && px>0 ? (ST.unit==='usd' ? T(`Est. ${fq(amt/px, d.kind)} ${d.sym} for $${F2.format(amt*(ST.side==='b'?fee:1))} incl. fees`) : T(`Est. $${F2.format(amt*px*(ST.side==='b'?fee:2-fee))} for ${fq(amt, d.kind)} ${d.sym} incl. fees`)) : '');
  if (ST.tmsg!==undefined) txt('tk-msg', T(ST.tmsg||'')); if (!ST.tmsg && d.kind==='stock' && q && !q.open) txt('tk-msg', T('The US market is closed now; limit orders wait for the open.'));
  setHTML($('#tk-oj'), ST.oj && ST.oj.sym===ST.sel && Date.now()-ST.oj.k<120000 ? ojHTML(ST.oj) : '');
  setHTML($('#tr-news'), tradeNews(ST.sel)); renderTradeWatch(ST.sel, q);
  // position and orders
  const p=ST.A.pos[ST.sel], pt=$('#pt'); pt.hidden=!p; if (p && q && pt.__s!==ST.sel){ pt.__s=ST.sel; $('#pt-tp').value=String(+(q.last*1.1).toFixed(pxd(q.last))); $('#pt-sl').value=String(+(q.last*.95).toFixed(pxd(q.last))); txt('pt-msg', ''); } if (!p) pt.__s=null;
  setHTML($('#tr-pos'), p ? `<p class="mono">${fq(p.q, d.kind)} ${d.sym} · ${esc(T('Avg cost'))} $${fpx(p.avg)} · ${esc(T('Value'))} ${q ? money(p.q*q.last) : '—'} · <span class="${cls(q ? q.last-p.avg : 0)}">${q ? money(p.q*(q.last-p.avg))+' ('+pct(q.last/p.avg-1)+')' : ''}</span></p>` : `<p class="empty">${esc(T('You hold none.'))}</p>`);
  const os=ST.A.orders.filter(o=>o.status==='open'); setHTML($('#tr-ord'), os.length ? `<div class="tblw"><table class="tbl"><thead><tr><th>${esc(T('Instrument'))}</th><th>${esc(T('Side'))}</th><th>${esc(T('Type'))}</th><th class="r">${esc(T('Qty'))}</th><th class="r">${esc(T('Price'))}</th><th></th></tr></thead><tbody>${os.map(o=>`<tr><td>${o.sym}</td><td>${esc(T(o.side==='b'?'Buy':'Sell'))}</td><td>${esc(T(o.g ? (o.type==='lmt' ? 'Take profit' : 'Stop-loss') : o.type==='lmt' ? 'Limit' : o.type==='trl' ? 'Trailing stop' : 'Stop'))}${o.type==='trl' ? ` <span class="muted">−${+(o.trail*100).toFixed(2)}%</span>` : ''}</td><td class="r mono">${fq(o.q, o.kind)}</td><td class="r mono">$${fpx(o.px)}</td><td><button class="ghost sm" type="button" data-cancel="${o.id}">${esc(T('Cancel'))}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">${esc(T('No open orders.'))}</p>`); }
function renderPortfolio(Q, E){ renderPerf(Q, E); renderWatch(Q); setHTML($('#pf-mg'), mgTable(Q)); const A=ST.A, inv=E-A.cash, pl=E-A.start;
  setHTML($('#pf-top'), `<section class="bd-t"><div class="bd-th"><h2>${esc(T('Total value'))}</h2></div><div class="bd-big mono">${money(E)}</div></section><section class="bd-t"><div class="bd-th"><h2>${esc(T('Total profit/loss'))}</h2></div><div class="bd-big mono ${cls(pl)}">${money(pl)}</div><p class="bd-sub mono">${pct(E/A.start-1)}</p></section><section class="bd-t"><div class="bd-th"><h2>${esc(T('Cash'))}</h2></div><div class="bd-big mono">${money(A.cash)}</div></section><section class="bd-t"><div class="bd-th"><h2>${esc(T('Invested'))}</h2></div><div class="bd-big mono">${money(inv)}</div></section>`);
  const ps=Object.keys(A.pos); setHTML($('#pf-pos'), ps.length ? `<table class="tbl"><thead><tr><th>${esc(T('Instrument'))}</th><th class="r">${esc(T('Qty'))}</th><th class="r">${esc(T('Avg cost'))}</th><th class="r">${esc(T('Price'))}</th><th class="r">${esc(T('Value'))}</th><th class="r">${esc(T('Profit/loss'))}</th><th></th></tr></thead><tbody>${ps.map(s=>{ const p=A.pos[s], q=Q[s], last=q ? q.last : p.avg; return `<tr><td><b>${s}</b> <span class="muted">${esc(IM[s] ? IM[s].name : '')}</span></td><td class="r mono">${fq(p.q, p.kind)}</td><td class="r mono">$${fpx(p.avg)}</td><td class="r mono">$${fpx(last)}</td><td class="r mono">${money(p.q*last)}</td><td class="r mono ${cls(last-p.avg)}">${money(p.q*(last-p.avg))} (${pct(last/p.avg-1)})</td><td><a class="ghost sm" href="#trade" data-go="${s}">${esc(T('Trade'))}</a></td></tr>`; }).join('')}</tbody></table>` : `<p class="empty">${esc(T('No holdings yet. Buy something on the Board or the Trade screen.'))}</p>`);
  const fs=A.fills.slice(-40).reverse(); setHTML($('#pf-fills'), fs.length ? `<table class="tbl"><thead><tr><th>${esc(T('When'))}</th><th>${esc(T('Instrument'))}</th><th>${esc(T('Side'))}</th><th class="r">${esc(T('Qty'))}</th><th class="r">${esc(T('Price'))}</th><th class="r">${esc(T('Fee'))}</th><th class="r">${esc(T('Profit/loss'))}</th></tr></thead><tbody>${fs.map(f=>`<tr><td>${new Date(f.t).toLocaleString(ST.lang==='tr'?'tr-TR':'en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</td><td>${f.sym}</td><td class="${f.side==='b'?'up':'down'}">${esc(T(f.side==='b'?'Buy':'Sell'))}</td><td class="r mono">${fq(f.q, f.kind)}</td><td class="r mono">$${fpx(f.px)}</td><td class="r mono">${money(f.fee)}</td><td class="r mono ${cls(f.pl)}">${f.pl!=null ? money(f.pl) : ''}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${esc(T('No trades yet.'))}</p>`); }
function renderSettings(){ renderSettingsExtra(); for (const b of $$('#set-fee [data-fee]')) b.setAttribute('aria-checked', String((ST.fee||'taker')===b.dataset.fee)); setHTML($('#set-mk'), `<span class="st-${stCls(mktStatus())}">${esc(T(mktStatus()))}</span> · ${esc(T('Source: TradingView screener'))}${MKT.list.length ? ' · '+esc(T(`${F0.format(MKT.list.length)} listings`)) : ''}`); setHTML($('#set-cx'), `<span class="st-${stCls(cxStatus())}">${esc(T(cxStatus()))}</span> · ${esc(T('Source: '+(LIVE.src==='coinbase'?'Coinbase':'Binance public market data')))}`);
  if (!usKeys().apId && !US.src){ setHTML($('#set-us'), ''); return; }
  setHTML($('#set-us'), `<span class="st-${stCls(usStatus())}">${esc(T(usStatus()))}</span>${US.src ? ' · '+esc(T('Source: '+(US.src==='alpaca'?'Alpaca (IEX)':'Finnhub'))) : ''}${US.err && US.status!=='live' && US.status!=='closed' ? ' · <span class="muted">'+esc(US.err)+'</span>' : ''}`); }
/* ---- static text, language and theme ---- */
function applyLang(){ document.documentElement.lang=ST.lang; const b=$('#lv-lang'); b.textContent = ST.lang==='tr' ? 'EN' : 'TR'; b.setAttribute('aria-label', ST.lang==='tr' ? 'English' : 'Türkçe');
  for (const el of $$('[data-i18n]')) el.textContent=T(el.dataset.i18n); $('#bd').__lang=null; render(); }
function applyTheme(){ document.documentElement.dataset.tdxTheme=ST.theme; const b=$('#lv-theme'); if (!b) return; const lt=ST.theme==='light';
  b.classList.add('th-sw'); b.setAttribute('aria-label', L2(lt ? 'Switch to the dark theme' : 'Switch to the light theme', lt ? 'Koyu temaya geç' : 'Açık temaya geç'));
  b.innerHTML=`<span class="th-i${lt ? '' : ' on'}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></span><span class="th-i${lt ? ' on' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></span>`;
  const m=document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', lt ? '#e9f3ee' : '#050e0a'); }
function markI18n(){ // remember the English text of the static labels so they can switch language
  const sel='.lv-nav a span, .pn h2, .lv-h1, .seg button, #pf-reset, #set-save, #set-del, .set .bd-sub, details summary, .fld > span:first-child, #foot, .pn h3, #pt .bd-sub, #pt-go, #al-go, .pn > p > a.bd-more';
  for (const el of $$(sel)) if (!el.dataset.i18n && el.children.length===0) el.dataset.i18n=el.textContent.trim();
  for (const el of $$('.fld')){ const n=el.firstChild; if (n && n.nodeType===3 && n.textContent.trim()){ const s=document.createElement('span'); s.textContent=n.textContent.trim(); s.dataset.i18n=s.textContent; el.replaceChild(s, n); } } }
/* ---- events ---- */
function selectSym(sym){ if (!IM[sym]) return; ST.sel=sym; ST.qmsg=''; ST.tmsg=''; if (MKT.all[sym]) mktDetail(sym).catch(()=>{}); if (IM[sym].kind==='crypto'){ liveFocus(sym); cxDaily(sym); } else if (US.src) usIntra(sym).catch(()=>{}); save(); render(); }
document.addEventListener('click', e=>{ const t=e.target;
  const s=t.closest('[data-sym]'); if (s){ if (s.hasAttribute('data-clear')){ ST.find=''; const f=$('#tr-find'); if (f) f.value=''; } selectSym(s.dataset.sym); return; }
  const g=t.closest('[data-go]'); if (g){ selectSym(g.dataset.go); return; }
  const qa=t.closest('[data-qa]'); if (qa){ ST.qa=+qa.dataset.qa; render(); return; }
  const qb=t.closest('[data-q]'); if (qb){ const side=qb.dataset.q, d=IM[ST.sel], usd=ST.qa||1000; let r;
    if (side==='s'){ const held=brkHeld(ST.A, ST.sel)-brkReserved(ST.A, ST.sel), q=quote(ST.sel), qty0=q ? Math.min(held, usd/brkPrice(q,'s')) : 0, qty=q && (held-qty0)*brkPrice(q,'s')<Math.max(BRK.MIN_ORDER, usd*.01) ? held : qty0; r=place({ sym:ST.sel, side:'s', q:qty>0 ? qty : held }); }
    else r=place({ sym:ST.sel, side:'b', usd }); ST.qmsg=r.msg; if (r.ok && r.fill) toast(r.msg); render(); return; }
  const sd=t.closest('[data-side]'); if (sd){ ST.side=sd.dataset.side; ST.tmsg=''; render(); return; }
  const ty=t.closest('[data-type]'); if (ty){ ST.type=ty.dataset.type; ST.tmsg=''; if (ST.type==='trl') ST.side='s'; const q=quote(ST.sel); if (ST.type!=='mkt' && q){ const k=ST.type==='lmt' ? (ST.side==='b' ? .99 : 1.01) : (ST.side==='s' ? .95 : 1.05); $('#tk-px').value=String(+(q.last*k).toFixed(pxd(q.last))); } render(); return; }
  const un=t.closest('[data-unit]'); if (un){ ST.unit=un.dataset.unit; render(); return; }
  const tf=t.closest('[data-tf]'); if (tf){ ST.tf=tf.dataset.tf; save(); render(); return; }
  if (t.closest('#pt-go')){ const p=ST.A.pos[ST.sel], q=quote(ST.sel); const r=p ? brkOCO(ST.A, { sym:ST.sel, kind:p.kind, q:brkHeld(ST.A, ST.sel)-brkReserved(ST.A, ST.sel), tp:+$('#pt-tp').value, sl:+$('#pt-sl').value }, q) : { ok:false, msg:'You hold none.' };
    txt('pt-msg', T(r.msg)); if (r.ok){ note(r.msg, '🛡️'); toast(r.msg); save(); } render(); return; }
  if (t.closest('#tk-go')){ const amt=+$('#tk-amt').value, o={ sym:ST.sel, side:ST.side, type:ST.type, px:ST.type==='mkt' || ST.type==='trl' ? null : +$('#tk-px').value, trail:ST.type==='trl' ? +$('#tk-tr').value/100 : null }; if (ST.unit==='usd') o.usd=amt; else o.q=amt; const r=place(o); ST.tmsg=r.msg; if (r.ok) toast(r.msg); render(); return; }
  const cn=t.closest('[data-cancel]'); if (cn){ brkCancel(ST.A, +cn.dataset.cancel); save(); render(); return; }
  if (t.closest('[data-ojx]')){ ST.oj=null; render(); return; }
  if (t.closest('#pf-reset')){ if (confirm(T('Start again with $100,000? Your holdings, orders and history will be cleared.'))){ ST.A=brkNew(); ST.bots=BOTS.map(b=>({ id:b.id, A:brkNew(), day:null })); ST.inbox=[]; ST.oj=null; ST.eqi=[]; ST.mg=[]; note('A fresh start: $100,000 in play money.', '🌱'); botsRun(); save(); render(); } return; }
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
function start(){ load(); acctInit(); stRetireBots(); feeApply(); privApply(); uiApply(); termApply(); if (!location.hash && !ST.welcomed){ ST.welcomed=true; location.hash='#welcome'; } setTimeout(()=>{ try{ wkDigest(); }catch(e){} }, 25000); wlInit(); mgInit(); labInit(); markI18n(); applyTheme(); applyLang(); { const k=usKeys(); $('#set-ap-id').value=k.apId; }
  liveOn(()=>onQuote()); usOn(()=>onQuote()); mktOn(()=>onQuote());
  cxOn(()=>render());
  const cxFirst=Promise.race([cxStart(), new Promise(r=>setTimeout(r, 6000))]).catch(()=>{});
  cxFirst.then(()=>{ for (const d of CX.list) MKT_TAKEN.add(d.sym); mktSetWatch(watchList()); return mktStart(); }).then(()=>{ mktSetWatch(watchList()); if (MKT.all[ST.sel]) mktDetail(ST.sel).catch(()=>{}); render(); });
  liveStart().then(()=>{ if (IM[ST.sel] && IM[ST.sel].kind==='crypto') setTimeout(()=>liveFocus(ST.sel), 800); botsRun(); render();
    aiOn(k=>{ if (k==='step' && typeof edgeWatch==='function') edgeWatch(); render(); }); aiStart(()=>ST.ai.filter(b=>!b.srv), s=>quote(s), acts=>onBotTrades(acts)); srvLoad(); });
  usStart().then(()=>{ if (IM[ST.sel] && IM[ST.sel].kind==='stock') usIntra(ST.sel).catch(()=>{}); render(); });
  setInterval(()=>{ const Q=quotesAll(); if (Object.keys(Q).length){ const MA=(ST.accts && ST.accts.main) || ST.A; brkMark(MA, Q); if (ST.accts && ST.accts.ch) brkMark(ST.accts.ch, Q); mgSync(Q, Date.now()); const TE=totalEq(Q); MA.eq[MA.eq.length-1].v=TE; ST.eqi=(ST.eqi||[]).concat([{ t:Date.now(), v:TE }]).slice(-2880); perfSample(); for (const b of ST.bots) brkMark(b.A, Q); aiMarkAll(ST.ai, Q, Date.now()); botsRun(); save(); } render(); }, 30000);
  render(); }

// a bot bought or sold: save, and tell the user in a toast
function onBotTrades(acts){ if ((ST.mg||[]).length) mgSync(quotesAll(), Date.now()); save(); const a=acts[acts.length-1]; toast(L2(`${aiName(a.bot)} ${{ b:'bought', s:'sold', ss:'sold short', bc:'bought back' }[a.act]} ${a.sym}`, `${aiName(a.bot)} ${a.sym} ${{ b:'aldı', s:'sattı', ss:'açığa sattı', bc:'geri aldı' }[a.act]}`)); render(); }

// trading costs: standard taker fee, or limit orders with the BNB discount
function feeApply(){ BRK.FEES.crypto = ST.fee==='maker' ? .00075 : .001; }
document.addEventListener('click', e=>{ const b=e.target.closest('#set-fee [data-fee]'); if (!b) return; ST.fee=b.dataset.fee; feeApply(); for (const x of $$('#set-fee [data-fee]')) x.setAttribute('aria-checked', String(x===b)); save(); render(); });

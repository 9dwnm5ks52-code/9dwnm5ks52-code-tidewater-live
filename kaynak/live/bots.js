/* ---------- Tidewater Live: the Bots screen (the bots that trade by themselves) ---------- */
const BOTV={ f:'all', open:{} };
const MK_BOTH=['Crypto + US stocks','Kripto + ABD hisseleri'], MK_US=['US stocks','ABD hisseleri'];
const AI_INFO={
  knn:{ ico:'🧭', mk:MK_BOTH, m:['Pattern memory (k-nearest neighbours)','Örüntü hafızası (k-en yakın komşu)'],
    d:['Keeps a memory of 2,000 past situations and what happened 15 minutes later. For the current candle it finds the 50 most alike and goes with their vote. New cases keep coming in and the oldest drop out, so it adapts.',
       'Geçmiş 2.000 durumu ve 15 dakika sonra ne olduğunu hafızasında tutar. Şu anki mum için en çok benzeyen 50 durumu bulur ve onların oyuna göre hareket eder. Yeni durumlar girdikçe en eskiler çıkar, böylece uyum sağlar.'] },
  nb:{ ico:'🎲', mk:MK_BOTH, m:['Naive Bayes','Naive Bayes'],
    d:['Learns how each of the 8 signals is spread before a rise and before a fall, then weighs the current signals with Bayes’ rule. Every new candle updates its picture.',
       '8 sinyalin her birinin yükselişlerden ve düşüşlerden önce nasıl dağıldığını öğrenir, sonra şu anki sinyalleri Bayes kuralıyla tartar. Her yeni mum resmi günceller.'] },
  forest:{ ico:'🌳', mk:MK_BOTH, m:['Random forest','Rastgele orman'],
    d:['15 small decision trees, each grown on a random share of the recent examples and signals; they vote. The whole forest is regrown every 150 new examples, so it follows the market as it changes.',
       'Her biri son örneklerin ve sinyallerin rastgele bir kısmıyla büyüyen 15 küçük karar ağacı; oy verirler. Orman her 150 yeni örnekte yeniden büyütülür, böylece piyasa değiştikçe onu izler.'] },
  q:{ ico:'🎮', mk:MK_BOTH, m:['Reinforcement learning (Q-learning)','Pekiştirmeli öğrenme (Q-öğrenme)'],
    d:['Makes no forecast at all. It learns from rewards: for each of 60 situations (trend, RSI band, last hour, in or out) it learns how much staying or switching has paid after fees, and takes the better choice.',
       'Hiç tahmin yapmaz; ödüllerden öğrenir. 60 durumun (trend, RSI bandı, son bir saat, içeride ya da dışarıda) her biri için, ücretlerden sonra kalmanın mı değiştirmenin mi kazandırdığını öğrenir ve iyi olanı seçer.'] },
  rank:{ ico:'📊', mk:MK_US, m:['Cross-sectional learning','Kesitsel öğrenme'],
    d:['Every 5 minutes it looks at about 800 big US companies at once and learns which signals (momentum, RSI, distance from the 50- and 200-day averages, volume, volatility, beta) predict which stocks beat the others next. Holds its top 5 and checks every 30 minutes.',
       'Her 5 dakikada yaklaşık 800 büyük ABD şirketine birden bakar ve hangi sinyallerin (momentum, RSI, 50 ve 200 günlük ortalamalara uzaklık, hacim, oynaklık, beta) sonra hangi hisselerin diğerlerini geçeceğini gösterdiğini öğrenir. İlk 5’ini tutar, her 30 dakikada bakar.'] },
  sector:{ ico:'🏭', mk:MK_US, m:['Sector rotation','Sektör rotasyonu'],
    d:['Groups the big companies by sector, learns which sector signals point to the next leaders, and holds the ETFs of the top 3 sectors. Rebalances every 30 minutes while the market is open.',
       'Büyük şirketleri sektörlere ayırır, hangi sektör sinyallerinin sonraki liderleri gösterdiğini öğrenir ve ilk 3 sektörün ETF’lerini tutar. Piyasa açıkken her 30 dakikada yeniden dengeler.'] },
};
function aiName(id){ return (AI_DEFS.find(d=>d.id===id)||{}).name||id; }
// the built-in bots (your own strategy bots are added to AI_DEFS too, but are not counted here)
const aiRoster = () => AI_DEFS.filter(d=>d.kind!=='custom');
// what a bot is thinking, in words
function aiText(code, v){ v=v||{}; const p=v.p!=null ? p0(v.p) : '', pd=v.pd!=null ? p0(v.pd) : '', lst=a=>(a||[]).join(', ');
  const S={
    warm:['Gathering candles…','Mum topluyor…'], learning:['Still learning…','Hâlâ öğreniyor…'], gathering:[`Gathering candles (${v.n||0}/61)`,`Mum topluyor (${v.n||0}/61)`],
    ml_wait:[`${p} chance up: not sure enough`,`Yükseliş ihtimali ${p}: yeterince emin değil`], ml_up:[`Bought: ${p} sure it rises`,`Aldı: yükselişten ${p} emin`],
    ml_hold:[`Holding: ${p} chance up`,`Tutuyor: yükseliş ihtimali ${p}`], ml_down:[`Sold: only ${p} chance up`,`Sattı: yükseliş ihtimali sadece ${p}`],
    take_profit:['Sold: took its profit','Sattı: kârını aldı'], stop:['Sold: stop-loss','Sattı: zarar kes'], stop_hit:[`Sold: the price fell through its stop ($${fpx(v.stop)})`,`Sattı: fiyat stopun altına indi ($${fpx(v.stop)})`],
    full:['Wanted to buy, but already holds 3','Almak istedi ama zaten 3 tane tutuyor'], no_cash:['Wanted to buy, but has no cash left','Almak istedi ama nakdi kalmadı'], refused:['The order was refused','Emir reddedildi'],
    q_wait:['Learned that staying out pays more here','Burada dışarıda kalmanın daha iyi olduğunu öğrendi'], q_hold:['Learned that staying in pays here','Burada içeride kalmanın kazandırdığını öğrendi'],
    q_buy:['Bought: being in has paid in this situation','Aldı: bu durumda içeride olmak kazandırmış'], q_sell:['Sold: being out has paid in this situation','Sattı: bu durumda dışarıda olmak kazandırmış'],
    mkt_closed:['US market closed; learning goes on','ABD piyasası kapalı; öğrenme sürüyor'], stk_learning:['Waiting for its second snapshot','İkinci anlık görüntüsünü bekliyor'], stk_hold:['Holding until the next check','Sonraki kontrole kadar tutuyor'],
    rank_pick:[`Top picks now: ${lst(v.top)}`,`Şu anki ilk seçimleri: ${lst(v.top)}`], sector_pick:[`Leading sectors: ${(v.secs||[]).map(secT).join(', ')}`,`Önde giden sektörler: ${(v.secs||[]).map(secT).join(', ')}`],
    rank_buy:[`Bought: #${v.rank} in its ranking`,`Aldı: sıralamasında #${v.rank}`], rank_out:[`Sold: fell to #${v.rank}`,`Sattı: #${v.rank} sıraya düştü`],
    my_buy:['Bought: your entry rules all held','Aldı: giriş kuralların sağlandı'], my_wait:['Waiting for your entry rules','Giriş kurallarını bekliyor'], my_hold:['Holding by your rules','Kurallarına göre tutuyor'],
    my_stop:['Sold: your stop-loss','Sattı: zarar kesin'], my_take:['Sold: your take-profit','Sattı: kâr alın'], my_rsi:['Sold: your RSI exit','Sattı: RSI çıkışın'], my_cross:['Sold: the trend turned','Sattı: trend döndü'], my_time:['Sold: your time limit','Sattı: süre sınırın'],
    loading_h:['Loading hourly candles and futures data…','Saatlik mumlar ve vadeli piyasa verisi yükleniyor…'],
    tf_crypto:['Works on hourly crypto candles; US stocks are left to the stock bots','Saatlik kripto mumlarında çalışır; ABD hisseleri hisse botlarına bırakıldı'],
    rule_noedge:[`Signal seen, but its own record shows no edge yet: watching (${v.n||0} signals)`,`Sinyal var ama kendi kaydı henüz avantaj göstermiyor: izliyor (${v.n||0} sinyal)`],
    ml_short:[`Sold short: ${pd} sure it falls`,`Açığa sattı: düşüşten ${pd} emin`], ml_hold_short:[`Short: ${pd} chance down`,`Açıkta: düşüş ihtimali ${pd}`],
    ml_cover:[`Bought back: only ${pd} chance down`,`Geri aldı: düşüş ihtimali sadece ${pd}`], short_stop:[`Bought back: the price rose to its stop`,`Geri aldı: fiyat stopa yükseldi`],
    short_tp:['Bought back: the fall reached its target','Geri aldı: düşüş hedefe ulaştı'], short_time:['Bought back: two hours without the fall','Geri aldı: iki saattir düşüş yok'],
    ml_time:['Sold: the hour passed without the move','Sattı: hareket olmadan saat doldu'], ml_noedge:['No proven edge yet: watching and learning','Henüz kanıtlanmış avantaj yok: izliyor ve öğreniyor'],
    heat_full:['Wanted to buy, but its total risk is at the 6% cap','Almak istedi ama toplam riski %6 sınırında'], regime_block:[`Not buying: the market is ${v.reg ? L2(...REG_L[v.reg]).toLowerCase() : ''}`,`Almıyor: piyasa ${v.reg ? L2(...REG_L[v.reg]).toLowerCase() : ''}`],
    cooldown:['Waiting an hour after its last exit','Son çıkışından sonra bir saat bekliyor'], breaker:['Paused after a bad run (circuit breaker)','Kötü bir serinin ardından durdu (devre kesici)'], 
    sector_buy:[`Bought: ${v.sec ? secT(v.sec) : ''} leads`,`Aldı: ${v.sec ? secT(v.sec) : ''} önde`], sector_out:['Sold: its sector left the top 3','Sattı: sektörü ilk 3’ten çıktı'] }[code] || [code, code];
  return L2(S[0], S[1]); }
function aiStats(bot, Q){ const E=brkEquity(bot.A, Q), sells=bot.log.filter(x=>x.act==='s' || x.act==='bc'), wins=sells.filter(x=>(x.pl||0)>0), best=sells.reduce((m,x)=>x.ret!=null && (m==null || x.ret>m) ? x.ret : m, null);
  return { E, r:E/bot.A.start-1, n:sells.length, wins:wins.length, best }; }
// what each bot has learned, in two or three numbers
function aiRuleRec(bot){ const T=bot.tune; if (!T || !T.rule) return null; const one=(ok, n, net)=>ok ? L2(`proven (${n} signals, ${pct(net)} each after costs)`,`kanıtlandı (${n} sinyal, maliyet sonrası her biri ${pct(net)})`) : n<25 ? L2(`collecting signals (${n}/25)`,`sinyal topluyor (${n}/25)`) : L2(`no edge (${n} signals)`,`avantaj yok (${n} sinyal)`);
  return [L2('Its own record','Kendi kaydı'), L2('buying: ','alış: ')+one(T.okL, T.nL||0, T.netL)]; }
function aiMetrics(bot){ const M=bot.model, out=[], rr=typeof AI_RULE!=='undefined' && AI_RULE.includes(bot.id) && AI_CFG.V>=4 ? aiRuleRec(bot) : null; if (bot.custom) return [[L2('Rules','Kurallar'), L2('yours, on ','senin, ')+bot.custom.sym]]; if (!M) return [[L2('Learns','Öğrenir'), L2('no: fixed rules','hayır: sabit kurallar')]].concat(rr ? [rr] : []); if (rr) out.push(rr);
  { const A=typeof arData==='function' ? arData() : null, vs=A ? Object.keys(A.versions).sort() : [], V=vs.length ? A.versions[vs[vs.length-1]] : null, ab=V && V.bots.find(x=>x.id===bot.id);
    if (ab){ const r=arReady(ab, A); out.push([L2(`Real money (Arena, ${A.days} days)`,`Gerçek para (Arena, ${A.days} gün)`), r.ok ? L2('✓ ready','✓ hazır') : L2(`paper only: ${r.c.filter(x=>!x[0]).map(x=>x[1]).join(', ')}`,`sadece kâğıt: ${r.c.filter(x=>!x[0]).map(x=>x[1]).join(', ')}`)]); } }
  if (AI_PROB.includes(bot.id)){ const a=aiAcc(M); out.push([L2('Guessed right','Doğru tahmin'), a!=null ? p0(a) : '—']); }
  if (AI_PROB.includes(bot.id)) out.push([L2('Learned from','Öğrendiği'), F0.format(M.n)+' '+L2('candles','mum')]);
  if (AI_PROB.includes(bot.id) && bot.tune) out.push([L2('Its own entry threshold','Kendi giriş eşiği'), bot.tune.minP>1 ? L2('off: no proven edge','kapalı: kanıtlanmış avantaj yok') : p0(bot.tune.minP)]);
  if (bot.id==='knn') out.push([L2('Memory','Hafıza'), F0.format(M.mem.length)]);
  if (bot.id==='forest') out.push([L2('Regrown','Yeniden büyüdü'), F0.format(M.grown)+'×']);
  if (bot.id==='q') out.push([L2('Situations learned','Öğrendiği durum'), M.vis.filter(v=>v>0).length+'/60'], [L2('Steps','Adım'), F0.format(M.n)]);
  if (bot.id==='rank'){ const ic=M.ic.slice(-20); out.push([L2('Learned from','Öğrendiği'), F0.format(M.n)+' '+L2('stock moves','hisse hareketi')], [L2('Rank correlation','Sıralama korelasyonu'), ic.length ? F2.format(ic.reduce((a,b)=>a+b,0)/ic.length) : '—']); }
  if (bot.id==='sector'){ const h=M.hits; out.push([L2('Learned from','Öğrendiği'), F0.format(M.n)+' '+L2('sector moves','sektör hareketi')], [L2('Top sector beat the rest','İlk sektör diğerlerini geçti'), h.length>=5 ? p0(h.reduce((a,b)=>a+b,0)/h.length) : '—']); }
  return out; }
function aiThinkRows(bot){ if (bot.custom){ const t=bot.think[bot.custom.sym]; return [[bot.custom.sym, t ? aiText(t.code, t.vals) : '…']]; } if (bot.id==='rank' || bot.id==='sector'){ const t=bot.think.US; return [['US', t ? aiText(t.code, t.vals) : L2('Waits for the US market to open','ABD piyasasının açılmasını bekliyor')]]; }
  return AI_COINS.concat(AI_STOCKS).map(sym=>{ const t=bot.think[sym], n=(AI.bars[sym]||[]).length; if (t) return [sym, aiText(t.code, t.vals)]; if (AI_STOCKS.includes(sym) && n<61) return [sym, aiText('gathering', { n })]; return [sym, '…']; }); }
function botCard(bot, Q){ const I=AI_INFO[bot.id], s=aiStats(bot, Q), held=Object.keys(bot.meta);
  return `<article class="ai-card${bot.on ? '' : ' off'}" id="bot-${bot.id}" aria-labelledby="ai-${bot.id}-h">
    <header><span class="ai-ico" aria-hidden="true">${I.ico}</span><div><h3 id="ai-${bot.id}-h">${esc(aiName(bot.id))}</h3><span class="ai-tag">${esc(L2(...I.m))} · ${esc(L2(...I.mk))}${bot.on ? '' : ' · '+esc(T('paused'))}</span></div></header>
    <div class="bd-row"><div class="bd-big mono">${money(s.E)}</div><span class="mono ${cls(s.r)}">${pct(s.r)}</span></div>
    ${(bot.eqi||[]).length ? spark(bot.eqi.map(x=>x.v).concat([s.E])) : ''}
    <div class="ai-st">${aiMetrics(bot).map(([k,v])=>`<span>${esc(k)} <b class="mono">${esc(v)}</b></span>`).join('')}</div>
    ${(()=>{ const P=botPerf(bot, Q); return `<div class="ai-st"><span>Sharpe <b class="mono">${P.sharpe!=null ? F2.format(P.sharpe) : '—'}</b></span><span>${esc(L2('Max drawdown','Maks. düşüş'))} <b class="mono">${P.dd!=null ? pct(-P.dd) : '—'}</b></span><span>${esc(L2('Profit factor','Kâr faktörü'))} <b class="mono">${P.pf==null ? '—' : P.pf===Infinity ? '∞' : F2.format(P.pf)}</b></span></div>`; })()}
    <div class="ai-st"><span>${esc(T('Trades'))} <b class="mono">${s.n}</b></span><span>${esc(T('Wins'))} <b class="mono">${s.n ? p0(s.wins/s.n) : '—'}</b></span><span>${esc(T('Best'))} <b class="mono ${cls(s.best)}">${s.best!=null ? pct(s.best) : '—'}</b></span></div>
    <p class="ai-h">${esc(T('Holds'))}: ${held.length ? held.map(sym=>{ const q=Q[sym] || quote(sym), m=bot.meta[sym], rr=q && m ? q.last/m.entry-1 : null; return `<span class="chip">${esc(sym)} <i class="${cls(rr)}">${rr!=null ? pct(rr) : ''}</i></span>`; }).join(' ') : esc(T('nothing'))}</p>
    <details class="ai-more" data-bot-d="${bot.id}"${BOTV.open[bot.id] ? ' open' : ''}><summary>${esc(L2('How it works and what it thinks now','Nasıl çalışır ve şu an ne düşünüyor'))}</summary><p class="ai-d">${esc(L2(...I.d))}</p>
      <ul class="ai-think">${aiThinkRows(bot).map(([s, t])=>`<li><b>${esc(s)}</b><span>${esc(t)}</span></li>`).join('')}</ul>${aiDiaryHTML(bot)}</details>
    ${bot.srv ? '' : `<div class="bd-row ai-btn"><button class="ghost sm" type="button" data-ai-on="${bot.id}">${esc(T(bot.on ? 'Pause' : 'Resume'))}</button><button class="ghost sm" type="button" data-ai-reset="${bot.id}">${esc(T('Start again'))}</button></div>`}</article>`; }
function botBoard(Q, n){ return ST.ai.map(b=>({ b, s:aiStats(b, Q) })).sort((x,y)=>y.s.r-x.s.r).slice(0, n||99); }
function renderBots(Q){ const el=$('#bots');
  if (el.__lang!==ST.lang){ el.__lang=ST.lang;
    const nb=aiRoster().length;
    el.innerHTML=`<p class="bd-sub">${esc(L2(`${nb} bots, each with $10,000 of play money, trade by themselves on real prices with the same broker and fees as you. All of them learn and improve as they go, each with a different method; every guess is scored before the bot sees the answer, so the numbers below are honest. They are free: everything runs in this browser, with no paid AI service. They trade only while this page is open, and past results say nothing about the future.`,
      `${nb} bot, her biri $10.000 oyun parasıyla, seninle aynı aracı kurum ve ücretlerle gerçek fiyatlarda kendi başına işlem yapar. Hepsi, her biri farklı bir yöntemle, çalıştıkça öğrenir ve gelişir; her tahmin bot cevabı görmeden önce puanlanır, bu yüzden aşağıdaki sayılar dürüsttür. Ücretsizdirler: her şey bu tarayıcıda çalışır, ücretli bir yapay zekâ servisi yok. Sadece bu sayfa açıkken işlem yaparlar; geçmiş sonuçlar geleceği göstermez.`))}</p>
      <p class="bd-sub srv-note" id="bots-srv"></p><p class="bd-sub" id="bots-note"></p>
      <p class="bd-row" style="justify-content:flex-start;gap:8px"><a class="go lab-go" href="#desk">${esc(L2('📈 Strategy Desk: daily strategies since 2018 →','📈 Strateji Masası: 2018’den beri günlük stratejiler →'))}</a><a class="ghost lab-go" href="#arena">${esc(L2('🏟️ Bot Arena →','🏟️ Bot Arenası →'))}</a><a class="ghost lab-go" href="#lab">${esc(L2('🛠️ Build your own bot →','🛠️ Kendi botunu kur →'))}</a></p>
      <div class="pn"><div class="cx-sh"><h2>${esc(L2('Hand money to a bot','Bir bota para ver'))}</h2></div><p class="bd-sub">${esc(L2('The money leaves your cash and copies the bot’s portfolio in the same proportions; when the bot trades, it follows. Withdraw whenever you like.','Para nakdinden çıkar ve botun portföyünü aynı oranlarda kopyalar; bot işlem yaptıkça o da izler. İstediğin zaman geri çekebilirsin.'))}</p>
        <div class="fld-row mg-row"><label class="fld" for="mg-bot"><span>${esc(T('Bots'))}</span><select id="mg-bot">${AI_DEFS.map(d=>`<option value="${d.id}">${AI_INFO[d.id].ico} ${esc(d.name)}</option>`).join('')}</select></label><label class="fld" for="mg-usd"><span>${esc(T('Amount in dollars'))}</span><input id="mg-usd" type="number" min="100" step="100" value="5000" inputmode="decimal"></label><button class="go" type="button" id="mg-go">${esc(L2('Hand it over','Ver'))}</button></div>
        <p class="msg" id="mg-msg" role="status"></p><div id="bots-mg"></div></div>
      <div class="pn"><div class="cx-sh"><h2>${esc(L2('Leaderboard','Sıralama'))}</h2><span class="bd-sub mono" id="ai-next2"></span></div><div class="tblw" id="bots-lb"></div></div>
      <div class="ai-grid" id="bots-cards"></div>
      <div class="pn"><div class="cx-sh"><h2>${esc(T('What the bots did'))}</h2><label class="sr" for="bots-f">${esc(T('Bots'))}</label><select id="bots-f"></select></div><div class="tblw" id="bots-log"></div></div>`; }
  const nx=aiNext(Date.now())-Date.now(); txt('ai-next2', T(`Next check in ${Math.floor(nx/60000)}:${String(Math.floor(nx/1000)%60).padStart(2,'0')}`));
  txt('bots-srv', srvNote());
  txt('bots-note', US.src==='alpaca' ? L2('US stocks: real-time 5-minute candles from your Alpaca key.','ABD hisseleri: Alpaca anahtarından gerçek zamanlı 5 dakikalık mumlar.')
    : L2('US stocks: the candle bots build 5-minute candles from the delayed prices while the market is open, and need 61 of them (about 5 hours, kept in this browser) before they trade a stock. With the free Alpaca key they get the history at once.',
         'ABD hisseleri: mum botları piyasa açıkken gecikmeli fiyatlardan 5 dakikalık mum oluşturur ve bir hisseyle işlem yapmadan önce 61 tanesine (yaklaşık 5 saat, bu tarayıcıda saklanır) ihtiyaç duyar. Ücretsiz Alpaca anahtarıyla geçmişi hemen alırlar.'));
  setHTML($('#bots-mg'), mgTable(Q));
  const rows=botBoard(Q);
  setHTML($('#bots-lb'), `<table class="tbl"><thead><tr><th class="r">#</th><th>${esc(T('Bots'))}</th><th>${esc(L2('Method','Yöntem'))}</th><th class="r">${esc(T('Value'))}</th><th class="r">${esc(L2('Return','Getiri'))}</th><th class="r">${esc(L2('Sharpe','Sharpe'))}</th><th class="r">${esc(L2('Max drawdown','Maks. düşüş'))}</th><th class="r">${esc(T('Trades'))}</th><th class="r">${esc(T('Wins'))}</th><th>${esc(L2('Learning','Öğrenme'))}</th></tr></thead><tbody>${rows.map(({ b, s },i)=>{ const m=aiMetrics(b)[0];
    return `<tr><td class="r mono">${i+1}</td><td><a href="#bots" data-bot="${b.id}" class="mk-tk">${AI_INFO[b.id].ico} ${esc(aiName(b.id))}</a>${b.on ? '' : ` <span class="muted">${esc(T('paused'))}</span>`}</td><td class="muted">${esc(L2(...AI_INFO[b.id].m))}</td><td class="r mono">${money(s.E)}</td><td class="r mono ${cls(s.r)}">${pct(s.r)}</td>${(()=>{ const P=botPerf(b, Q); return `<td class="r mono">${P.sharpe!=null ? F2.format(P.sharpe) : '—'}</td><td class="r mono ${P.dd>.0005 ? 'down' : ''}">${P.dd!=null ? pct(-P.dd) : '—'}</td>`; })()}<td class="r mono">${s.n}</td><td class="r mono">${s.n ? p0(s.wins/s.n) : '—'}</td><td class="muted">${esc(m[0])} <b class="mono">${esc(m[1])}</b></td></tr>`; }).join('')}</tbody></table>`);
  setHTML($('#bots-cards'), rows.map(({ b })=>botCard(b, Q)).join(''));
  const sel=$('#bots-f'), sk=ST.lang; if (sel.__k!==sk){ sel.__k=sk; sel.innerHTML=`<option value="all">${esc(L2('All bots','Tüm botlar'))}</option>`+AI_DEFS.map(d=>`<option value="${d.id}">${AI_INFO[d.id].ico} ${esc(d.name)}</option>`).join(''); } if (sel.value!==BOTV.f) sel.value=BOTV.f;
  const log=ST.ai.filter(b=>BOTV.f==='all' || b.id===BOTV.f).flatMap(b=>b.log.map(x=>({ ...x, bot:b.id }))).sort((a,b)=>b.t-a.t).slice(0, 50);
  BOTS_LOGV=log; setHTML($('#bots-log'), log.length ? `<table class="tbl ai-log"><thead><tr><th>${esc(T('When'))}</th><th>${esc(T('Bots'))}</th><th>${esc(T('Instrument'))}</th><th>${esc(T('Side'))}</th><th class="r">${esc(T('Price'))}</th><th class="r">${esc(T('Profit/loss'))}</th><th>${esc(T('Why'))}</th></tr></thead><tbody>${log.map((x,i)=>`<tr data-rp="${i}" tabindex="0" title="${esc(L2('Show this trade on a chart','Bu işlemi grafikte göster'))}"><td>${new Date(x.t).toLocaleString(ST.lang==='tr'?'tr-TR':'en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</td><td>${AI_INFO[x.bot].ico} ${esc(aiName(x.bot))}</td><td><b>${esc(x.sym)}</b></td><td class="${x.act==='b' || x.act==='bc' ?'up':'down'}">${esc(x.act==='ss' ? L2('Sell short','Açığa sat') : x.act==='bc' ? L2('Buy back','Geri al') : T(x.act==='b'?'Buy':'Sell'))}</td><td class="r mono">$${fpx(x.px)}</td><td class="r mono ${cls(x.pl)}">${(x.act==='s' || x.act==='bc') && x.pl!=null ? money(x.pl)+' ('+pct(x.ret)+')' : ''}</td><td class="ai-why">${esc(aiText(x.code, x.vals))}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${esc(T('No trades yet. The bots check every 5 minutes.'))}</p>`); }
document.addEventListener('click', e=>{ const t=e.target;
  const on=t.closest('[data-ai-on]'); if (on){ const b=ST.ai.find(x=>x.id===on.dataset.aiOn); if (b){ b.on=!b.on; save(); render(); } return; }
  const rs=t.closest('[data-ai-reset]'); if (rs){ if (confirm(T('Start this bot again with $10,000? Its holdings, history and what it learned will be cleared.'))){ const i=ST.ai.findIndex(x=>x.id===rs.dataset.aiReset); if (i>=0){ const c=ST.ai[i].custom; ST.ai[i]=aiBot(rs.dataset.aiReset); if (c) ST.ai[i].custom=c; save(); render(); } } return; }
  const bl=t.closest('[data-bot]'); if (bl){ e.preventDefault(); if (location.hash!=='#bots') location.hash='#bots'; setTimeout(()=>{ const c=document.getElementById('bot-'+bl.dataset.bot); if (c){ c.scrollIntoView({ block:'start' }); const d=c.querySelector('details'); if (d){ d.open=true; BOTV.open[bl.dataset.bot]=true; } } }, 60); } });
document.addEventListener('toggle', e=>{ const d=e.target; if (d && d.dataset && d.dataset.botD) BOTV.open[d.dataset.botD]=d.open; }, true);
document.addEventListener('change', e=>{ if (e.target.id==='bots-f'){ BOTV.f=e.target.value; render(); } });

// the diary: one line a day; the card shows the last week
function aiDiaryHTML(bot){ const D=(bot.diary||[]).slice(-7); if (D.length<2) return `<p class="bd-sub">${esc(L2('Its diary starts tomorrow: one line a day.','Günlüğü yarın başlıyor: günde bir satır.'))}</p>`;
  const a=D[0], z=D[D.length-1], r=z.v/a.v-1, tr=z.tr-a.tr, dacc=a.acc!=null && z.acc!=null ? z.acc-a.acc : null, day=d=>new Date(d*864e5).toLocaleDateString(ST.lang==='tr'?'tr-TR':'en-US', { day:'numeric', month:'short' });
  const lines=[L2(`This week: ${pct(r)}, ${tr} closed trades.`,`Bu hafta: ${pct(r)}, ${tr} kapanan işlem.`)];
  if (dacc!=null) lines.push(L2(`Guessing right: ${p0(a.acc)} → ${p0(z.acc)}.`,`Doğru tahmin: ${p0(a.acc)} → ${p0(z.acc)}.`));
  if (z.minP!=null && a.minP!==z.minP) lines.push(L2(`It moved its own entry threshold from ${a.minP==null ? '—' : a.minP>1 ? 'off' : p0(a.minP)} to ${z.minP>1 ? 'off' : p0(z.minP)}.`,`Kendi giriş eşiğini ${a.minP==null ? '—' : a.minP>1 ? 'kapalı' : p0(a.minP)} değerinden ${z.minP>1 ? 'kapalı' : p0(z.minP)} değerine taşıdı.`));
  return `<h4 class="ai-h">${esc(L2('Diary','Günlük'))} <span class="muted">${esc(day(a.d))} – ${esc(day(z.d))}</span></h4><ul class="ai-think ai-diary">${lines.map(l=>`<li><span>${esc(l)}</span></li>`).join('')}</ul>`; }

// ---- edge notifications: tell the user when a bot passes (or loses) its proven-edge test
let BOTS_LOGV=[];
function aiEdgeOn(bot){ const T=bot.tune; if (bot.custom) return null;
  if (AI_PROB.includes(bot.id)) return !!(T && (T.minP<=1 || (AI_CFG.SHORT && T.minPs<=1)));
  if (typeof AI_RULE!=='undefined' && AI_RULE.includes(bot.id) && AI_CFG.V>=4) return !!(T && T.rule && (T.okL || T.okS));
  return null; }
function edgeWatch(){ const E=ST.edge||(ST.edge={}); let changed=false;
  for (const b of ST.ai){ const on=aiEdgeOn(b); if (on==null) continue; const prev=E[b.id]; E[b.id]=on; if (prev==null || prev===on) continue; changed=true;
    const msg=on ? `${aiName(b.id)} proved an edge and may trade now` : `${aiName(b.id)} lost its edge and stopped opening trades`; note(msg, on ? '✅' : '⏸'); alNotify(T(msg)); if (typeof ntfySend==='function') ntfySend(T(msg), 'Tidewater'); }
  if (changed) save(); }
TRP.push([/^(.+) proved an edge and may trade now$/, m=>`${m[1]} avantajını kanıtladı, artık işlem açabilir`], [/^(.+) lost its edge and stopped opening trades$/, m=>`${m[1]} avantajını kaybetti, yeni işlem açmayı bıraktı`]);
// ---- trade replay: a chart of the candles around one trade, with where it went in and out
function rpPair(x){ const bot=ST.ai.find(b=>b.id===x.bot); if (!bot) return null; const L=bot.log.filter(e=>e.sym===x.sym).sort((a,b)=>a.t-b.t), k=L.findIndex(e=>e.t===x.t && e.act===x.act); if (k<0) return null;
  const opens=['b','ss'], isOpen=opens.includes(x.act); if (isOpen){ const c=L.slice(k+1).find(e=>!opens.includes(e.act)); return { o:L[k], c:c||null }; }
  const o=L.slice(0, k).reverse().find(e=>opens.includes(e.act)); return { o:o||null, c:L[k] }; }
function rpBars(sym, t0, t1){ const f=AI.bars[sym]||[], h=AI.hb[sym]||[];
  if (f.length && t0-36*3e5>=f[0].t) return { bars:f.filter(b=>b.t>=t0-36*3e5 && b.t<=t1+24*3e5), tf:'5m' };
  return { bars:h.filter(b=>b.t>=t0-24*36e5 && b.t<=t1+12*36e5), tf:'1h' }; }
function rpSVG(bars, P){ const W=Math.min(760, Math.max(300, (window.innerWidth||800)-80)), H=260, lo=Math.min(...bars.map(b=>b.l), ...P.lines.map(l=>l.v)), hi=Math.max(...bars.map(b=>b.h), ...P.lines.map(l=>l.v)),
    X=k=>8+(W-70)*k/Math.max(1, bars.length-1), Y=v=>10+(H-30)*(1-(v-lo)/((hi-lo)||1)), xt=t=>{ let k=bars.findIndex(b=>b.t>=t); if (k<0) k=bars.length-1; return X(k); }, cw=Math.max(1, (W-70)/bars.length*.6);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(P.label)}">${bars.map((b,k)=>{ const up=b.c>=b.o, c=up ? 'var(--gain)' : 'var(--loss)';
      return `<line x1="${X(k).toFixed(1)}" x2="${X(k).toFixed(1)}" y1="${Y(b.h).toFixed(1)}" y2="${Y(b.l).toFixed(1)}" stroke="${c}"/><rect x="${(X(k)-cw/2).toFixed(1)}" y="${Y(Math.max(b.o,b.c)).toFixed(1)}" width="${cw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(b.o)-Y(b.c))).toFixed(1)}" fill="${c}"/>`; }).join('')}
    ${P.lines.map(l=>`<line x1="8" x2="${W-62}" y1="${Y(l.v).toFixed(1)}" y2="${Y(l.v).toFixed(1)}" stroke="${l.c}" stroke-dasharray="4 4"/><text x="${W-58}" y="${(Y(l.v)+4).toFixed(1)}" fill="${l.c}">${esc(l.n)}</text>`).join('')}
    ${P.marks.map(m=>`<circle cx="${xt(m.t).toFixed(1)}" cy="${Y(m.v).toFixed(1)}" r="6" fill="${m.c}" stroke="var(--bg)" stroke-width="2"/><text x="${(xt(m.t)+9).toFixed(1)}" y="${(Y(m.v)-8).toFixed(1)}" fill="${m.c}">${esc(m.n)}</text>`).join('')}</svg>`; }
function rpOpen(i){ const x=BOTS_LOGV[i]; if (!x) return; const pr=rpPair(x); if (!pr || !pr.o){ toast(L2('The start of this trade is no longer in the bot’s log.','Bu işlemin başlangıcı artık botun kaydında yok.')); return; }
  const short=pr.o.act==='ss', t1=pr.c ? pr.c.t : Date.now(), { bars, tf }=rpBars(x.sym, pr.o.t, t1); if (bars.length<5){ toast(L2('No candles for that time here.','Burada o zamana ait mum yok.')); return; }
  const bot=ST.ai.find(b=>b.id===x.bot), m=bot && bot.meta[x.sym], lines=[]; if (!pr.c && m && m.stop>0) lines.push({ v:m.stop, n:'stop', c:'var(--loss)' });
  const marks=[{ t:pr.o.t, v:pr.o.px, n:short ? L2('sold short','açığa sattı') : L2('bought','aldı'), c:'var(--accent)' }]; if (pr.c) marks.push({ t:pr.c.t, v:pr.c.px, n:short ? L2('bought back','geri aldı') : L2('sold','sattı'), c:'var(--warn)' });
  const res=pr.c && pr.c.ret!=null ? pct(pr.c.ret) : L2('still open','hâlâ açık'), d=t=>new Date(t).toLocaleString(ST.lang==='tr'?'tr-TR':'en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  let el=$('#replay'); if (!el){ el=document.createElement('div'); el.id='replay'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); document.body.appendChild(el); }
  setHTML(el, `<div class="rp-card"><div class="bd-th"><h2>${AI_INFO[x.bot].ico} ${esc(aiName(x.bot))} · ${esc(x.sym)} · <span class="mono ${pr.c && pr.c.ret!=null ? cls(pr.c.ret) : ''}">${esc(res)}</span></h2><button type="button" class="rp-x" data-rp-x aria-label="${esc(L2('Close','Kapat'))}">✕</button></div>
    ${rpSVG(bars, { lines, marks, label:`${x.sym} ${tf}` })}
    <p class="bd-sub">${esc(tf==='5m' ? L2('5-minute candles','5 dakikalık mumlar') : L2('Hourly candles','Saatlik mumlar'))}</p>
    <ul class="rp-why"><li><b>${esc(d(pr.o.t))}</b> · ${esc(short ? L2('Sold short','Açığa sattı') : L2('Bought','Aldı'))} $${fpx(pr.o.px)} — ${esc(aiText(pr.o.code, pr.o.vals))}</li>
      ${pr.c ? `<li><b>${esc(d(pr.c.t))}</b> · ${esc(short ? L2('Bought back','Geri aldı') : L2('Sold','Sattı'))} $${fpx(pr.c.px)} — ${esc(aiText(pr.c.code, pr.c.vals))}${pr.c.pl!=null ? ' · '+money(pr.c.pl) : ''}</li>` : ''}</ul></div>`);
  el.hidden=false; const b=el.querySelector('[data-rp-x]'); if (b) b.focus(); }
document.addEventListener('click', e=>{ const t=e.target; if (t.closest('[data-rp-x]') || t.id==='replay'){ const el=$('#replay'); if (el) el.hidden=true; return; } const r=t.closest('.ai-log tr[data-rp]'); if (r) rpOpen(+r.dataset.rp); });
document.addEventListener('keydown', e=>{ const el=$('#replay'); if (e.key==='Escape' && el && !el.hidden){ el.hidden=true; return; } const r=e.target.closest && e.target.closest('.ai-log tr[data-rp]'); if (r && (e.key==='Enter' || e.key===' ')){ e.preventDefault(); rpOpen(+r.dataset.rp); } });

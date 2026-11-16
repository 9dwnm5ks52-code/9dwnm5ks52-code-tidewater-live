/* ---------- Phoenix Finance Club: the Crypto screen (a market screen: the top coins, live) ---------- */
const CXV={ q:'', sort:'rank', open:null };
const L2=(en, tr)=>ST.lang==='tr' ? tr : en;
const p0=v=>v==null ? '—' : ST.lang==='tr' ? '%'+F0.format(v*100) : F0.format(v*100)+'%';
Object.assign(TR, { 'Crypto':'Kripto','Crypto · live':'Kripto · canlı','Total crypto market':'Toplam kripto piyasası','Bitcoin’s share':'Bitcoin’in payı','Fear & Greed':'Korku ve Açgözlülük',
  'Coins rising today':'Bugün yükselen coinler',
  'Trades':'İşlem','Wins':'Kazanç','Best':'En iyi',
  'Coin':'Coin','1 h':'1 s','24 h':'24 s','7 d':'7 g','Volume 24 h':'24 s hacim','Market value':'Piyasa değeri','From its high':'Zirveden','By rank':'Sıraya göre','Most traded':'En çok işlem görenler',
  'Search a coin':'Coin ara','Bitcoin and Ethereum':'Bitcoin ve Ethereum',
  'Loading coins…':'Coinler yükleniyor…','Could not load the coin list. Retrying…':'Coin listesi yüklenemedi. Yeniden deneniyor…',
  'Prices live from Binance; names, market values and 7-day changes from CoinGecko; the Fear & Greed Index from alternative.me. All free.':'Fiyatlar Binance’ten canlı; isimler, piyasa değerleri ve 7 günlük değişimler CoinGecko’dan; Korku ve Açgözlülük Endeksi alternative.me’den. Hepsi ücretsiz.',
  'Coins':'Coinler','Why':'Neden','Extreme Fear':'Aşırı korku','Fear':'Korku','Neutral':'Nötr','Greed':'Açgözlülük','Extreme Greed':'Aşırı açgözlülük','ETH':'ETH' });
TRP.push([/^([\d,]+) of ([\d,]+)$/, m=>`${m[2]} içinde ${m[1]}`], [/^(\d+) days$/, m=>`${m[1]} gün`], [/^([\d,]+) coins$/, m=>`${m[1]} coin`]);
// the coins table: sorted and searched
function cxRows(Q){ let xs=CX.list.map(d=>{ const q=LIVE.q[d.sym]; return { ...d, last:q && q.last, c24:q && q.open ? q.last/q.open-1 : null, vol:q && q.vol }; });
  const s=CXV.q.trim().toUpperCase(); if (s) xs=xs.filter(d=>d.sym.includes(s) || d.name.toUpperCase().includes(s));
  if (CXV.sort==='up') xs.sort((a,b)=>(b.c24??-9)-(a.c24??-9)); else if (CXV.sort==='down') xs.sort((a,b)=>(a.c24??9)-(b.c24??9)); else if (CXV.sort==='vol') xs.sort((a,b)=>(b.vol||0)-(a.vol||0)); else xs.sort((a,b)=>(a.rank||999)-(b.rank||999));
  return xs; }
function renderCrypto(Q){ const el=$('#cx');
  if (el.__lang!==ST.lang){ el.__lang=ST.lang;
    el.innerHTML=`<div class="bd cx-top" id="cx-top"></div>
      <section class="cx-sec pn" aria-labelledby="cx-h"><div class="cx-sh"><h2 id="cx-h">${esc(T('Coins'))}</h2><span class="bd-sub" id="cx-count"></span></div>
        <div class="mk-row"><label class="fld cx-find" for="cx-q"><span>${esc(T('Search a coin'))}</span><input id="cx-q" type="search" autocomplete="off" spellcheck="false" placeholder="BTC, Solana…"></label>
        <span class="seg" role="group" aria-label="Sort" id="cx-sort">${[['rank','By rank'],['up','Risers'],['down','Fallers'],['vol','Most traded']].map(([v,l])=>`<button type="button" data-cxs="${v}" aria-pressed="${CXV.sort===v}">${esc(T(l))}</button>`).join('')}</span></div>
        <div class="tblw" id="cx-tbl"></div>
        <p class="bd-sub">${esc(T('Prices live from Binance; names, market values and 7-day changes from CoinGecko; the Fear & Greed Index from alternative.me. All free.'))}</p></section>`;
    $('#cx-q').value=CXV.q; }
  for (const b of $$('#cx-sort [data-cxs]')) b.setAttribute('aria-pressed', String(b.dataset.cxs===CXV.sort));
  // market tiles
  const g=CX.glob, f=CX.fng[CX.fng.length-1], rows=cxRows(Q), withC=rows.filter(d=>d.c24!=null), up=withC.filter(d=>d.c24>0).length;
  const fv=f ? f.v : null, fcol=fv==null ? 'var(--ink-3)' : fv<25 ? 'var(--loss)' : fv<45 ? 'var(--warn)' : fv<56 ? 'var(--ink-2)' : 'var(--gain)';
  setHTML($('#cx-top'), `<section class="bd-t"><div class="bd-th"><h2>${esc(T('Total crypto market'))}</h2></div><div class="bd-big mono">${g && g.cap ? '$'+big(g.cap) : '—'}</div><p class="mono ${cls(g && g.chg)}">${g ? pct(g.chg)+' · '+esc(T('24 h')) : ''}</p></section>
    <section class="bd-t"><div class="bd-th"><h2>${esc(T('Bitcoin’s share'))}</h2></div><div class="bd-big mono">${g && g.btc ? p0(g.btc) : '—'}</div><p class="bd-sub">${g && g.eth ? 'ETH '+p0(g.eth) : ''}</p></section>
    <section class="bd-t"><div class="bd-th"><h2>${esc(T('Fear & Greed'))}</h2></div><div class="bd-row"><div class="bd-big mono" style="color:${fcol}">${fv==null ? '—' : fv}</div><span class="bd-sub">${f ? esc(T(f.k)) : ''}</span></div>${CX.fng.length>2 ? spark(CX.fng.map(x=>x.v)) : ''}<p class="bd-sub">${CX.fng.length ? esc(T(`${CX.fng.length} days`)) : ''}</p></section>
    <section class="bd-t"><div class="bd-th"><h2>${esc(T('Coins rising today'))}</h2></div><div class="bd-big mono">${withC.length ? esc(T(`${F0.format(up)} of ${F0.format(withC.length)}`)) : '—'}</div><div class="gauge" aria-hidden="true"><i style="left:${withC.length ? (up/withC.length*100).toFixed(0) : 50}%"></i></div></section>`);
  // coins
  if (!CX.list.length){ txt('cx-count', ''); setHTML($('#cx-tbl'), `<p class="empty">${esc(T(CX.status==='offline' ? 'Could not load the coin list. Retrying…' : 'Loading coins…'))}</p>`); return; }
  txt('cx-count', T(`${F0.format(rows.length)} coins`));
  setHTML($('#cx-tbl'), `<table class="tbl mk-tbl"><thead><tr><th class="r">#</th><th>${esc(T('Coin'))}</th><th class="r">${esc(T('Price'))}</th><th class="r">${esc(T('1 h'))}</th><th class="r">${esc(T('24 h'))}</th><th class="r">${esc(T('7 d'))}</th><th class="r">${esc(T('Volume 24 h'))}</th><th class="r">${esc(T('Market value'))}</th><th class="r">${esc(T('From its high'))}</th></tr></thead><tbody>${rows.map(d=>`<tr><td class="r muted mono">${d.rank||''}</td><td><a href="#trade" data-go="${esc(d.sym)}" class="mk-tk">${esc(d.sym)}</a> <span class="muted">${esc(d.name)}</span></td><td class="r mono">${d.last ? '$'+fpx(d.last) : '—'}</td><td class="r mono ${cls(d.c1h)}">${pct(d.c1h)}</td><td class="r mono ${cls(d.c24)}">${pct(d.c24)}</td><td class="r mono ${cls(d.c7d)}">${pct(d.c7d)}</td><td class="r mono">${d.vol ? '$'+big(d.vol) : '—'}</td><td class="r mono">${d.cap ? '$'+big(d.cap) : '—'}</td><td class="r mono ${cls(d.athChg)}">${pct(d.athChg)}</td></tr>`).join('')}</tbody></table>`); }
// daily candles for a coin outside the main twelve (the main ones get them at start)
async function cxDaily(sym){ const d=liveDef(sym), q=liveQ(sym); if (!d || (q.daily && q.daily.length)) return; try{ q.daily=(await liveJSON(`${LIVE.BN_REST}/klines?symbol=${d.bn}&interval=1d&limit=200`)).map(bnBar); liveEmit('bars', sym); }catch(e){} }
document.addEventListener('click', e=>{ const t=e.target;
  const s=t.closest('[data-cxs]'); if (s){ CXV.sort=s.dataset.cxs; render(); return; }
  });
document.addEventListener('input', e=>{ if (e.target.id==='cx-q'){ CXV.q=e.target.value; render(); } });

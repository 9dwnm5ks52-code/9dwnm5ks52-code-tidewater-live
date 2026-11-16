/* ---------- Tidewater Live: news, reports and filings (free, no key) ----------
   - Market news: MarketWatch and The Wall Street Journal RSS (Dow Jones), read directly.
   - Company news: Yahoo Finance RSS per ticker; crypto: Cointelegraph and Decrypt; the economy: Investing.com's economic-data news.
     These come through rss2json.com, a free service that turns an RSS feed into data a web page may read (10 headlines per feed).
   - Company filings: the SEC's EDGAR feed per ticker (8-K, 10-Q, 10-K, ...), also through rss2json.
   - Earnings: coming reports and fresh results for the whole US market, from the screener (dates, EPS and revenue estimates, surprises).
   Headlines are kept for 10 minutes (filings and earnings for 30), so the page asks each source rarely. */
const NEWS = { cool:0, mem:{}, listeners:[], err:{}, queue:Promise.resolve(), last:0, R2J:'https://api.rss2json.com/v1/api.json?rss_url=', DJ:'https://feeds.content.dowjones.io/public/rss/', KEY:'tdl-news' };
const NEWS_FEEDS = {
  market:[ { id:'mw_top', src:'MarketWatch', url:'mw_topstories', dj:true }, { id:'mw_rt', src:'MarketWatch', url:'mw_realtimeheadlines', dj:true }, { id:'wsj_mkt', src:'WSJ', url:'RSSMarketsMain', dj:true } ],
  crypto:[ { id:'ct', src:'Cointelegraph', url:'https://cointelegraph.com/rss' }, { id:'dc', src:'Decrypt', url:'https://decrypt.co/feed' } ],
  economy:[ { id:'inv_eco', src:'Investing.com', url:'https://www.investing.com/rss/news_95.rss' }, { id:'mw_pulse', src:'MarketWatch', url:'mw_marketpulse', dj:true } ],
};
function newsOn(fn){ NEWS.listeners.push(fn); }
function newsEmit(k){ for (const fn of NEWS.listeners){ try{ fn(k); }catch(e){ console.error(e); } } }
const newsTxt = h => String(h||'').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
function newsSaved(){ try{ return JSON.parse(localStorage.getItem(NEWS.KEY)||'{}'); }catch(e){ return {}; } }
function newsKeep(id, v){ NEWS.mem[id]=v; try{ const all=newsSaved(); all[id]=v; const ks=Object.keys(all).sort((a,b)=>all[b].t-all[a].t); for (const k of ks.slice(40)) delete all[k]; localStorage.setItem(NEWS.KEY, JSON.stringify(all)); }catch(e){} }
function newsCached(id, ttl){ const v=NEWS.mem[id] || newsSaved()[id]; if (v){ NEWS.mem[id]=v; if (Date.now()-v.t<ttl) return v; } return null; }
async function newsGet(url, ms){ const c=new AbortController(), tm=setTimeout(()=>c.abort(), ms||15000); try{ const r=await fetch(url, { signal:c.signal }); if (!r.ok) throw new Error('HTTP '+r.status); return r; } finally { clearTimeout(tm); } }
// one request at a time to rss2json, a second apart
// when rss2json says it is busy (HTTP 429), leave it alone for 5 minutes
function newsR2J(feedUrl){ const run=async()=>{ if (NEWS.cool>Date.now()) throw new Error('busy'); const wait=Math.max(0, NEWS.last+1100-Date.now()); if (wait) await new Promise(r=>setTimeout(r, wait)); NEWS.last=Date.now();
    let r; try{ r=await newsGet(NEWS.R2J+encodeURIComponent(feedUrl)); }catch(e){ if (/429/.test(e.message)){ NEWS.cool=Date.now()+300000; newsEmit('busy'); throw new Error('busy'); } throw e; }
    const x=await r.json(); if (x.status!=='ok') throw new Error(x.message||'feed error'); return x.items||[]; };
  const p=NEWS.queue.then(run, run); NEWS.queue=p.catch(()=>{}); return p; }
const newsDate = s => { if (!s) return 0; const t=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s) ? Date.parse(s.replace(' ','T')+'Z') : Date.parse(s); return isFinite(t) ? t : 0; };
async function newsFeed(f, ttl){ const hit=newsCached(f.id, ttl||600000); if (hit) return hit.items; let items=[];
  try{
    if (f.dj){ const xml=await (await newsGet(NEWS.DJ+f.url)).text(), doc=new DOMParser().parseFromString(xml, 'text/xml');
      items=[...doc.querySelectorAll('item')].map(it=>({ title:newsTxt(it.querySelector('title') && it.querySelector('title').textContent), url:(it.querySelector('link')||{}).textContent||'', t:newsDate((it.querySelector('pubDate')||{}).textContent), sum:newsTxt((it.querySelector('description')||{}).textContent).slice(0,240), src:f.src })); }
    else items=(await newsR2J(f.url)).map(it=>({ title:newsTxt(it.title), url:it.link, t:newsDate(it.pubDate), sum:newsTxt(it.description).slice(0,240), src:f.src }));
    items=items.filter(x=>x.title && /^https?:\/\//.test(x.url)); NEWS.err[f.id]=null; newsKeep(f.id, { t:Date.now(), items }); newsEmit(f.id); }
  catch(e){ NEWS.err[f.id]=String(e.message||e); const old=NEWS.mem[f.id] || newsSaved()[f.id]; if (old) return old.items; }
  return items; }
function newsMerge(lists, n){ const seen=new Set(), out=[]; for (const x of lists.flat().sort((a,b)=>b.t-a.t)){ const k=x.form!=null ? x.url : x.title.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,60); if (seen.has(k)) continue; seen.add(k); out.push(x); if (out.length>=(n||60)) break; } return out; }
async function newsGroup(name){ return newsMerge(await Promise.all(NEWS_FEEDS[name].map(f=>newsFeed(f)))); }
// a company's news (Yahoo Finance) and its filings (SEC EDGAR)
const newsTk = sym => { const d=typeof MKT!=='undefined' && MKT.all[sym]; return (d && d.tk) || String(sym).replace(/\.US$/,''); };
async function newsStock(sym){ const tk=newsTk(sym); const xs=await newsFeed({ id:'y_'+tk, src:'Yahoo Finance', url:`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(tk)}&region=US&lang=en-US` }, 900000); return xs.map(x=>({ ...x, sym })); }
async function newsFilings(sym){ const tk=newsTk(sym).replace('.', '-'); const xs=await newsFeed({ id:'sec_'+tk, src:'SEC EDGAR', url:`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(tk)}&type=&dateb=&owner=include&count=10&output=atom` }, 1800000);
  return xs.map(x=>{ const m=x.title.match(/^(\S+)\s+-\s+(.*)$/); return { ...x, sym, form:m ? m[1] : '', what:m ? m[2] : x.title }; }); }
// earnings: what is coming (next 14 days) and what just came out (last 7 days), for companies worth $2 billion or more
const EARN = { up:[], done:[], t:0, err:'' };
const EARN_COLS = ['name','description','close','change','market_cap_basic','earnings_release_next_date','earnings_release_next_time','earnings_per_share_forecast_next_fq','revenue_forecast_next_fq','earnings_release_date','earnings_release_time','earnings_per_share_fq','earnings_per_share_forecast_fq','eps_surprise_percent_fq','revenue_fq','revenue_forecast_fq'];
async function newsEarnings(force){ if (!force && EARN.t && Date.now()-EARN.t<1800000) return EARN; const now=Math.floor(Date.now()/1000), base=[{ left:'market_cap_basic', operation:'greater', right:2e9 }, { left:'exchange', operation:'in_range', right:['NASDAQ','NYSE','AMEX'] }];
  const row=r=>{ const v=r.d; return { sym:mktKey(v[0]), name:v[1], last:v[2], chg:v[3]!=null ? v[3]/100 : null, cap:v[4], next:v[5] ? v[5]*1000 : null, when:v[6], eps:v[7], rev:v[8], done:v[9] ? v[9]*1000 : null, whenDone:v[10], epsA:v[11], epsE:v[12], surp:v[13]!=null ? v[13]/100 : null, revA:v[14], revE:v[15] }; };
  try{ const [a, b]=await Promise.all([
      mktPost({ filter:base.concat([{ left:'earnings_release_next_date', operation:'in_range', right:[now-3600, now+14*86400] }]), columns:EARN_COLS, range:[0,600], sort:{ sortBy:'market_cap_basic', sortOrder:'desc' } }),
      mktPost({ filter:base.concat([{ left:'earnings_release_date', operation:'in_range', right:[now-7*86400, now] }]), columns:EARN_COLS, range:[0,400], sort:{ sortBy:'market_cap_basic', sortOrder:'desc' } }) ]);
    EARN.up=(a.data||[]).map(row).filter(x=>x.next).sort((x,y)=>x.next-y.next || (y.cap||0)-(x.cap||0)); EARN.done=(b.data||[]).map(row).filter(x=>x.done).sort((x,y)=>y.done-x.done || (y.cap||0)-(x.cap||0));
    EARN.t=Date.now(); EARN.err=''; newsEmit('earn'); }
  catch(e){ EARN.err=String(e.message||e); }
  return EARN; }

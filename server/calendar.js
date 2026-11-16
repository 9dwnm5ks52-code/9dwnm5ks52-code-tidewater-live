// Phoenix Finance Club: the economic calendar for the site (data/calendar.json), refreshed at most every 3 hours.
// This week from ForexFactory's free weekly file; the days after it (US only) from Nasdaq's free calendar.
// Test hooks: CLUB_FF and CLUB_NASDAQ point the two downloads at a local stand-in.
const fs = require('fs'), path = require('path');
const FF = process.env.CLUB_FF || 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const NASDAQ = process.env.CLUB_NASDAQ || 'https://api.nasdaq.com/api/calendar/economicevents';
async function getJSON(url, opt){ const c=new AbortController(), tm=setTimeout(()=>c.abort(), 15000);
  try{ const r=await fetch(url, { ...(opt||{}), signal:c.signal }); if (!r.ok) throw new Error('HTTP '+r.status); return await r.json(); } finally { clearTimeout(tm); } }
async function calendar(DATA, now, log){
  const file=path.join(DATA, 'calendar.json'); let cal=null; try{ cal=JSON.parse(fs.readFileSync(file, 'utf8')); }catch(e){}
  if (cal && now-cal.t<=3*3600e3) return false;
  const ev=(await getJSON(FF)).filter(x=>['USD','EUR','GBP','JPY','CNY'].includes(x.country) && x.impact!=='Holiday')
    .map(x=>({ title:String(x.title||''), country:x.country, t:Date.parse(x.date), impact:String(x.impact||''), forecast:String(x.forecast||''), previous:String(x.previous||'') }));
  // next days not in ForexFactory's week: US releases from Nasdaq's calendar (its times are New York time; asking for a date returns the day before, so we ask one day ahead)
  const last=Math.max(0, ...ev.map(e=>e.t)), ny=(day, hm)=>{ const [h, m]=String(hm||'0:0').split(':').map(Number), base=Date.UTC(+day.slice(0,4), +day.slice(5,7)-1, +day.slice(8,10), h||0, m||0), off=Date.parse(new Date(base).toLocaleString('en-US', { timeZone:'America/New_York' })+' GMT')-base; return base-off; };
  const big=/CPI|Nonfarm|Payroll|FOMC|Fed Chair|Interest Rate|GDP|PCE|Retail Sales|Unemployment|PPI|ISM|Jobless/i;
  for (let k=0;k<8;k++){ const day=new Date(now+k*864e5).toISOString().slice(0,10); if (Date.parse(day+'T23:59:59Z')<=last || [0,6].includes(new Date(day+'T12:00:00Z').getUTCDay())) continue;
    try{ const x=await getJSON(`${NASDAQ}?date=${new Date(Date.parse(day+'T12:00:00Z')+864e5).toISOString().slice(0,10)}`, { headers:{ 'User-Agent':'Mozilla/5.0', Accept:'application/json' } });
      for (const r of (x.data && x.data.rows)||[]){ if (r.country!=='United States' || /Auction/i.test(r.eventName)) continue; const cl=v=>String(v||'').replace(/&nbsp;/g,'').trim();
        ev.push({ title:cl(r.eventName), country:'USD', t:ny(day, r.gmt), impact:big.test(r.eventName) ? 'High' : 'Medium', forecast:cl(r.consensus), previous:cl(r.previous) }); } }
    catch(e){ log('Nasdaq calendar', day, e.message); } }
  const tmp=file+'.tmp'; fs.writeFileSync(tmp, JSON.stringify({ t:now, src:'ForexFactory and Nasdaq', events:ev.filter(e=>isFinite(e.t)).sort((a,b)=>a.t-b.t) })); fs.renameSync(tmp, file);
  log(`calendar: ${ev.length} events`); return true; }
module.exports = { calendar };

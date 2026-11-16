#!/usr/bin/env python3
# 1s candles: quote(sym) carries no trade list, so read the trades from the live data layer (LIVE.q[sym].trades)
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
p = R / 'live/chdata.js'; s = p.read_text()
for a, b in [
 ("function cd1s(c, q, now){ const bars=c.bars, seen=c.seen||(c.seen=new WeakSet()), tr=Array.isArray(q.trades) ? q.trades : [];",
  "// the websocket's trades for a coin ({ t, px, q }); quote() itself does not pass them on\n"
  "function cdTrades(sym, q){ if (q && Array.isArray(q.trades)) return q.trades; try{ const x=typeof LIVE!=='undefined' && LIVE.q && LIVE.q[sym]; return x && Array.isArray(x.trades) ? x.trades : []; }catch(e){ return []; } }\n"
  "function cd1s(c, q, now, sym){ const bars=c.bars, seen=c.seen||(c.seen=new WeakSet()), tr=cdTrades(sym, q);"),
 ("  const tr=q && Array.isArray(q.trades) ? q.trades.filter(x=>x && x.t>=cut && +x.px>0) : [];",
  "  const all=cdTrades(sym, q), tr=all.filter(x=>x && x.t>=cut && +x.px>0);"),
 ("  c.seen=new WeakSet(q.trades.filter(x=>x && typeof x==='object' && !(x.t>=cut))); }",
  "  c.seen=new WeakSet(all.filter(x=>x && typeof x==='object' && !(x.t>=cut))); }"),
 ("function cdLive(c, q, ms, now){ const bars=c.bars; if (!bars || !bars.length || !q) return; if (ms===1e3){ cd1s(c, q, now); return; }",
  "function cdLive(c, q, ms, now, sym){ const bars=c.bars; if (!bars || !bars.length || !q) return; if (ms===1e3){ cd1s(c, q, now, sym); return; }"),
 ("function cdSeed(q, tf){ if (!q) return null;\n  if (tf==='1s'){ const t=(Array.isArray(q.trades) ? q.trades : []).find(",
  "function cdSeed(q, tf, sym){ if (!q) return null;\n  if (tf==='1s'){ const t=cdTrades(sym, q).find("),
 ("  if (!c.bars){ const s=cdSeed(q, tf); if (s){ c.bars=s; c.seeded=true; } }", "  if (!c.bars){ const s=cdSeed(q, tf, sym); if (s){ c.bars=s; c.seeded=true; } }"),
 ("  cdLive(c, q, x.ms, now);", "  cdLive(c, q, x.ms, now, sym);"),
]:
    assert s.count(a)==1, a[:90]; s = s.replace(a, b)
p.write_text(s)
# the unit test now keeps trades where the page keeps them: in LIVE.q[sym], not on the quote
t = R / 'ds/t_chdata.js'; u = t.read_text()
for a, b in [
 ("const trades=[]; Q.BTC={ kind:'crypto', last:100, trades, intra:[], daily:[] };",
  "const trades=[]; Q.BTC={ kind:'crypto', last:100, intra:[], daily:[] }; X.LIVE.q.BTC={ trades };"),
 ("Q.ETH={ kind:'crypto', last:51, trades, intra:[], daily:[] };", "Q.ETH={ kind:'crypto', last:51, intra:[], daily:[] }; X.LIVE.q.ETH={ trades };"),
]:
    assert u.count(a)==1, a[:90]; u = u.replace(a, b)
t.write_text(u); print('ok')

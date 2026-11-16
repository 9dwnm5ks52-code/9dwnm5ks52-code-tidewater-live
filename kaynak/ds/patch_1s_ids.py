#!/usr/bin/env python3
# 1s candles: open and close follow the exchange's trade numbers, so trades delivered out of order still give
# Binance's exact open and close (each second remembers the lowest and highest trade id it has seen)
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
p = R / 'live/chdata.js'; s = p.read_text()
old_put = s[s.index("function cd1sPut(c, B, px, v){"):s.index("function cd1s(c, q, now, sym){")]
new_put = """function cd1sPut(c, B, px, v, id){ const bars=c.bars, I=c.ids||(c.ids=new Map()); let last=bars[bars.length-1], b=null;
  if (B<last.t){ for (let k=bars.length-1;k>=0 && bars[k].t>=B;k--) if (bars[k].t===B){ b=bars[k]; break; } if (!b) return; }   // a late trade for an older second
  else { if (B>last.t){
      if (B-last.t>6e5){ c.t=0; bars.push({ t:B, o:px, h:px, l:px, c:px, v:0 }); }   // more than 10 minutes missed (tab asleep): start here and download the gap
      else { while (last.t+1e3<B){ last={ t:last.t+1e3, o:last.c, h:last.c, l:last.c, c:last.c, v:0 }; bars.push(last); } bars.push({ t:B, o:px, h:px, l:px, c:px, v:0 }); }
      if (id!=null) I.set(B, { lo:id, hi:id }); }
    b=bars[bars.length-1]; }
  if (px>b.h) b.h=px; if (px<b.l) b.l=px; b.v+=v;
  if (id==null){ if (b===bars[bars.length-1]) b.c=px; return; }   // no trade number (Coinbase, the quoted price): newest wins
  let r=I.get(B); if (!r){ r={ lo:-Infinity, hi:id }; I.set(B, r); b.c=px; }   // a second that came from the download: its open stays
  else { if (id>r.hi){ r.hi=id; b.c=px; } if (id<r.lo){ r.lo=id; b.o=px; } }
  if (I.size>400) for (const k of I.keys()){ if (k<B-3e5) I.delete(k); else break; } }
"""
s = s.replace(old_put, new_put)
for a, b in [
 ("    if (!(px>0) || !isFinite(px) || !isFinite(x.t)) continue; cd1sPut(c, Math.floor(x.t/1e3)*1e3, px, +x.q>0 ? +x.q : 0); c.heard=now; }",
  "    if (!(px>0) || !isFinite(px) || !isFinite(x.t)) continue; cd1sPut(c, Math.floor(x.t/1e3)*1e3, px, +x.q>0 ? +x.q : 0, isFinite(x.id) ? x.id : null); c.heard=now; }"),
 ("  const px=+x.px; if (!(px>0) || !isFinite(px) || !isFinite(x.t)) return; cd1sPut(c, Math.floor(x.t/1e3)*1e3, px, +x.q>0 ? +x.q : 0);",
  "  const px=+x.px; if (!(px>0) || !isFinite(px) || !isFinite(x.t)) return; cd1sPut(c, Math.floor(x.t/1e3)*1e3, px, +x.q>0 ? +x.q : 0, isFinite(x.id) ? x.id : null);"),
 ("  while (bars.length>1 && bars[bars.length-1].t>=cut) bars.pop();",
  "  while (bars.length>1 && bars[bars.length-1].t>=cut) bars.pop(); if (c.ids) for (const k of [...c.ids.keys()]) if (k>=cut) c.ids.delete(k);"),
]:
    assert s.count(a)==1, a[:90]; s = s.replace(a, b)
p.write_text(s)
# unit test: trades of one second delivered out of order still give the exchange's open and close
t = R / 'ds/t_chdata.js'; u = t.read_text()
a = "{ reset(); const S=1e3, T0=Date.UTC(2026,10,11,10,20,0); NOW=T0+700; NET.fail.add('bn'); X.LIVE.src='coinbase';"
assert u.count(a)==1
u = u.replace(a, """{ reset(); const S=1e3, T0=Date.UTC(2026,10,11,10,40,0); NOW=T0+300; const trades=[]; Q.BTC={ kind:'crypto', last:100, intra:[], daily:[] }; X.LIVE.q.BTC={ trades };
  X.cdBars('BTC','1s'); await settle(); X.cdBars('BTC','1s');
  for (const [id, px] of [[11, 101], [13, 99], [12, 104], [10, 100]]){ trades.push({ t:T0+S+500, px, q:1, id }); X.liveEmit('trade', 'BTC'); }   // delivered 11, 13, 12, 10
  NOW=T0+2*S+50; const b=X.cdBars('BTC','1s'), s1=b.find(x=>x.t===T0+S);
  check('1s: trades delivered out of order still give the exchange’s open (lowest trade id) and close (highest)', s1 && s1.o===100 && s1.c===99 && s1.h===104 && s1.l===99 && near(s1.v, 4), s1 && JSON.stringify(s1)); }
""" + a)
t.write_text(u); print('ok')

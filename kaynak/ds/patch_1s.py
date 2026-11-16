#!/usr/bin/env python3
# real 1-second candles on the pro chart (crypto): timeframe lists, seconds on the time axis, stocks fall back to 1m
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def P(path, pairs):
    p = R / path; s = p.read_text()
    for a, b in pairs:
        assert s.count(a)==1, path+': '+a[:100]; s = s.replace(a, b)
    p.write_text(s)
P('live/chart.js', [
 ("const CH_TF_MS = { '1m':6e4,", "const CH_TF_MS = { '1s':1e3, '1m':6e4,"),
 ("const chTfName = tf => ({ '1m':L2('1m','1dk'),", "const chTfName = tf => ({ '1s':L2('1s','1sn'), '1m':L2('1m','1dk'),"),
 # 1-second bars exist only for coins: a stock on 1s shows its 1-minute bars (the setting stays 1s for the next coin)
 ("function chRender(host, sym){\n  if (!host) return false; const C=chInit(); if (!C) return false;\n  const tf=C.tf,",
  "function chTfEff(sym){ const C=ST.chart, tf=C && C.tf || '1m'; if (tf!=='1s') return tf; try{ return typeof liveDef==='function' && liveDef(sym) ? '1s' : '1m'; }catch(e){ return '1m'; } }\n"
  "function chRender(host, sym){\n  if (!host) return false; const C=chInit(); if (!C) return false;\n  const tf=chTfEff(sym),"),
 ("N=raw.length, last=raw[N-1], tf=C.tf, tfms=CH_TF_MS[tf];", "N=raw.length, last=raw[N-1], tf=chTfEff(sym), tfms=CH_TF_MS[tf];"),
 # crosshair time with seconds on second bars
 ("(tfms<864e5 ? ' '+chDf('hm', { hour:'2-digit', minute:'2-digit', hour12:false }).format(t) : ''); }",
  "(tfms<6e4 ? ' '+chDf('hms', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(t) : tfms<864e5 ? ' '+chDf('hm', { hour:'2-digit', minute:'2-digit', hour12:false }).format(t) : ''); }"),
 # time-axis steps in seconds, labelled HH:MM:SS
 ("const CH_TSTEPS=[6e4,", "const CH_TSTEPS=[5e3,1e4,15e3,3e4,6e4,"),
 ("else text=chDf('hm', { hour:'2-digit', minute:'2-digit', hour12:false }).format(t); }",
  "else text=s<6e4 ? chDf('hms', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(t) : chDf('hm', { hour:'2-digit', minute:'2-digit', hour12:false }).format(t); }"),
])
P('live/chui.js', [
 ("const CU_TFS = [\n  { id:'1m',", "const CU_TFS = [\n  { id:'1s', s:['1s','1sn'], n:['1 second (coins only)','1 saniye (sadece kripto)'] },\n  { id:'1m',"),
 ("const tfs=CU_TFS.map(t=>`<button type=\"button\" class=\"cu-b cu-tf\" data-ctf=\"${t.id}\" aria-pressed=\"${S.tf===t.id}\" title=\"${esc(cuL(t.n))}\">",
  "const coin=(()=>{ try{ return typeof liveDef==='function' && !!liveDef(ST.sel); }catch(e){ return true; } })();\n"
  "  const tfs=CU_TFS.map(t=>`<button type=\"button\" class=\"cu-b cu-tf\" data-ctf=\"${t.id}\" aria-pressed=\"${S.tf===t.id}\"${t.id==='1s' && !coin ? ' disabled' : ''} title=\"${esc(t.id==='1s' && !coin ? cuL(['1-second candles exist for coins only; this stock shows 1-minute candles','1 saniyelik mum sadece kriptoda var; bu hisse 1 dakikalık mum gösterir']) : cuL(t.n))}\">"),
])
P('live/app.js', [
 ("const ctf=ST.chart && ST.chart.tf || (ST.tf==='daily' ? '1d' : '1m'), tb=$('#tr-tf');",
  "const ctf=typeof chTfEff==='function' && ST.chart ? chTfEff(ST.sel) : ST.chart && ST.chart.tf || (ST.tf==='daily' ? '1d' : '1m'), tb=$('#tr-tf');"),
 ("const TFN={ '1m':['1-minute candles','1 dakikalık mumlar'],", "const TFN={ '1s':['1-second candles, live from every trade','1 saniyelik mumlar, her işlemden canlı'], '1m':['1-minute candles','1 dakikalık mumlar'],"),
])
print('ok')

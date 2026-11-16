#!/usr/bin/env python3
# glass skin, step 3: the account bar only where you trade; an empty week shows one full-width line; a lighter hero
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def P(path, pairs):
    p = R / path; s = p.read_text()
    for a, b in pairs:
        assert s.count(a)==1, path+': '+a[:90]; s = s.replace(a, b)
    p.write_text(s)
P('live/ui.js', [("function uiAfter(v, Q){ try{ if (v==='board'", "function uiAfter(v, Q){ try{ document.documentElement.dataset.view=v; if (v==='board'")])
P('live/home.js', [("const wk=$('#hm-wk'); if (wk) setHTML(wk, !all.length ?", "const wk=$('#hm-wk'); if (wk) wk.classList.toggle('empty', !all.length); if (wk) setHTML(wk, !all.length ?")])
P('live/skin.css', [
 ("--hero-bg:linear-gradient(140deg,#2ff09b 0%,#16c47c 45%,#0b8f5a 100%);", "--hero-bg:linear-gradient(140deg,#4af5aa 0%,#2ee596 45%,#17c47e 100%);"),
 (".hm-wk{display:grid;", ".hm-wk.empty{display:block;min-height:0}\n.hm-wk{display:grid;"),
 ("/* ---- account bar: a slim glass strip */", "/* ---- account bar: a slim glass strip, only on the screens where you trade */\nhtml[data-view]:not([data-view=\"trade\"]):not([data-view=\"portfolio\"]):not([data-view=\"challenge\"]):not([data-view=\"report\"]) .acct{display:none}"),
])
print('ok')

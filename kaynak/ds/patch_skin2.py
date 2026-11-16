#!/usr/bin/env python3
# glass skin, step 2: the Board as a bento (new tiles from home.js, a new order), the mood gauge, home.js in the build
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
p = R / 'live/app.js'; s = p.read_text()
i = s.index("function boardBuild(){"); j = s.index("function renderBoard(Q, E){")
body = s[i:j]
head = "function boardBuild(){ const el=$('#bd'); if (el.__lang===ST.lang) return; el.__lang=ST.lang;\n"
assert body.startswith(head)
calls = re.findall(r"tile\('([a-z]+)',.*?(?=\n    \+ tile\(|; \}\n?$)", body[len(head):], flags=re.S)
parts = {}
for m in re.finditer(r"tile\('([a-z]+)',", body):
    k = m.group(1); st = m.start()
    nx = body.find("\n    + tile(", st); end = nx if nx != -1 else body.rindex("; }")
    parts[k] = body[st:end]
assert set(parts) == {'money','map','quick','mood','league','cal','inbox','watch','news','earn','src'}, parts.keys()
# the mood tile: a semicircle gauge on top of the number (the old bar stays for the code that moves it, hidden by the skin)
parts['mood'] = parts['mood'].replace("`<div class=\"bd-big mono\" id=\"m-v\"></div>", "`<div class=\"hm-gw\"><div id=\"hm-gauge\"></div><div class=\"bd-big mono\" id=\"m-v\"></div></div>")
assert 'hm-gauge' in parts['mood']
order = ['money', 'H:today', 'quick', 'mood', 'H:week', 'map', 'H:strat', 'league', 'inbox', 'watch', 'news', 'earn', 'cal', 'src']
expr = ' + '.join(f"(H.{k[2:]}||'')" if k.startswith('H:') else parts[k] for k in order)
new = head + "  const H=typeof hmTiles==='function' ? hmTiles() : {};\n  el.innerHTML = " + expr.replace(" + tile(", "\n    + tile(").replace(" + (H.", "\n    + (H.") + "; }\n"
s = s[:i] + new + s[j:]
p.write_text(s)
# render the home tiles after the board's own numbers are in
u = R / 'live/ui.js'; t = u.read_text()
a = "function uiAfter(v, Q){ try{ renderAcctBar();"
assert t.count(a) == 1
t = t.replace(a, "function uiAfter(v, Q){ try{ if (v==='board' && typeof renderHome==='function') renderHome(Q); renderAcctBar();")
u.write_text(t)
b = R / 'build_live.py'; x = b.read_text()
a = "'live/welcome.js'"
assert x.count(a) == 1
b.write_text(x.replace(a, "'live/welcome.js', 'live/home.js'"))
print('ok')

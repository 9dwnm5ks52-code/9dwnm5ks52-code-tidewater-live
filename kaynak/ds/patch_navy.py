#!/usr/bin/env python3
# Phoenix Finance Club: the glass skin in navy (dark and light), the simple rising-line mark, and the fundamentals panel
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
p = R / 'live/skin.css'; s = p.read_text()
dark = """:root{
  --bg:#050a17; --surface-1:#0a1326; --surface-2:#0e1930; --surface-3:#15233f;
  --glass:rgba(5,10,23,.74); --scrim:rgba(1,4,12,.7);
  --line:#172540; --line-strong:#283c62; --control-border:#53698f;
  --ink:#eef3ff; --ink-2:#aab8d6; --ink-3:#909fc0;
  --accent:#7db4ff; --accent-hover:#a3cbff; --accent-press:#5f9df5; --on-accent:#04112a; --accent-soft:#132a4f;
  --gain:#3dd68c; --gain-soft:#0d2b22; --loss:#ff7a75; --loss-soft:#3a1a1d; --on-trade:#03140c;
  --warn:#f5b546; --warn-soft:#33270f; --focus:#7db4ff;
  --chart-grid:#111d34; --chart-line:#e8efff; --chart-volume:#1d2c4a; --chart-compare:#909fc0;
  --elev-raised:0 24px 60px rgba(0,0,0,.45); --elev-overlay:0 30px 80px rgba(0,0,0,.65);
  --r-card:24px; --r-ctl:14px;
  --card-bg:linear-gradient(155deg,rgba(125,180,255,.075),rgba(125,180,255,.012) 52%,rgba(255,255,255,.01)),var(--surface-1);
  --card-edge:inset 0 1px 0 rgba(210,225,255,.06);
  --hero-bg:linear-gradient(140deg,#2c5fd6 0%,#1f48b0 55%,#173a91 100%);
  --page-bg:radial-gradient(1100px 620px at 78% -8%,rgba(64,116,226,.22),transparent 62%),radial-gradient(900px 520px at -6% 104%,rgba(30,64,150,.2),transparent 60%),linear-gradient(180deg,#071025 0%,#040814 100%);
}"""
light = """:root[data-tdx-theme="light"]{
  --bg:#eef2f9; --surface-1:#ffffff; --surface-2:#f6f8fc; --surface-3:#e5ebf5;
  --glass:rgba(242,246,252,.82); --scrim:rgba(8,20,48,.4);
  --line:#d8e0ee; --line-strong:#b9c6dc; --control-border:#6b7a96;
  --ink:#0a1630; --ink-2:#33415f; --ink-3:#4c5a78;
  --accent:#1d4ed8; --accent-hover:#1a43bd; --accent-press:#1739a1; --on-accent:#ffffff; --accent-soft:#dde7fd;
  --gain:#0a7a4b; --gain-soft:#dcf3e7; --loss:#bf2f2a; --loss-soft:#fbe4e2; --on-trade:#ffffff;
  --warn:#8a5200; --warn-soft:#fbefdc; --focus:#1d4ed8;
  --chart-grid:#e1e7f1; --chart-line:#0a1630; --chart-volume:#d3dcec; --chart-compare:#4c5a78;
  --elev-raised:0 1px 2px rgba(10,22,48,.05),0 14px 34px rgba(10,22,48,.08); --elev-overlay:0 24px 64px rgba(10,22,48,.18);
  --card-bg:linear-gradient(155deg,rgba(29,78,216,.05),rgba(255,255,255,0) 55%),var(--surface-1);
  --card-edge:inset 0 1px 0 rgba(255,255,255,.9);
  --hero-bg:linear-gradient(140deg,#1e40af 0%,#1a3796 50%,#152d7c 100%);
  --page-bg:radial-gradient(1100px 600px at 80% -10%,rgba(29,78,216,.14),transparent 60%),radial-gradient(800px 480px at -8% 105%,rgba(30,64,150,.1),transparent 60%),linear-gradient(180deg,#f2f5fb,#e8edf6);
}"""
s, n1 = re.subn(r":root\{\n  --bg:#050e0a;.*?\n\}", dark, s, count=1, flags=re.S)
s, n2 = re.subn(r':root\[data-tdx-theme="light"\]\{\n  --bg:#e9f3ee;.*?\n\}', light, s, count=1, flags=re.S)
assert n1 == 1 and n2 == 1, (n1, n2)
s = s.replace('/* ---------- Tidewater Live: the "glass" skin ----------', '/* ---------- Phoenix Finance Club: the "glass" skin, in navy ----------')
# the hero card (Today in one look) now has white text in both themes
s = s.replace(".bd-t.hero{background:var(--hero-bg);border-color:transparent;color:#03150d;", ".bd-t.hero{background:var(--hero-bg);border-color:transparent;color:#fff;")
s = s.replace(":root[data-tdx-theme=\"light\"] .bd-t.hero{color:#fff}\n", "")
s = s.replace(".hm-pill:hover{background:rgba(255,255,255,.18)}", ".hm-pill:hover{background:rgba(255,255,255,.16)}")
# the mark: a rising line in a navy tile
a = ".lv-brand b{width:34px;height:34px;display:inline-grid;place-items:center;padding:0;border-radius:12px;font-size:.66rem;letter-spacing:.02em;background:var(--hero-bg);color:#03150d;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 8px 24px rgba(60,243,161,.28)}\n:root[data-tdx-theme=\"light\"] .lv-brand b{color:#fff}"
assert s.count(a) == 1
s = s.replace(a, ".lv-brand b{width:34px;height:34px;display:inline-grid;place-items:center;padding:0;border-radius:11px;background:var(--hero-bg);color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 8px 22px rgba(29,78,216,.32)}\n"
  ".lv-brand b svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}\n.lv-brand span{font-weight:700;letter-spacing:-.02em}")
s += """
/* ---- company fundamentals under the chart */
#tr-fund .bd-th h2{font-size:1.05rem}
.fd-rg{display:grid;gap:6px;max-width:520px}
.fd-rg>span{font-size:.78rem;color:var(--ink-2);font-weight:600}
.fd-rb{position:relative;height:8px;border-radius:999px;background:linear-gradient(90deg,var(--loss),var(--warn),var(--gain));opacity:.85}
.fd-rb i{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--surface-1);border:3px solid var(--ink)}
.fd-rl{display:flex;justify-content:space-between;font-size:.8rem;font-variant-numeric:tabular-nums}
.fd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.fd-g{border:1px solid var(--line);border-radius:18px;background:var(--surface-2);padding:14px 16px}
.fd-g h3{margin:0 0 8px;font-size:.78rem;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:700}
.fd-g dl{margin:0;display:grid;gap:2px}
.fd-kv{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--line);font-size:.85rem}
.fd-kv:last-child{border-bottom:0}
.fd-kv dt{color:var(--ink-2)}
.fd-kv dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.fd-kv dd.up{color:var(--gain)}.fd-kv dd.down{color:var(--loss)}
.fd-src{font-size:.74rem}
"""
p.write_text(s)
# put the fundamentals panel under the chart panel on the Trade screen, and render it after each update
h = R / 'live/app.html'; t = h.read_text()
a = "<div class=\"pn\"><div class=\"bd-th\"><h2 id=\"tr-bk-h\">Order book</h2></div>"
assert t.count(a) == 1
h.write_text(t.replace(a, "<section class=\"pn\" id=\"tr-fund\" hidden aria-label=\"Fundamentals\"></section>\n          " + a))
u = R / 'live/ui.js'; x = u.read_text()
a = "if (v==='trade'){ futAfter(Q); termAfter(Q); }"
assert x.count(a) == 1
u.write_text(x.replace(a, "if (v==='trade'){ futAfter(Q); termAfter(Q); if (typeof fdRender==='function') fdRender(); }"))
b = R / 'build_live.py'; y = b.read_text()
a = "'live/home.js'"
assert y.count(a) == 1
b.write_text(y.replace(a, "'live/home.js', 'live/fund.js'"))
print('ok')

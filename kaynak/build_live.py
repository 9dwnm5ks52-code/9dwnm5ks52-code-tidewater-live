#!/usr/bin/env python3
"""Assemble dist/live.html: one file, everything inline."""
import pathlib, shutil
R = pathlib.Path(__file__).resolve().parent
html = (R/'live/app.html').read_text()
css = '\n'.join((R/'live'/f).read_text() for f in ['tokens.css', 'app.css', 'pro.css', 'chart.css', 'chui.css'])
js = '\n'.join((R/p).read_text() for p in ['sim_live.js', 'sim_live_us.js', 'sim_live_tv.js', 'sim_live_cx.js', 'sim_news.js', 'live_broker.js', 'live/ind.js', 'live/chdata.js', 'live/app.js', 'live/markets.js', 'live/crypto.js', 'live/news.js', 'live/perf.js', 'live/watch.js', 'live/srv.js', 'live/club.js', 'live/extras.js', 'live/ui.js', 'live/chart.js', 'live/chui.js', 'live/draw.js', 'live/term.js', 'live/report.js', 'live/home.js', 'live/fund.js', 'live/drawer.js'])
assert '</script' not in js.lower(), 'a closing script tag inside the JS would break the page'
out = html.replace('/*CSS*/', css, 1).replace('/*JS*/', '"use strict";\n' + js + '\nstart();', 1)
(R/'dist').mkdir(exist_ok=True)
(R/'dist/live.html').write_text(out)
# the UI tests read their fixtures (a club fund, an economic calendar) from dist/srvdata
if (R/'ds'/'srvdata').is_dir(): shutil.copytree(R/'ds'/'srvdata', R/'dist'/'srvdata', dirs_exist_ok=True)
print('dist/live.html', len(out.encode()), 'bytes')

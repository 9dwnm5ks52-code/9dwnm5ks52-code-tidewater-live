#!/usr/bin/env python3
"""Assemble dist/live.html: one file, everything inline."""
import pathlib
R = pathlib.Path(__file__).resolve().parent
html = (R/'live/app.html').read_text()
css = (R/'live/tokens.css').read_text() + '\n' + (R/'live/app.css').read_text() + '\n' + (R/'live/pro.css').read_text() + '\n' + (R/'live/chart.css').read_text() + '\n' + (R/'live/chui.css').read_text() + '\n' + (R/'live/skin.css').read_text()
js = '\n'.join((R/p).read_text() for p in ['sim_live.js', 'sim_live_us.js', 'sim_live_tv.js', 'sim_live_cx.js', 'sim_news.js', 'live_broker.js', 'ai_bots.js', 'ai_learn.js', 'ai_daily.js', 'strategy.js', 'live/ind.js', 'live/chdata.js', 'live/app.js', 'live/markets.js', 'live/crypto.js', 'live/bots.js', 'live/news.js', 'live/perf.js', 'live/watch.js', 'live/manage.js', 'live/lab.js', 'live/srv.js', 'live/arena.js', 'live/desk.js', 'live/desk2.js', 'live/journal.js', 'live/extras.js', 'live/ui.js', 'live/chart.js', 'live/chui.js', 'live/draw.js', 'live/term.js', 'live/futures.js', 'live/botops.js', 'live/report.js', 'live/challenge.js', 'live/welcome.js', 'live/home.js'])
arena = R/'data'/'arena.json'
if arena.exists():
    import json
    js = 'const ARENA_SNAP=' + json.dumps(json.loads(arena.read_text()), separators=(',', ':')).replace('</', '<\\/') + ';\n' + js
daily = R/'data'/'daily.json'
if daily.exists():
    import json
    js = 'const DAILY_SNAP=' + json.dumps(json.loads(daily.read_text()), separators=(',', ':')).replace('</', '<\\/') + ';\n' + js
assert '</script' not in js.lower(), 'a closing script tag inside the JS would break the page'
out = html.replace('/*CSS*/', css, 1).replace('/*JS*/', '"use strict";\n' + js + '\nstart();', 1)
(R/'dist').mkdir(exist_ok=True)
(R/'dist/live.html').write_text(out)
# the server-mode test (ds/t_srv_ui.js) reads its fixture from dist/srvdata
import shutil
if (R/'ds'/'srvdata').is_dir(): shutil.copytree(R/'ds'/'srvdata', R/'dist'/'srvdata', dirs_exist_ok=True)
print('dist/live.html', len(out.encode()), 'bytes')

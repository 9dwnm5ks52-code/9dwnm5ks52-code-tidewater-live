#!/usr/bin/env python3
"""Assemble hosting/: everything a GitHub repository needs to serve the site and run the bots on a schedule."""
import pathlib, shutil, subprocess
R = pathlib.Path(__file__).resolve().parent
H = R / 'hosting'; S = R / 'hosting_src'
subprocess.run(['python3', str(R / 'build_live.py')], check=True)
(H / 'server' / 'lib').mkdir(parents=True, exist_ok=True); (H / '.github' / 'workflows').mkdir(parents=True, exist_ok=True)
shutil.copy(R / 'dist' / 'live.html', H / 'index.html')
for f in ['manifest.webmanifest', 'sw.js', 'icon.svg', 'README.md']: shutil.copy(S / f, H / f)
shutil.copy(S / 'bots.yml', H / '.github' / 'workflows' / 'bots.yml')
shutil.copy(R / 'server' / 'run.js', H / 'server' / 'run.js'); shutil.copy(R / 'server' / 'arena.js', H / 'server' / 'arena.js'); shutil.copy(R / 'server' / 'daily_arena.js', H / 'server' / 'daily_arena.js'); shutil.copy(S / 'arena.yml', H / '.github' / 'workflows' / 'arena.yml')
for f in ['sim_live.js', 'sim_live_us.js', 'sim_live_tv.js', 'live_broker.js', 'ai_bots.js', 'ai_learn.js', 'ai_daily.js', 'strategy.js']: shutil.copy(R / f, H / 'server' / 'lib' / f)
(H / '.nojekyll').write_text('')
# the app icons, drawn from icon.svg by the browser
subprocess.run(['node', str(R / 'ds' / 'make_icons.js'), str(H)], check=True)
print('hosting/ ready:', sorted(str(p.relative_to(H)) for p in H.rglob('*') if p.is_file()))

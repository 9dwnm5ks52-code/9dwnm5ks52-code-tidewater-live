#!/usr/bin/env python3
"""Assemble hosting/: everything the GitHub repository needs to serve the site and run the club fund's executor."""
import pathlib, shutil, subprocess
R = pathlib.Path(__file__).resolve().parent
H = R / 'hosting'; S = R / 'hosting_src'
subprocess.run(['python3', str(R / 'build_live.py')], check=True)
if H.exists(): shutil.rmtree(H)   # start clean, so nothing removed from the source lingers in the kit
(H / 'server' / 'lib').mkdir(parents=True, exist_ok=True); (H / '.github' / 'workflows').mkdir(parents=True, exist_ok=True)
shutil.copy(R / 'dist' / 'live.html', H / 'index.html')
for f in ['manifest.webmanifest', 'sw.js', 'icon.svg', 'README.md']: shutil.copy(S / f, H / f)
shutil.copy(S / 'club.yml', H / '.github' / 'workflows' / 'club.yml')
for f in ['club.js', 'calendar.js', 'club_run.sh']: shutil.copy(R / 'server' / f, H / 'server' / f)
for f in ['sim_live.js', 'sim_live_us.js', 'live_broker.js']: shutil.copy(R / f, H / 'server' / 'lib' / f)
(H / '.nojekyll').write_text('')
# the app icons, drawn from icon.svg by the browser
subprocess.run(['node', str(R / 'ds' / 'make_icons.js'), str(H)], check=True)
print('hosting/ ready:', sorted(str(p.relative_to(H)) for p in H.rglob('*') if p.is_file()))

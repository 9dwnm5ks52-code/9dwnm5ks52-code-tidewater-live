#!/usr/bin/env python3
# fill the GitHub repository: the built hosting kit at its root (GitHub Pages + Actions), the full source in kaynak/
import pathlib, shutil, sys
R = pathlib.Path(__file__).resolve().parent.parent
G = pathlib.Path(sys.argv[1]).resolve()
assert (G / '.git').is_dir(), 'not a git checkout: ' + str(G)
SKIP_DIRS = {'dist', 'hosting', 'axe', '_arsiv', 'node_modules', '.git'}
# 1. the hosting kit at the root
for p in sorted((R / 'hosting').rglob('*')):
    if p.is_file():
        d = G / p.relative_to(R / 'hosting'); d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, d)
# 2. the source in kaynak/ (no build output, no npm package, no archive, no zips, no stray test screenshots at the top)
K = G / 'kaynak'; n = 0
for p in sorted(R.rglob('*')):
    rel = p.relative_to(R)
    if not p.is_file() or rel.parts[0] in SKIP_DIRS or p.suffix == '.zip' or p.name == 'tidewater-live.html': continue
    if len(rel.parts) == 1 and p.suffix == '.png': continue
    d = K / rel; d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, d); n += 1
(G / '.gitignore').write_text('# built or downloaded inside kaynak/ (rebuilt by build_live.py / build_hosting.py, axe-core comes from npm)\n'
  'kaynak/dist/\nkaynak/hosting/\nkaynak/axe/\nkaynak/_arsiv/\nnode_modules/\n*.zip\n__pycache__/\n')
print('kit + kaynak/', n, 'files')

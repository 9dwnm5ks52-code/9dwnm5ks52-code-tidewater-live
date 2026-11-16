#!/usr/bin/env python3
# Work out which files the live site, the hosting kit and the current tests still need; everything else is an
# archive candidate. Dry run by default; with --go it zips the candidates into _arsiv/ and removes them.
import pathlib, re, sys, zipfile, os, datetime
R = pathlib.Path(__file__).resolve().parent.parent
GO = '--go' in sys.argv

keep = set()
def add(p):
    p = (R / p).resolve() if not isinstance(p, pathlib.Path) else p.resolve()
    if p.exists(): keep.add(p)

# 1. what the two build scripts read
for b in ['build_live.py', 'build_hosting.py']:
    add(b); s = (R / b).read_text()
    for m in re.findall(r"'([A-Za-z0-9_./-]+\.(?:js|css|html|json|svg|yml|md|webmanifest|png|py))'", s):
        for base in ['', 'live/', 'server/', 'hosting_src/', 'ds/', 'data/']: add(base + m)
# 2. whole folders that are part of the product or its tooling
KEEP_DIRS = ['live', 'data', 'dist', 'server', 'hosting', 'hosting_src', 'axe', '_arsiv']
# 3. current tests and every local file they read or require (followed transitively)
TESTS = ['ds/t_live_app.js', 'ds/t_live_broker.js', 'ds/t_perf.js', 'ds/t_strategy.js', 'ds/t_ind.js', 'ds/t_chdata.js',
         'ds/t_srv_ui.js', 'ds/t_live.js', 'ds/t_live_data.js', 'ds/t_live_tv.js', 'ds/t_live_us.js'] +[str(p.relative_to(R)) for p in (R / 'ds').glob('t_ai_*.js')]
todo = [R / t for t in TESTS]
while todo:
    f = todo.pop()
    if not f.exists() or f.resolve() in keep and f.suffix != '.js': continue
    first = f.resolve() not in keep; add(f)
    if not first or f.suffix not in ('.js', '.py'): continue
    s = f.read_text(errors='ignore')
    for m in re.findall(r"""(?:__dirname\s*\+\s*)?['"`](?:\.\./|\./|/home/user/tidewater-live/)?([A-Za-z0-9_./-]+\.(?:js|json|html|css))['"`]""", s):
        for base in [f.parent, R, R / 'ds', R / 'live']:
            c = (base / m).resolve()
            if c.exists() and R in c.parents: todo.append(c); break
# 4. a few root files by name
for n in ['srv.sh', 'PROJECT.md', 'README.md', 'tidewater-live.html', 'tidewater-live-hosting.zip', 'ds/CHART_SPEC.md',
          'ds/zip_hosting.py', 'ds/cleanup_plan.py', 'ds/make_icons.js', 'package.json', 'package-lock.json']: add(n)

cand, size = [], 0
for p in sorted(R.rglob('*')):
    if not p.is_file(): continue
    rel = p.relative_to(R)
    if rel.parts[0] in KEEP_DIRS or rel.parts[0] == 'node_modules' or rel.parts[0].startswith('.'): continue
    if p.resolve() in keep: continue
    cand.append(p); size += p.stat().st_size
print(f'keep (outside kept folders): {len([k for k in keep if k.relative_to(R).parts[0] not in KEEP_DIRS])} files')
for k in sorted(k.relative_to(R).as_posix() for k in keep if k.relative_to(R).parts[0] not in KEEP_DIRS): print('  KEEP', k)
print(f'archive candidates: {len(cand)} files, {size/1e6:.1f} MB')
top = {}
for p in cand: k = p.relative_to(R).parts[0] if len(p.relative_to(R).parts) > 1 else '(root)'; top[k] = top.get(k, 0) + 1
print('  by folder:', top)
if GO:
    A = R / '_arsiv'; A.mkdir(exist_ok=True)
    out = A / f'tidewater-eski-dosyalar-{datetime.date.today().isoformat()}.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in cand: z.write(p, p.relative_to(R).as_posix())
    with zipfile.ZipFile(out) as z: assert z.testzip() is None and len(z.namelist()) == len(cand)
    for p in cand: p.unlink()
    for d in sorted((d for d in R.rglob('*') if d.is_dir()), key=lambda d: -len(d.parts)):
        if d.relative_to(R).parts[0] in KEEP_DIRS or d.relative_to(R).parts[0].startswith('.'): continue
        try: d.rmdir()
        except OSError: pass
    print('archived to', out.relative_to(R), f'{out.stat().st_size/1e6:.1f} MB')

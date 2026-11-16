#!/usr/bin/env python3
# pack the whole project source (code, tests, data, server, hosting kit sources, build scripts) into one zip,
# leaving out what can be rebuilt or reinstalled: dist/, hosting/, axe/ (npm package), _arsiv/ (old files), the zips
import pathlib, zipfile
R = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {'dist', 'hosting', 'axe', '_arsiv', 'node_modules', '.git'}
out = R / 'tidewater-live-kaynak.zip'
n = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(R.rglob('*')):
        rel = p.relative_to(R)
        if not p.is_file() or rel.parts[0] in SKIP_DIRS or p.suffix == '.zip' or p.name == 'tidewater-live.html': continue
        z.write(p, 'tidewater-live/' + rel.as_posix()); n += 1
with zipfile.ZipFile(out) as z: assert z.testzip() is None
print(out.name, n, 'files', round(out.stat().st_size/1e6, 2), 'MB')

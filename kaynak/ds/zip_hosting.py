#!/usr/bin/env python3
# pack hosting/ into tidewater-live-hosting.zip (folder prefix tidewater-live/)
import pathlib, zipfile
R = pathlib.Path(__file__).resolve().parent.parent; H = R / 'hosting'; out = R / 'tidewater-live-hosting.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(H.rglob('*')):
        if f.is_file(): z.write(f, 'tidewater-live/' + f.relative_to(H).as_posix())
print(out.name, out.stat().st_size, 'bytes')

// draw icon-192.png and icon-512.png from icon.svg
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async()=>{ const dir=process.argv[2], svg=fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8'); const b=await chromium.launch();
  for (const n of [192, 512]){ const p=await b.newPage({ viewport:{ width:n, height:n } }); await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}</body></html>`);
    await p.screenshot({ path:path.join(dir, `icon-${n}.png`), omitBackground:true }); await p.close(); }
  await b.close(); })();

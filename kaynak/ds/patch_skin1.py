#!/usr/bin/env python3
# glass skin, step 1: build skin.css last; the theme button becomes a moon / sun switch
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def P(path, pairs):
    p = R / path; s = p.read_text()
    for a, b in pairs:
        assert s.count(a)==1, path+': '+a[:90]; s = s.replace(a, b)
    p.write_text(s)
P('build_live.py', [("+ '\\n' + (R/'live/chui.css').read_text()", "+ '\\n' + (R/'live/chui.css').read_text() + '\\n' + (R/'live/skin.css').read_text()")])
P('live/app.js', [("function applyTheme(){ document.documentElement.dataset.tdxTheme=ST.theme; txt('lv-theme', T(ST.theme==='light'?'Dark':'Light')); }",
  "function applyTheme(){ document.documentElement.dataset.tdxTheme=ST.theme; const b=$('#lv-theme'); if (!b) return; const lt=ST.theme==='light';\n"
  "  b.classList.add('th-sw'); b.setAttribute('aria-label', L2(lt ? 'Switch to the dark theme' : 'Switch to the light theme', lt ? 'Koyu temaya geç' : 'Açık temaya geç'));\n"
  "  b.innerHTML=`<span class=\"th-i${lt ? '' : ' on'}\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\"><path d=\"M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z\"/></svg></span><span class=\"th-i${lt ? ' on' : ''}\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/></svg></span>`;\n"
  "  const m=document.querySelector('meta[name=\"theme-color\"]'); if (m) m.setAttribute('content', lt ? '#e9f3ee' : '#050e0a'); }")])
print('ok')

#!/usr/bin/env python3
"""A magyar oldalak előkészítése az angol változathoz (idempotens; a magyar szöveg változatlan):
HU | EN nyelvváltó (a választás megmarad: localStorage 'alap-lang'), a magyar oldal az angolra irányít, ha legutóbb azt
választották (a ?hu paraméter kikerüli), hreflang. A lejátszóban a váltás ugyanarra az időpontra visz (#t=…).
usage: cd i18n && python3 prep_hu.py"""
import os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def edit(rel, pairs):
    p = os.path.join(R, rel); s = open(p, encoding='utf-8').read(); s0 = s
    for mark, old, new in pairs:
        if mark in s: continue                     # már megvan
        assert s.count(old) == 1, (rel, old[:60]); s = s.replace(old, new)
    if s != s0: open(p, 'w', encoding='utf-8').write(s); print('módosítva:', rel)
    else: print('változatlan:', rel)

REDIR = "<script>/*nyelv*/try{if(localStorage.getItem('alap-lang')==='en'&&!/[?&]hu\\b/.test(location.search))location.replace('en/'+location.hash)}catch(e){}</script>"
HREF = lambda base: (f'<link rel="alternate" hreflang="hu" href="https://cfa-colop-3d.vercel.app{base}">\n'
                     f'<link rel="alternate" hreflang="en" href="https://cfa-colop-3d.vercel.app{base}en/">\n'
                     f'<link rel="alternate" hreflang="x-default" href="https://cfa-colop-3d.vercel.app{base}">\n')

# 1. lejátszó (index.html): átirányítás + hreflang a fejben
edit('index.html', [
    ('/*nyelv*/', '<script>window.__PLAYER=true</script>', '<script>window.__PLAYER=true</script>' + REDIR),
    ('hreflang="en"', '</title>\n', '</title>\n' + HREF('/')),
])

# 2. a lejátszó sávja: HU | EN kapcsoló; a váltás az aktuális időpontot is viszi (#t=…), betöltéskor oda ugrik
edit('js/player.js', [
    ('#ply .lang', "  #stage{transform-origin:0 0}",
     "  #ply .lang{flex:none;display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid rgba(255,255,255,.22);border-radius:999px;text-decoration:none;color:inherit;font:500 12px/1 Inter,system-ui,sans-serif;letter-spacing:.04em}\n"
     "  #ply .lang b,#ply .lang span{display:inline-grid;place-items:center;min-width:30px;padding:5px 8px;border-radius:999px}\n"
     "  #ply .lang b{background:#eef1f4;color:#141a20;font-weight:600}\n  #ply .lang span{opacity:.75}\n  #ply .lang:hover span{opacity:1;background:rgba(255,255,255,.12)}\n"
     "  #stage{transform-origin:0 0}"),
    ('id="lang"', '<div class="ph" id="phs"></div>`;',
     '<div class="ph" id="phs"></div>` + (EN ? \'<a class="lang" id="lang" href="../" hreflang="hu" lang="hu" aria-label="Magyar változat"><span>HU</span><b>EN</b></a>\' : \'<a class="lang" id="lang" href="en/" hreflang="en" lang="en" aria-label="English version"><b>HU</b><span>EN</span></a>\');'),
    ('const EN =', "  const css = `", "  const EN = (document.documentElement.lang || '').toLowerCase().startsWith('en');\n  const css = `"),
    ('alap-lang', "  sc.oninput = () => { show(sc.value / 1000 * DUR); };",
     "  sc.oninput = () => { show(sc.value / 1000 * DUR); };\n"
     "  // nyelvváltó: a választás megmarad (alap-lang), a másik nyelvű lejátszó ugyanott folytatódik (#t=…)\n"
     "  const lg = bar.querySelector('#lang'); if (lg) lg.addEventListener('click', () => { try { localStorage.setItem('alap-lang', EN ? 'hu' : 'en'); } catch (e) {} lg.setAttribute('href', (EN ? '../' : 'en/') + (t > 0 ? '#t=' + t.toFixed(1) : '')); });"),
    ('const t0 =', "  const wait = () => { if (window.__ready) { show(0); fit(); } else setTimeout(wait, 50); }; wait();",
     "  const t0 = (/[#&]t=([\\d.]+)/.exec(location.hash) || [])[1];\n"
     "  const wait = () => { if (window.__ready) { show(t0 ? +t0 : 0); fit(); } else setTimeout(wait, 50); }; wait();"),
])

# 3. AR-oldal: nyelvváltó a fejléc címkesorában (mint az AR laborban), átirányítás, hreflang
LANGCSS = (".langbtn{flex:none; display:inline-flex; align-items:center; gap:2px; padding:3px; border:1px solid rgba(255,255,255,.22); border-radius:999px; text-decoration:none; color:inherit; font:500 12px/1 var(--fm); letter-spacing:.04em}\n"
           ".langbtn b, .langbtn span{display:inline-grid; place-items:center; min-width:30px; padding:5px 8px; border-radius:999px}\n"
           ".langbtn b{background:#eef1f4; color:#141a20; font-weight:600}\n.langbtn span{opacity:.75}\n.langbtn:hover span{opacity:1; background:rgba(255,255,255,.12)}\n")
edit('ar/index.html', [
    ('/*nyelv*/', '<base href="/ar/">\n', '<base href="/ar/">\n' + REDIR + '\n' + HREF('/ar/')),
    ('.langbtn{', '.kick .tag{border:1px solid var(--nline); border-radius:999px; padding:3px 10px; color:var(--accent-2)}\n', '.kick .tag{border:1px solid var(--nline); border-radius:999px; padding:3px 10px; color:var(--accent-2)}\n' + LANGCSS),
    ('id="langSw"', '<span class="tag">AR-teszt</span></div>',
     '<span class="tag">AR-teszt</span>\n    <a class="langbtn" id="langSw" href="en/" hreflang="en" lang="en" aria-label="English version"><b>HU</b><span>EN</span></a></div>'),
    ("localStorage.setItem('alap-lang'", "const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));",
     "const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));\n"
     "/* nyelvváltó: a választás megmarad (alap-lang) */\n"
     "{ const sw = document.getElementById('langSw'); if (sw) sw.addEventListener('click', () => { try { localStorage.setItem('alap-lang', (document.documentElement.lang || '').startsWith('en') ? 'hu' : 'en'); } catch (e) {} }); }"),
])

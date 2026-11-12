#!/usr/bin/env python3
"""A CFA-cölöp 3D-animáció angol változata (en-GB) a magyar forrásból:
  /en/        ← index.html  (lejátszó; a szövegek a js/main.en.js-ben, js/machines.en.js, js/player.en.js)
  /ar/en/     ← ar/index.html (AR-oldal; az angol feliratos modellek: ar/cfa-makett-feliratok-en.glb / .usdz)
Fordítás: i18n/apply.mjs + en_tm.tsv (fordítási emlékezet: a CFA-videó és az AR labor angol szövegei) + en_01.tsv + en_02.tsv
(STRICT: hiányzó magyar szövegnél leáll → i18n/missing.tsv). A magyar oldalak előkészítése: prep_hu.py (nyelvváltó).
Az angol buildben: tizedespont, en-gb elválasztás (vendor/hyphenopoly/patterns/en-gb.wasm), a társoldalak /en változata.
usage: cd i18n && python3 build_en.py   (előfeltétel: npm install)"""
import os, sys, subprocess, shutil, re
I = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(I); OUT = I + '/out'
FILES = ['index.html', 'js/main.js', 'js/machines.js', 'js/player.js', 'ar/index.html']
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
tsv = ','.join(I + '/' + f for f in ['en_tm.tsv', 'en_01.tsv', 'en_02.tsv'])
r = subprocess.run(['node', I + '/apply.mjs', R, OUT, tsv] + FILES, capture_output=True, text=True, cwd=I, env={**os.environ, 'STRICT': '1', 'NUMFIX': '1'})
print(r.stdout.strip().split('\n')[-1])
if r.returncode: print(r.stderr[-2000:]); sys.exit(1)
rd = lambda f: open(os.path.join(OUT, f), encoding='utf-8').read()
def wr(rel, s):
    p = os.path.join(R, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w', encoding='utf-8').write(s); print('  →', rel, len(s) // 1024, 'KB')
def rep(s, a, b, n=1):
    assert s.count(a) == n, (a[:70], s.count(a)); return s.replace(a, b)
HYPH = [('H.hyphenators.hu', "H.hyphenators['en-gb']")]

# lejátszó
s = rd('index.html')
s = rep(s, '<html lang="hu">', '<html lang="en-GB">')
s = rep(s, "<script>/*nyelv*/try{if(localStorage.getItem('alap-lang')==='en'&&!/[?&]hu\\b/.test(location.search))location.replace('en/'+location.hash)}catch(e){}</script>", '')
s = s.replace('url(fonts/', 'url(../fonts/')
s = rep(s, '<script src="vendor/hyphenopoly/Hyphenopoly_Loader.js">', '<script src="../vendor/hyphenopoly/Hyphenopoly_Loader.js">')
s = rep(s, '{ "hu": "FORCEHYPHENOPOLY" }', '{ "en-gb": "FORCEHYPHENOPOLY" }')
s = rep(s, '<script type="module" src="js/main.js">', '<script type="module" src="../js/main.en.js">')
s = rep(s, "s.src = 'js/player.js'", "s.src = '../js/player.en.js'")
wr('en/index.html', s)
m = rd('js/main.js')
m = rep(m, "from './machines.js'", "from './machines.en.js'")
m = rep(m, ".toFixed(d).replace('.', ',')", '.toFixed(d)')
m = rep(m, 'H.hyphenators && H.hyphenators.hu) HY = await Promise.race([H.hyphenators.hu.catch', "H.hyphenators && H.hyphenators['en-gb']) HY = await Promise.race([H.hyphenators['en-gb'].catch")
wr('js/main.en.js', m)
wr('js/machines.en.js', rd('js/machines.js'))
wr('js/player.en.js', rd('js/player.js'))
for f in ['js/main.en.js', 'js/machines.en.js', 'js/player.en.js']:
    r = subprocess.run(['node', I + '/numfix_js.mjs', os.path.join(R, f)], capture_output=True, text=True, env={**os.environ, 'MODULE': '1'} if 'player' not in f else None)
    if r.returncode: print(r.stderr); sys.exit(1)
    r = subprocess.run(['node', I + '/en_nbsp.mjs', os.path.join(R, f)], capture_output=True, text=True)   # névelő után nem törő szóköz
    if r.returncode: print(r.stderr); sys.exit(1)

# AR-oldal (a <base href="/ar/"> miatt a relatív utak változatlanok)
a = rd('ar/index.html')
a = rep(a, '<html lang="hu">', '<html lang="en-GB">')
a = rep(a, "<script>/*nyelv*/try{if(localStorage.getItem('alap-lang')==='en'&&!/[?&]hu\\b/.test(location.search))location.replace('en/'+location.hash)}catch(e){}</script>\n", '')
a = rep(a, '{ "hu": "FORCEHYPHENOPOLY" }', '{ "en-gb": "FORCEHYPHENOPOLY" }')
a = rep(a, 'H.hyphenators && H.hyphenators.hu) H.hyphenators.hu.then', "H.hyphenators && H.hyphenators['en-gb']) H.hyphenators['en-gb'].then")
a = rep(a, "/(^|[\\s(\\u00A0\\u2060„])(a|az|A|Az|s|e|egy|Egy|és|És) (?=\\S)/g", "/(^|[\\s(\\u00A0\\u2060“])(a|an|A|An|the|The) (?=\\S)/g")   # angol tördelési szabály: névelő nem marad a sor végén
a = rep(a, 'href="https://cfa-colop-3d.vercel.app/"', 'href="https://cfa-colop-3d.vercel.app/en/"')
a = rep(a, 'href="https://melyalapozasok.vercel.app/"', 'href="https://melyalapozasok.vercel.app/en"')
wr('ar/en/index.html', a)
for f in ['vendor/hyphenopoly/patterns/en-gb.wasm', 'ar/vendor/hyphenopoly/patterns/en-gb.wasm']:
    p = os.path.join(R, f)
    if not os.path.exists(p): shutil.copy('/home/claude/bme-alapozas/ar-labor/vendor/hyphenopoly/patterns/en-gb.wasm', p); print('  →', f)
shutil.rmtree(OUT)

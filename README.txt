CFA cölöp – 3D technológiai animáció (Claude)

index.html   – interaktív lejátszó (lejátszás/szünet, csúszka, fázisugrás). Helyi fájlként megnyitva a böngészők tiltják az ES-modulokat,
               ezért egy egyszerű helyi webszerverről kell futtatni, pl. a mappában:  python -m http.server 8000   →  http://localhost:8000/index.html
               (vagy feltölthető Vercelre / GitHub Pages-re, ahogy a többi interaktív oldal.)
scene.html   – ugyanez lejátszó nélkül (a videó-rendereléshez használt oldal; ?play=1 paraméterrel lejátszóval).
js/main.js   – idővonal, kamerák, feliratok, HUD, címkék (minden szöveg itt szerkeszthető)
js/machines.js – gépek 3D-modelljei (fúrógép, spirál, szivattyú, mixer, kotró, daru, armatúra, talajtömb)
render.py    – videó renderelése: python render.py --html scene.html --out ki.mp4 --fps 30 --gpu --crf 20
               (szükséges: pip install playwright imageio-ffmpeg ; python -m playwright install chromium)

ANGOL VÁLTOZAT (en-GB, 2026-11-12)
en/index.html      – a lejátszó angolul (https://cfa-colop-3d.vercel.app/en/); szövegei: js/main.en.js, js/machines.en.js, js/player.en.js
ar/en/index.html   – az AR-oldal angolul (/ar/en/); angol feliratos modellek: ar/cfa-makett-feliratok-en.glb / .usdz (az AR laboréval azonos)
Készítés a magyar forrásból:  cd i18n && npm install && python3 build_en.py
  fordítás: i18n/en_tm.tsv (fordítási emlékezet: a CFA-videó és az AR labor angol szövegei), en_01.tsv, en_02.tsv; azonosító = a magyar szöveg sha1-ének első 7 jegye;
  ha a magyar szöveg változik és nincs hozzá fordítás, a build leáll (i18n/missing.tsv); munkalap: node i18n/worksheet.mjs . index.html js/main.js js/machines.js js/player.js ar/index.html
  az angol buildben: tizedespont, en-gb elválasztás, a névelő után nem törő szóköz (i18n/en_nbsp.mjs), a társoldalak /en változata.
i18n/prep_hu.py    – a magyar oldalak nyelvváltója (HU | EN; a választás megmarad: localStorage 'alap-lang'; a lejátszóban a váltás ugyanarra az időpontra visz: #t=…);
                     a magyar oldal az angolra irányít, ha legutóbb azt választották (?hu kikerüli). Idempotens.
A scene.html (videórenderelés) csak magyar.


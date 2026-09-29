CFA cölöp – 3D technológiai animáció (Claude)

index.html   – interaktív lejátszó (lejátszás/szünet, csúszka, fázisugrás). Helyi fájlként megnyitva a böngészők tiltják az ES-modulokat,
               ezért egy egyszerű helyi webszerverről kell futtatni, pl. a mappában:  python -m http.server 8000   →  http://localhost:8000/index.html
               (vagy feltölthető Vercelre / GitHub Pages-re, ahogy a többi interaktív oldal.)
scene.html   – ugyanez lejátszó nélkül (a videó-rendereléshez használt oldal; ?play=1 paraméterrel lejátszóval).
js/main.js   – idővonal, kamerák, feliratok, HUD, címkék (minden szöveg itt szerkeszthető)
js/machines.js – gépek 3D-modelljei (fúrógép, spirál, szivattyú, mixer, kotró, daru, armatúra, talajtömb)
render.py    – videó renderelése: python render.py --html scene.html --out ki.mp4 --fps 30 --gpu --crf 20
               (szükséges: pip install playwright imageio-ffmpeg ; python -m playwright install chromium)

// CFA cölöp – determinisztikus, időalapú 3D animáció. window.__setTime(t) rendereli a t másodperchez tartozó képet.
import * as THREE from '../lib/three.module.min.js';
import * as MM from './machines.js';

// ---------- segédfüggvények ----------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const ease = x => x * x * (3 - 2 * x);
const easeOut = x => 1 - (1 - x) * (1 - x);
const lerp = (a, b, x) => a + (b - a) * x;
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// magyar tipográfia: rövid szavak, szám+egység, kötőjelek nem törhetők
const NBSP = ' ', WJ = '⁠';
function typo(s) {
  return s.replace(/(^|[\s(„"'»–—])(a|az|s|e|é|és|is)(?: )(?=\S)/gi, '$1$2' + NBSP)
    .replace(/(\d) (?=(?:kPa|MPa|kNm|kN|m³|m²|m\/min|m\/s|cm|mm|km|kg|bar|°C|°|%|m|t|óra|nap|hét|hónap|év|db|l\/min|1\/min)(?:[\s.,;:!?)\]–—]|$))/g, '$1' + NBSP)
    .replace(/([.!?…][)"'»”’]?\s+\S+) (?=\S)/g, '$1' + NBSP)
    .replace(/([0-9A-Za-zÀ-ſ])([-–—])([0-9A-Za-zÀ-ſ])/g, '$1' + WJ + '$2' + WJ + '$3');
}
function setHTML(el, html) { if (el.__last !== html) { el.innerHTML = html; el.__last = html; } }
// magyar elválasztás (Hyphenopoly, ha betöltődött): lágy kötőjel csak a címkéken kívüli, legalább 6 betűs szavakba (formázás skill 0. és 4. pont)
let HY = null, lastT = 0;
function hy(html) { if (!HY) return html; return html.split(/(<[^>]+>)/).map((p) => (p.startsWith('<') ? p : p.replace(/[\p{L}\u00AD]{6,}/gu, (w) => (w.includes('\u00AD') ? w : HY(w).replace(/\u200B/g, ''))))).join(''); }
// sorkizárt panel: ha keskeny sorban túl nagy lyuk maradna, balra zárt
function ragHoley(el) {
  const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize); const all = document.createRange(); all.selectNodeContents(el); const rs = all.getClientRects(); if (rs.length < 2) return false;
  let lastTop = -1e9; for (const r of rs) if (r.width && r.top > lastTop) lastTop = r.top; let big = 0, mid = 0;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const t = n.nodeValue; for (let i = 0; i < t.length; i++) { if (t[i] !== ' ' && t[i] !== '\u00A0') continue; const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); if (!b.width || b.top >= lastTop - 2) continue; if (b.width > fs * 1.15) big++; else if (b.width > fs * 0.9) mid++; } }
  return big > 0 || mid >= 2;
}
// sorkizárt panel: ha lyukas, előbb sima tördelés (text-wrap: wrap, sorkizárt marad), csak utána balra zárt (a panelekben nincs puha kötés)
function ragFit(el) {
  el.classList.remove('rag', 'twr'); if (getComputedStyle(el).textAlign !== 'justify') return;
  if (!ragHoley(el)) return; el.classList.add('twr'); if (!ragHoley(el)) return;
  el.classList.remove('twr'); el.classList.add('rag');
}
try { const st = document.createElement('style'); st.textContent = '.twr{text-wrap:wrap!important}'; document.head.appendChild(st); } catch (e) {}
function setPanel(el, html) { const h = hy(html).trim(); if (el.__last !== h) { el.innerHTML = h; el.__last = h; ragFit(el); } }
function setText(el, s) { if (el.__last !== s) { el.textContent = s; el.__last = s; } }

// ---------- paraméterek ----------
const PILE = { D: 0.8, L: 16, cageL: 12, cutoff: 1.0 };
const AUG = { stemR: 0.14, flightR: PILE.D / 2, pitch: 0.6, length: 20 };
const THEO = Math.PI / 4 * PILE.D * PILE.D; // elméleti m³/m
const CLEANER_Y = 1.1;
const NEXT_X = 9; // következő cölöp helye

// idővonal (s)
const T = { intro: [0, 6], pos: [6, 20], drill: [20, 56], bottom: [56, 64], extract: [64, 102], clean: [102, 116], cage: [116, 140], head: [140, 156], done: [156, 172] };
const DUR = 172;
const PHASES = [
  { key: 'pos', name: 'Pontraállás', t: T.pos },
  { key: 'drill', name: 'Fúrás', t: T.drill },
  { key: 'bottom', name: 'Betonindítás', t: T.bottom },
  { key: 'extract', name: 'Kihúzás + betonozás', t: T.extract },
  { key: 'clean', name: 'Furadék', t: T.clean },
  { key: 'cage', name: 'Vasalás', t: T.cage },
  { key: 'head', name: 'Fejkialakítás', t: T.head },
  { key: 'done', name: 'Kész cölöp', t: T.done },
];

const colors = {
  rigBody: 0xf4f4f2, rigAccent: 0x1e63b8, augerSteel: 0x6d7580, augerFlight: 0x8d949c, spoil: 0x6f5a3e,
  pump: 0xe6e6e6, pumpAccent: 0x1e63b8, mixerCab: 0xf2f2f2, mixerDrum: 0xececec, mixerStripe: 0x1e63b8,
  excavator: 0xf0b323, crane: 0xc8102e, rebar: 0x8a6a45, vest: 0xff7a00, concrete: 0xc9c6bd, concreteWet: 0xa9a59c,
};
function speckleTex(base, spots, density, size, repeat) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < density; i++) { g.fillStyle = spots[Math.floor(rnd() * spots.length)]; const r = size * (0.4 + rnd()); g.beginPath(); g.ellipse(rnd() * 512, rnd() * 512, r, r * (0.6 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2); g.fill(); }
  const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(repeat, repeat); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx;
}
const LAYERS = [
  { name: 'Feltöltés', top: 0, bottom: 1.5, color: 0xffffff, map: speckleTex('#8f8878', ['#847d70', '#9a9282', '#7a746a', '#a49c8c'], 3200, 3.2, 0.4) },
  { name: 'Agyag', top: 1.5, bottom: 6.5, color: 0xffffff, map: speckleTex('#9c7a55', ['#94734f', '#a4825b', '#98764f'], 700, 12, 0.18) },
  { name: 'Iszapos homok', top: 6.5, bottom: 11, color: 0xffffff, map: speckleTex('#c4aa7c', ['#b89c6e', '#cdb48a', '#ae9466'], 3200, 3, 0.35) },
  { name: 'Homok', top: 11, bottom: 17.5, color: 0xffffff, map: speckleTex('#dcc27e', ['#d0b46e', '#e6cf92', '#c9ad68'], 4200, 2.5, 0.4) },
  { name: 'Kavics', top: 17.5, bottom: 34, color: 0xffffff, map: speckleTex('#a79a84', ['#8a8074', '#bfb39d', '#948a7e', '#b3a792', '#7e766b'], 2200, 5.5, 0.3) },
];
const GW = -4.2; // talajvízszint

// ---------- renderer, jelenet ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1920, 1080, false); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd6e4ef, 120, 320);
// égbolt-gradiens
{
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x6fa8dc) }, mid: { value: new THREE.Color(0xcfe3f2) }, bot: { value: new THREE.Color(0xe9eef2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h>0.0 ? mix(mid, top, pow(h,0.6)) : mix(mid, bot, clamp(-h*3.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }',
  });
  scene.add(new THREE.Mesh(geo, mat));
}
const sun = new THREE.DirectionalLight(0xfff1dd, 2.4); sun.position.set(40, 70, 55); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); sun.shadow.camera.left = -50; sun.shadow.camera.right = 50; sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50; sun.shadow.camera.near = 10; sun.shadow.camera.far = 250; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x8a7a5a, 0.85));
const fill = new THREE.DirectionalLight(0xbfd4ff, 0.5); fill.position.set(-40, 30, 20); scene.add(fill);

// talaj
const W = 55, DZ = 40;
const soil = MM.buildSoil(LAYERS, W, DZ, AUG.flightR * 1.04); scene.add(soil);
// munkaszint (a tömb tetején vékony réteg, kavicsos szín) és távoli terep
const platform = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, DZ), MM.M(0x9a917f, { roughness: 1 })); platform.rotation.x = -Math.PI / 2; platform.position.set(0, 0.012, -DZ / 2); platform.receiveShadow = true; scene.add(platform);
const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), MM.M(0x9fa78f, { roughness: 1 })); far.rotation.x = -Math.PI / 2; far.position.set(0, -0.02, -DZ - 450); scene.add(far);
const farL = new THREE.Mesh(new THREE.PlaneGeometry(400, DZ + 2), MM.M(0x9fa78f, { roughness: 1 })); farL.rotation.x = -Math.PI / 2; farL.position.set(-W - 200, -0.02, -DZ / 2); scene.add(farL);
const farR = farL.clone(); farR.position.x = W + 200; scene.add(farR);
// talajvíz jelölés a homlokfelületen
const gwLine = MM.box(W * 2, 0.07, 0.05, MM.M(0x3d9be9, { emissive: 0x1b5fa0, emissiveIntensity: 0.5 }), 0, GW, 0.03, false); scene.add(gwLine);
// kivágatlan talaj „sapka” a horony előtt (klippelve a fúrás mélységével)
const capClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
const capGroup = new THREE.Group(); scene.add(capGroup);
for (const L of LAYERS) {
  const h = L.bottom - L.top;
  const k = L.map.repeat.x; const tx = L.map.clone(); tx.repeat.set(AUG.flightR * 2.08 * k, h * k); tx.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(AUG.flightR * 2.08, h), new THREE.MeshStandardMaterial({ color: L.color, map: tx, roughness: 0.95, clippingPlanes: [capClip] }));
  m.position.set(0, -L.top - h / 2, 0.004); m.receiveShadow = true; capGroup.add(m);
}
// beton (a hátsó félhenger, metszetben) + betonfej
const concClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), -100);
const concMat = MM.M(colors.concrete, { roughness: 0.85, clippingPlanes: [concClip], side: THREE.DoubleSide });
const concrete = new THREE.Mesh(new THREE.CylinderGeometry(AUG.flightR * 0.985, AUG.flightR * 0.985, PILE.L + 0.3, 36, 1, true, Math.PI / 2, Math.PI), concMat);
concrete.position.set(0, (-PILE.L + 0.3) / 2, 0); concrete.receiveShadow = true; scene.add(concrete);
const concBottom = new THREE.Mesh(new THREE.CircleGeometry(AUG.flightR * 0.985, 36, Math.PI, Math.PI), concMat); concBottom.rotation.x = -Math.PI / 2; concBottom.position.y = -PILE.L; scene.add(concBottom);
const concTopCap = new THREE.Mesh(new THREE.CircleGeometry(AUG.flightR * 0.985, 36, 0, Math.PI), MM.M(colors.concreteWet, { roughness: 0.6 })); concTopCap.rotation.x = -Math.PI / 2; concTopCap.rotation.z = Math.PI; scene.add(concTopCap); concTopCap.visible = false;
// betonkitüremkedés a felszínen (túlbetonozás)
const overpour = new THREE.Mesh(new THREE.CylinderGeometry(AUG.flightR * 1.5, AUG.flightR * 1.9, 0.3, 32, 1, false, Math.PI / 2, Math.PI), MM.M(colors.concreteWet, { roughness: 0.7 })); overpour.position.y = 0.15; overpour.visible = false; scene.add(overpour);
// fejtömb (cölöpösszefogó), fél tömb a metszet miatt
const capBlock = new THREE.Group(); scene.add(capBlock);
{ const b = MM.box(2.6, 1.2, 1.3, MM.M(0xcfccc4, { roughness: 0.8 }), 0, 0.6, -0.65); capBlock.add(b); capBlock.position.y = -PILE.cutoff; capBlock.scale.y = 0.0001; capBlock.visible = false; }

// gépek
const rig = MM.buildRig(colors); scene.add(rig);
const RU = rig.userData;
const auger = MM.buildAuger({ ...AUG, colors }); scene.add(auger);
const AU = auger.userData;
const sfClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); const sfClip2 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000); AU.soilFill.material = AU.soilFill.material.clone(); AU.soilFill.material.clippingPlanes = [sfClip, sfClip2];
const stemGlass = MM.M(0x9fb3c8, { metalness: 0.2, roughness: 0.2, transparent: true, opacity: 0.35 });
const stemConcrete = MM.cyl(AUG.stemR * 0.72, AUG.stemR * 0.72, AUG.length, MM.M(colors.concreteWet, { roughness: 0.6 }), 0, AUG.length / 2, 0, 14); stemConcrete.visible = false; auger.add(stemConcrete);
const tipConcrete = MM.cyl(AUG.flightR * 0.9, AUG.flightR * 0.9, 0.001, MM.M(colors.concreteWet, { roughness: 0.6 }), 0, 0, 0, 24); tipConcrete.visible = false; auger.add(tipConcrete);
const plug = MM.cyl(AUG.stemR * 0.92, AUG.stemR * 0.8, 0.14, MM.M(0xe0662a, { roughness: 0.6 }), 0, -0.03, 0, 16); auger.add(plug); AU.flap.visible = false;
const pump = MM.buildPump(colors); pump.position.set(16.5, 0, -6.0); pump.rotation.y = Math.PI / 2 + 0.25; scene.add(pump);
const mixer = MM.buildMixer(colors); mixer.position.set(25, 0, -8.5); mixer.rotation.y = Math.PI + 0.25; scene.add(mixer);
const excavator = MM.buildExcavator(colors); excavator.position.set(-7.5, 0, -7.5); excavator.rotation.y = 0.75; scene.add(excavator);
const crane = MM.buildCrane(colors); crane.position.set(-14, 0, -13); scene.add(crane);
const cage = MM.buildCage({ length: PILE.cageL, radius: PILE.D / 2 - 0.09, colors, barsAbove: 1.3 }); scene.add(cage);
const cage2 = MM.buildCage({ length: PILE.cageL, radius: PILE.D / 2 - 0.09, colors, barsAbove: 1.3 }); cage2.rotation.x = -Math.PI / 2; cage2.position.set(-24.5, 0.5, -2.5); scene.add(cage2);
const vibrator = MM.box(0.7, 0.5, 0.5, MM.M(0xf0b323), 0, 0, 0); vibrator.visible = false; scene.add(vibrator);
// hullámgyűrűk a betontükrön (armatúra süllyesztése)
const ripples = [];
for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.34, 40, 1, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.31; scene.add(m); ripples.push(m); }
// beomló furatfal a hibás (túl gyors kihúzás) közelképhez: fél tórusz a horony hátsó felében
const neck = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.21, 10, 28, Math.PI), MM.M(0x7a6448, { roughness: 1 })); neck.rotation.x = -Math.PI / 2; neck.visible = false; scene.add(neck);
const neck2 = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.16, 10, 28, Math.PI), MM.M(0x8a7455, { roughness: 1 })); neck2.rotation.x = -Math.PI / 2; neck2.visible = false; scene.add(neck2);
// második cölöp kész feje (időugrás után): kiálló vasak + fejtömb
const pile2 = new THREE.Group(); pile2.position.set(NEXT_X, 0, 0); pile2.visible = false; scene.add(pile2);
{ const st = MM.M(colors.rebar, { metalness: 0.35, roughness: 0.6 }); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; pile2.add(MM.cyl(0.03, 0.03, 1.8, st, Math.cos(a) * 0.31, -PILE.cutoff + 0.9, Math.sin(a) * 0.31, 8)); } pile2.add(MM.cyl(AUG.flightR, AUG.flightR, 0.02, MM.M(colors.concrete), 0, -PILE.cutoff, 0, 32)); }
const pile2cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6).translate(0, 0.6, -1.3), MM.M(0xcfccc4, { roughness: 0.8 })); pile2cap.castShadow = true; pile2cap.receiveShadow = true; pile2cap.position.set(NEXT_X, -PILE.cutoff, 0); pile2cap.visible = false; scene.add(pile2cap);
const heap = MM.buildSpoilHeap(colors.spoil); heap.position.set(-2.7, 0, -3.0); scene.add(heap);
const stock = MM.buildSpoilHeap(colors.spoil); stock.position.set(-9, 0, -13.5); scene.add(stock);
const P_PICK = V3(-22, 0, -3); // kosár állóhelye felvételkor (alsó vég)
// gerendák a kosár alatt
for (const z of [-4.5, -9, -13.5]) { scene.add(MM.box(0.3, 0.3, 1.6, MM.M(0x8b6b3e), -22, 0.15, z)); scene.add(MM.box(0.3, 0.3, 1.6, MM.M(0x8b6b3e), -24.5, 0.15, z)); }
// mélységi vonalzó a metszeten
const ruler = new THREE.Group(); scene.add(ruler);
{ const wm = MM.M(0xf5f5f5, { emissive: 0x555555, emissiveIntensity: 0.4 }); ruler.add(MM.box(0.06, 20, 0.04, wm, -2.4, -10, 0.03, false)); for (let d = 0; d <= 20; d++) ruler.add(MM.box(d % 2 === 0 ? 0.5 : 0.3, 0.05, 0.04, wm, -2.4 + (d % 2 === 0 ? 0.25 : 0.15), -d, 0.03, false)); }
// kitűzési karók
const pegs = [];
for (const x of [0, NEXT_X, NEXT_X * 2]) { const g = new THREE.Group(); g.add(MM.cyl(0.03, 0.03, 0.8, MM.M(0xe0e0e0), 0, 0.4, 0, 6)); g.add(MM.box(0.28, 0.16, 0.02, MM.M(0xff3fa0), 0.14, 0.75, 0)); g.position.set(x, 0, -0.6); scene.add(g); pegs.push(g); }
// betontömlő: földi szakasz a szivattyútól az árboctalpig, majd fel az árbocon a forgatófejig (dinamikus)
const hoseMat = MM.M(0x2f3439, { roughness: 0.7 });
let hoseMesh = null;
function updateHose(rigX, headY) {
  const pts = [V3(14.4, 1.0, -5.4), V3(10, 0.35, -3.6), V3(5.5, 0.3, -2.2), V3(rigX + 1.05, 0.5, -0.9), V3(rigX + 0.95, 2.0, -1.1), V3(rigX + 0.95, Math.max(3.5, headY + 0.5), -1.1), V3(rigX + 0.75, headY + 2.9, -0.5), V3(rigX + 0.15, headY + 3.0, 0.0)];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  const geo = new THREE.TubeGeometry(curve, 90, 0.09, 8, false);
  if (!hoseMesh) { hoseMesh = new THREE.Mesh(geo, hoseMat); hoseMesh.castShadow = true; scene.add(hoseMesh); } else { hoseMesh.geometry.dispose(); hoseMesh.geometry = geo; }
}
// munkások
const w1 = MM.buildWorker(colors); w1.position.set(-3.2, 0, -2.2); scene.add(w1);
const w2 = MM.buildWorker(colors); w2.position.set(2.2, 0, -1.0); w2.rotation.y = 2.4; w2.visible = false; scene.add(w2);
const breaker = MM.cyl(0.05, 0.07, 1.4, MM.M(0xf0b323), 0, 0, 0, 8); breaker.visible = false; scene.add(breaker);
// telephely-kellékek: konténer, csigák, kerítés
scene.add(MM.box(6, 2.6, 2.4, MM.M(0x4b6d8c), -30, 1.3, -22)); scene.add(MM.box(6.05, 0.15, 2.45, MM.M(0xe8eef2), -30, 2.65, -22));
for (let i = 0; i < 3; i++) scene.add(MM.cyl(0.42, 0.42, 12, MM.M(0x6d7580, { metalness: 0.5 }), -20 + i * 1.0, 0.42, -26 + i * 0.1, 16).rotateZ(Math.PI / 2));
// részecskék
const spoilParts = MM.buildParticles(160, 0x5e4b33, 0.16); scene.add(spoilParts);
const chunkParts = MM.buildParticles(60, 0xb8b4aa, 0.14); scene.add(chunkParts);
const dustParts = MM.buildParticles(90, 0x8a7550, 0.38); dustParts.material.opacity = 0.6; scene.add(dustParts);
function seeded(i, k) { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }

// kamerák
const cam = new THREE.PerspectiveCamera(36, 1920 / 1080, 0.3, 900);
const insetCam = new THREE.PerspectiveCamera(34, 560 / 400, 0.1, 400);
const INSET = { x: 1920 - 40 - 560, y: 170, w: 560, h: 400 }; // képernyő-koordináták (bal-felső origó -> WebGL alsó origó számítva)

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const tabsEl = $('tabs');
tabsEl.innerHTML = PHASES.map((p, i) => `<div class="tab" id="tab_${p.key}"><span class="n">${i + 1}</span>${p.name}</div>`).join('');
const labelsEl = $('labels');
const RULER_T = [[20, 102], [140, 172]];
const LABELS = [
  ...[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map(d => ({ id: 'r' + d, cls: 'rl', text: (d === 0 ? '±0' : '−' + d) + ' m', t: RULER_T, pos: () => V3(-2.75, -d, 0.05) })),
  ...LAYERS.filter(L => L.bottom < 30).map((L, i) => ({ id: 'ln' + i, cls: 'ln', text: L.name, t: [[20, 56], [156, 172]], pos: () => V3(-7.5, -(L.top + Math.min(L.bottom, 24)) / 2, 0.05) })),
  { id: 'ln4', cls: 'ln', text: 'Kavics (teherbíró réteg)', t: [[44, 56], [156, 172]], pos: () => V3(-7.5, -19.5, 0.05) },
  { id: 'peg', text: 'Kitűzött cölöptengely', t: [8, 18], pos: () => V3(0, 0.9, -0.6) },
  { id: 'head', text: 'Forgatófej a vezetősínen', t: [20.5, 27], pos: () => V3(RU.mastX + rig.position.x, state.headY + 1.4, 0.9) },
  { id: 'aug', text: 'Üreges szárú spirálfúró', t: [20.5, 27], pos: () => V3(0.5, Math.max(1.5, state.tipY + 6), 0.4) },
  { id: 'gw', text: 'Talajvíz', t: [30, 42], pos: () => V3(-6, GW, 0.1) },
  
  { id: 'pump', text: 'Betonszivattyú', t: [56.5, 63], pos: () => V3(16.5, 2.8, -6.0) },
  { id: 'mixer', text: 'Mixer', t: [56.5, 63], pos: () => V3(25, 4.6, -8.5) },
  { id: 'hose', text: 'Betontömlő a fúrószárhoz', t: [56.5, 63], pos: () => V3(rig.position.x + RU.mastX + 0.95, 7.5, -1.1) },
  { id: 'cleaner', text: 'Spiráltisztító', t: [66, 73], pos: () => V3(-0.9, CLEANER_Y + 0.35, 0.9) },
  { id: 'heap', text: 'Furadék', t: [74, 84], pos: () => V3(-2.7, state.heapH + 0.2, -3.0) },
  { id: 'conc', text: 'Friss beton nyomás alatt, a talp fölé érő betonfejjel', t: [66, 76], pos: () => V3(-1.0, state.concTop - 2.6, 0.1) },
  { id: 'exc', text: 'Kotró: furadék eltávolítása', t: [104, 112], pos: () => V3(-7.5, 3.6, -7.5) },
  { id: 'cage', text: 'Betonacél armatúra távtartókkal', t: [117, 127], pos: () => cage.localToWorld(V3(0, PILE.cageL + 0.3, 0)) },
  { id: 'vib', text: 'Vibrátor', t: [134.5, 139], pos: () => V3(vibrator.position.x, vibrator.position.y + 0.4, vibrator.position.z) },
  { id: 'bars', text: 'Csatlakozó vasak', t: [148, 156], pos: () => V3(0, 1.0, 0) },
  { id: 'capb', text: 'Cölöpösszefogó fejtömb', t: [153, 160], pos: () => V3(-1.6, 0.4, -0.3) },
];
labelsEl.innerHTML = LABELS.map(l => l.cls ? `<div class="lbl ${l.cls}" id="lbl_${l.id}"><div class="b">${typo(l.text)}</div></div>` : `<div class="lbl" id="lbl_${l.id}"><div class="b">${typo(l.text)}</div><div class="s"></div><div class="d"></div></div>`).join('');
const inRange = (t, r) => Array.isArray(r[0]) ? r.some(x => t >= x[0] && t < x[1]) : (t >= r[0] && t < r[1]);
const rangeOf = (t, r) => Array.isArray(r[0]) ? (r.find(x => t >= x[0] && t < x[1]) || r[0]) : r;

const CAPTIONS = [
  { t: [6, 20], ph: '1 · Kitűzés, pontraállás', tx: 'A lánctalpas fúrógép a kitűzött cölöptengely fölé áll. Az árboc függőlegességét a gép dőlésmérője ellenőrzi, a spirál hegye a kitűzési pontra kerül.' },
  { t: [20, 38], ph: '2 · Megadott hosszúságú furat készítése', tx: 'Az üreges szárú spirálfúrót a forgatófej forgatja és nyomja lefelé a tervezett mélységig. <b>A furadék nem kerül ki:</b> a spirálon maradó talajdugó folyamatosan megtámasztja a furat falát.' },
  { t: [38, 56], ph: '2 · Megadott hosszúságú furat készítése', tx: 'Nincs szükség béléscsőre vagy bentonitos zagyra, a talajvíz sem zavar. A szár alját csapóajtós vég (a gyakorlatban eldobható záródugó) zárja, hogy talaj és víz ne jusson az üreges szárba.' },
  { t: [56, 64], ph: '3 · Betonozás: a talp elérése, betonindítás', tx: 'A tervezett mélységen a spirált 15–30 cm-rel megemelik, a szivattyú <b>az üreges száron át</b> betont nyom le: a nyomás kinyitja a csapóajtós véget (kilöki a záródugót), a beton a spirál alatt lép ki.' },
  { t: [64, 84], ph: '4 · Betonozás a fúrószáron keresztül, felhúzás közben', tx: 'A spirált <b>betonnyomás alatt</b>, forgatás nélkül vagy nagyon lassan forgatva húzzák ki: a beton a talp alatt tölti ki a furatot, a spirál a talajt hozza fel, a spiráltisztító lekaparja.' },
  { t: [84, 102], ph: '4 · Betonozás a fúrószáron keresztül, felhúzás közben', tx: 'A fedélzeti számítógép méterenként rögzíti a fúrószár tetején mért betonnyomást és a betonmennyiséget (elméleti + 15–20 %). A cölöpöt a munkaszintig felbetonozzák, vibrálás nélkül.' },
  { t: [102, 116], ph: '5 · Felbetonozás a munkaszintig, furadék eltakarítása', tx: 'A cölöpöt a munkaszintig felbetonozták. A kotró eltakarítja a furadékot a friss cölöpfej körül, a fúrógép pedig azonnal továbbáll a következő cölöphöz: egy géppel napi 15–30 cölöp készül.' },
  { t: [116, 128], ph: '6 · A cölöpvasalás elhelyezése', tx: 'Közvetlenül a betonozás után a daru a betonacél armatúrát (vasalókosarat) a még friss, folyós betonba engedi. A távtartók biztosítják a betontakarást.' },
  { t: [128, 140], ph: '6 · A cölöpvasalás elhelyezése', tx: 'Az armatúra 6–10 m-ig saját súlyával süllyed, mélyebbre vibrátorral segítik. A hosszvasak a betonszint fölé nyúlnak a későbbi csatlakozáshoz.' },
  { t: [140, 156], ph: '7 · Fejkialakítás · időugrás: néhány nap múlva', tx: 'Időugrás: a beton megszilárdult. A cölöpfejet a tervezett szintre visszavésik, a csatlakozó vasak szabadon maradnak, majd elkészül a cölöpösszefogó fejtömb.' },
  { t: [156, 172], ph: '8 · Kész cölöp', tx: 'A kész CFA cölöp: tömör betontest a teherbíró rétegbe kötve, felül vasalva. Gyors, csendes, rezgésszegény technológia, béléscső és zagy nélkül.' },
];
const CARDS = [
  { t: [36, 50], title: 'Túlfúrás laza homokban', text: 'Ha a spirál túl gyorsan forog az előtoláshoz képest, több talajt szállít fel, mint amennyit kifúr: a furat környezete fellazul. Ezért a fordulat és az előtolás arányát a gép méri és szabályozza.' },
  { t: [78, 96], title: 'Kihúzási sebesség és betonszállítás', text: 'A spirált csak olyan gyorsan szabad emelni, amennyi betont a szivattyú betölt, hogy a betonfej a spirálcsúcs fölött maradjon. Ha gyorsabban húzzák, a nyomás leesik, a furatfal beomlik, és a cölöptest beszűkül (necking).' },
  { t: [128, 138], title: 'Miért kell friss, folyós beton?', text: 'A kosarat a betonozás után azonnal be kell helyezni: a folyós konzisztencia és a kötéskésleltető teszi lehetővé, hogy a kosár saját súlyával lesüllyedjen.' },
];
$('endcard').innerHTML = `<h2>CFA cölöp – összefoglaló</h2><div class="cols"><div><h3>Alkalmazási terület</h3><ul>
<li>minden talajban, kivéve a laza, folyós talajokat; finom homokban különös gondosság</li>
<li>sokféle cölöpátmérőt és -hosszat igénylő projekteken</li>
<li>változékony teherbírási igény, rövid határidő esetén</li>
<li>zaj- és rezgéskorlátozás esetén (városi környezet)</li></ul></div>
<div><h3>Főbb jellemzők</h3><ul>
<li>40–60–80–100–(120) cm átmérő</li>
<li>6–22 (24) m hossz</li>
<li>egyszerű gépészet, béléscső és zagy nélkül</li>
<li>automata monitorozás (nyomás, mennyiség, mélység)</li>
<li>gyors fúrási sebesség</li></ul></div></div>`;
document.querySelectorAll('#endcard li').forEach(li => li.innerHTML = typo(li.innerHTML));

// ---------- állapot ----------
const state = { tipY: 3.5, headY: 23.5, concTop: -100, heapH: 0, rigX: 0, cageBottom: 0 };
let lastCamCut = -1;

function augerAngle(t) { // negatív = óramutató irányban felülről (jobbmenetű csiga fúr)
  const drill = clamp(t - T.drill[0], 0, T.drill[1] - T.drill[0]);
  const ext = clamp(t - T.extract[0], 0, T.extract[1] - T.extract[0]);
  const drill2 = clamp(t - 118, 0, 40); // második cölöp
  const back = clamp(t - 62, 0, 1.5); // visszacsavarás a talpra
  return -Math.PI * 2 * (0.42 * drill + 0.05 * ext + 0.42 * drill2 + 0.3 * back);
}
function tipYAt(t) {
  if (t < 18) return 3.5;
  if (t < 20) return lerp(3.5, 0.25, ease(ramp(t, 18, 20)));
  if (t < T.drill[1]) { const u = ramp(t, T.drill[0], T.drill[1]); const e = u < 0.08 ? (u / 0.08) * (u / 0.08) * 0.08 : u; return lerp(0.25, -PILE.L, e); }
  if (t < 60) return -PILE.L;
  if (t < 61) return lerp(-PILE.L, -PILE.L + 0.2, ease(ramp(t, 60, 61))); // 15–30 cm emelés a dugó kilökéséhez
  if (t < 62) return -PILE.L + 0.2;
  if (t < 63.5) return lerp(-PILE.L + 0.2, -PILE.L, ease(ramp(t, 62, 63.5))); // visszacsavarás a talpra nyomás alatt
  if (t < T.extract[0]) return -PILE.L;
  if (t < T.extract[1]) return lerp(-PILE.L, 3.5, ease(ramp(t, T.extract[0], T.extract[1])));
  if (t < 118) return 3.5;
  if (t < 158) return lerp(3.5, -PILE.L, ramp(t, 118, 158)); // második cölöp fúrása a háttérben
  return -PILE.L;
}
const RT_SEG = [[6, 20, 4 * 60], [20, 56, 210], [56, 64, 90], [64, 102, 9 * 60], [102, 116, 4 * 60], [116, 140, 8 * 60]];
function realTimeAt(t) { let r = 0; for (const [a, b, R] of RT_SEG) { if (t <= a) break; r += R * clamp((t - a) / (b - a), 0, 1); } return r; }
const fmtRT = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), q = s % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(q).padStart(2, '0'); };
function pressureAt(d) { return 0.85 + 0.25 * Math.sin(d * 1.7 + 0.4) + 0.12 * Math.sin(d * 5.3) + 0.012 * d; }
function volPerM(d) { return THEO * (1.17 + 0.07 * Math.sin(d * 2.3 + 1.1) + 0.03 * Math.sin(d * 7.1) + (d > PILE.L - 1.2 ? 0.35 : 0)); }
function cumVol(depth) { // -PILE.L .. depth integrál (m³) a talptól a jelenlegi mélységig, 0,25 m lépésekben
  let v = 0; for (let d = PILE.L; d > depth; d -= 0.25) v += volPerM(d) * Math.min(0.25, d - depth); return v;
}

// kamerabeállítások: shots[{t0,t1,p0,t0v,p1,t1v}] vagy dyn(t)
const SHOTS = [
  { t: [0, 6], p: [[70, 30, 62], [58, 26, 66]], a: [[0, 5, -8], [0, 6, -8]] },
  { t: [6, 14], p: [[-36, 12, 40], [-20, 11, 34]], a: [[-14, 9, -6], [-6, 9, -5]] },
  { t: [14, 20], p: [[14, 16, 26], [9, 12, 19]], a: [[0, 9, 0], [0, 4, 0]] },
  { t: [20, 36], p: [[30, 12, 34], [26, 7, 30]], a: [[0, 0, -2], [0, -3, 0]] },
  { t: [36, 56], dyn: t => ({ p: [11, state.tipY + 4.5, 15], a: [0, state.tipY + 0.5, 0] }) },
  { t: [56, 64], p: [[7.5, -PILE.L + 2.5, 10], [6.5, -PILE.L + 1.8, 8.5]], a: [[0, -PILE.L + 0.4, 0], [0, -PILE.L + 0.6, 0]] },
  { t: [64, 84], dyn: t => ({ p: [13, state.tipY + 3.5, 17], a: [0, state.tipY - 0.5, 0] }) },
  { t: [84, 102], p: [[32, 14, 36], [26, 9, 30]], a: [[0, -4, -2], [1, -2, -2]] },
  { t: [102, 116], p: [[-18, 9, 24], [-13, 7, 18]], a: [[-3, 1, -4], [-3.5, 1.5, -5]] },
  { t: [116, 128], p: [[-42, 15, 36], [-26, 13, 32]], a: [[-15, 7, -7], [-9, 8, -5]] },
  { t: [128, 140], dyn: t => { const cx = cage.position.x, cz = cage.position.z, k = ease(ramp(t, 128, 133)); const fx = cx * (1 - k) * 0.85, fz = cz * (1 - k) * 0.85; return { p: [fx + 15, Math.max(5, state.cageBottom + 8.5), fz + 20], a: [fx, Math.max(0, state.cageBottom + 4.5), fz] }; } },
  { t: [140, 156], p: [[7, 2.6, 9], [5.5, 1.8, 7]], a: [[0, -0.2, 0], [0, -0.4, 0]] },
  { t: [156, 172], dyn: t => { const a = lerp(-0.7, 0.7, ramp(t, 156, 172)); return { p: [26 * Math.sin(a), 0, 26 * Math.cos(a)], a: [0, -7, 0] }; } },
];
function camAt(t) {
  let s = SHOTS[SHOTS.length - 1];
  for (const sh of SHOTS) if (t >= sh.t[0] && t < sh.t[1]) { s = sh; break; }
  if (s.dyn) return s.dyn(t);
  const u = ease(ramp(t, s.t[0], s.t[1]));
  return { p: [0, 1, 2].map(i => lerp(s.p[0][i], s.p[1][i], u)), a: [0, 1, 2].map(i => lerp(s.a[0][i], s.a[1][i], u)) };
}
// közelkép-kamera fázisonként
function insetAt(t) {
  const ty = state.tipY;
  if (t < 20) return { p: [3.2, 2.2, 4.0], a: [0, 0.6, 0], title: 'Kitűzés', sub: 'A spirál hegye a kitűzött tengely fölött' };
  if (t < 56) return { p: [2.8, ty + 1.6, 3.4], a: [0, ty + 0.5, 0], title: 'A talp és a talajdugó', sub: 'A spirálon maradó talaj támasztja a furat falát; a szár alját csapóajtós vég (záródugó) zárja' };
  if (t < 64) return { p: [2.6, ty + 1.0, 3.2], a: [0, ty + 0.25, 0], title: 'Betonindítás a talpnál', sub: 'A beton az üreges száron át érkezik, a nyomás kilöki a záródugót', glass: true };
  if (t < 78) return { p: [2.8, ty + 1.0, 3.4], a: [0, ty - 0.1, 0], title: 'Kihúzás betonnyomás alatt', sub: 'A talp alatt friss beton tölti ki a furatot, a betonfej a csúcs fölé ér', glass: true };
  if (t < 86) return { p: [3.0, ty + 0.9, 3.6], a: [0, ty - 0.3, 0], title: 'HELYES: nyomás alatti kihúzás', sub: 'A betonfej a spirálcsúcs fölött áll (≥ 1,5 m), a nyomás végig pozitív (≈ 0,9 bar)', glass: true, good: true };
  if (t < 94) return { p: [3.0, ty + 0.9, 3.6], a: [0, ty - 0.3, 0], title: 'HIBÁS: túl gyors kihúzás', sub: 'Nyomás 0,0 bar: a talp alatt üreg, a furatfal beomlik – a cölöptest beszűkül (necking)', glass: true, bad: true };
  if (t < 102) return { p: [3.4, 2.8, 4.2], a: [0.3, CLEANER_Y + 0.3, 0.5], title: 'Spiráltisztító', sub: 'A felszínre érő spirálról a kaparó lekaparja a furadékot' };
  if (t < 116) return { p: [-7.5, 4.5, 8.5], a: [-2.7, 0.8, -3.0], title: 'Furadék és cölöpfej', sub: 'A friss betonfej körül a talajt eltávolítják' };
  if (t < 140) { const cb = state.cageBottom; return { p: [2.6, cb + 2.0, 3.2], a: [0, cb + 1.2, 0], title: 'Betonacél armatúra', sub: 'Hosszvasak, spirálkengyel és távtartó kerekek a betontakaráshoz' }; }
  if (t < 156) return { p: [2.8, 1.0, 3.2], a: [0, -0.2, 0], title: 'Cölöpfej visszavésése', sub: 'A beton fölös részét lebontják, a csatlakozó vasak kiállnak' };
  return { p: [3.4, -6.5, 4.2], a: [0, -8.2, 0], title: 'Kész cölöp metszete', sub: 'Beton és vasalás a teherbíró rétegbe kötve' };
}

const chartEl = $('chart');
function drawChart(depthNow, pumping, done) {
  const Wc = 364, Hc = 150, L = 34, R = 8, Tp = 8, B = 18;
  const maxV = THEO * 1.5; const bars = [];
  const n = PILE.L; const bw = (Wc - L - R) / n;
  let html = `<line x1="${L}" y1="${Hc - B}" x2="${Wc - R}" y2="${Hc - B}" stroke="rgba(255,255,255,0.25)"/>`;
  html += `<text x="${L - 4}" y="${Hc - B + 4}" fill="rgba(255,255,255,0.6)" font-size="10" text-anchor="end" font-family="Mono">0</text>`;
  html += `<text x="${L - 4}" y="${Tp + 8}" fill="rgba(255,255,255,0.6)" font-size="10" text-anchor="end" font-family="Mono">${fmt(maxV, 2)}</text>`;
  for (let i = 0; i < n; i++) {
    const dTop = i, dBot = i + 1; const x = L + i * bw;
    const shown = (pumping || done) && depthNow <= dTop + 0.02; // a talptól felfelé töltődik
    if (shown) { const v = volPerM(dBot - 0.5); const h = (Hc - B - Tp) * v / maxV; html += `<rect x="${x + 1}" y="${Hc - B - h}" width="${bw - 2}" height="${h}" fill="rgba(79,209,255,0.75)"/>`; }
    if (i % 4 === 0) html += `<text x="${x + bw / 2}" y="${Hc - 4}" fill="rgba(255,255,255,0.55)" font-size="10" text-anchor="middle" font-family="Mono">${i} m</text>`;
  }
  const yT = Hc - B - (Hc - B - Tp) * THEO / maxV;
  html += `<line x1="${L}" y1="${yT}" x2="${Wc - R}" y2="${yT}" stroke="#ffb347" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  html += `<text x="${L + 3}" y="${yT - 3}" fill="#ffb347" font-size="10" text-anchor="start" font-family="Mono">elméleti 0,50 m³/m</text>`;
  setHTML(chartEl, html);
}

// ---------- fő frissítés ----------
function update(t) {
  // --- fúrógép helye ---
  let rigX = t < T.pos[0] ? -24 : lerp(-24, 0, ease(ramp(t, 6, 14)));
  if (t > 105) rigX = lerp(0, NEXT_X, ease(ramp(t, 105, 113)));
  state.rigX = rigX;
  rig.position.set(rigX - RU.mastX, 0, -(RU.mastZ + 1.4));
  RU.mast.rotation.z = 0.02 * (1 - ease(ramp(t, 14, 17.5))); // függőlegesség beállítása
  const tipY = tipYAt(t); state.tipY = tipY;
  const headY = tipY + AUG.length; state.headY = headY;
  MM.setRigHead(rig, headY);
  auger.position.set(rigX, tipY, 0); auger.rotation.y = augerAngle(t);
  // csapóajtó: betonozáskor nyitva
  // záródugó: a betonnyomás kilöki (60,8–61,6 s), utána a beton eltakarja
  { const u = ease(ramp(t, 60.8, 61.6)); plug.position.set(0.05 * u, -0.03 - 0.55 * u, -0.08 * u); plug.rotation.x = 0.9 * u; plug.rotation.z = 0.4 * u; plug.visible = t < 64 || t >= 116; if (t >= 116) { plug.position.set(0, -0.03, 0); plug.rotation.set(0, 0, 0); } }
  // talaj a meneteken: fúráskor csak a talajszint alatt, kihúzáskor a spiráltisztítóig; a második cölöpnél újra a talajszint alatt
  let sf = 0; if (t >= T.extract[0] && t < 116) sf = lerp(0, CLEANER_Y, ease(ramp(t, 64, 66))); sfClip.constant = sf;
  AU.soilFill.visible = t >= T.drill[0];
  // kivágatlan talaj sapka a horony előtt: a fúrás legmélyebb pontja alatt marad
  const deepest = t < T.drill[0] ? 1 : (t < T.drill[1] ? tipY : -PILE.L);
  capClip.constant = deepest;
  // beton
  let concTop = -100;
  if (t >= 60.8 && t < T.extract[0]) concTop = -PILE.L + 0.02 + 0.3 * ease(ramp(t, 60.8, 62.5)) + 1.5 * ease(ramp(t, 62.5, 64.5));
  else if (t >= T.extract[0] && t < T.extract[1]) concTop = Math.min(0.3, tipY + 1.5 * (1 - ease(ramp(t, 63.5, 64.5))) + 1.5 * ease(ramp(t, 63.5, 64.5)));
  else if (t >= T.extract[1]) concTop = 0.3;
  if (t >= 142) concTop = lerp(0.3, -PILE.cutoff, ease(ramp(t, 142, 149)));
  state.concTop = concTop; concClip.constant = concTop;
  sfClip2.constant = 1000; // a betonfej alatt a menetek betonban vannak
  concTopCap.visible = concTop > -PILE.L && concTop < 0.3; concTopCap.position.y = concTop;
  overpour.visible = t >= 100 && t < 142;
  // beton az üreges szárban és a talpnál (közelkép)
  const pumping = t >= 59.5 && t < T.extract[1];
  stemConcrete.visible = pumping; tipConcrete.visible = pumping;
  const tc = 0.35 * ease(ramp(t, 60.8, 63)); tipConcrete.scale.y = Math.max(0.001, tc) / 0.001; tipConcrete.position.y = -tc / 2 + 0.01;
  // fejtömb
  capBlock.visible = t >= 150; capBlock.scale.y = Math.max(0.0001, ease(ramp(t, 150, 155)));
  // tömlő
  updateHose(rigX + RU.mastX, headY);
  // furadékkúp
  let heapH = 0;
  if (t >= T.drill[0]) heapH = 0.45 * ease(ramp(t, 24, 56));
  if (t >= T.extract[0]) heapH = lerp(0.45, 1.6, ramp(t, 66, 100));
  if (t >= 104) heapH = 1.6 * (1 - ease(ramp(t, 104, 114)));
  state.heapH = heapH; MM.setHeap(heap, 1.7 * Math.sqrt(heapH / 1.6) + 0.001, heapH);
  const stockH = 1.2 * ease(ramp(t, 106, 116)); MM.setHeap(stock, 2.4 * Math.sqrt(stockH / 1.2) + 0.001, stockH);
  // mixer dob
  mixer.userData.drum.rotation.x = t * 0.9;
  // kotró
  if (t < 103) MM.setExcavatorPose(excavator, 0.55, 1.0, 0.7, 0);
  else {
    const u = ramp(t, 103, 115); const cyc = (u * 2.5) % 1; // 2,5 ciklus
    const dig = ease(clamp(cyc / 0.3, 0, 1)) * (cyc < 0.45 ? 1 : ease(1 - clamp((cyc - 0.45) / 0.1, 0, 1)));
    const toDump = ease(clamp((cyc - 0.4) / 0.2, 0, 1)) * (cyc < 0.8 ? 1 : 1 - ease(clamp((cyc - 0.8) / 0.2, 0, 1)));
    const aHeap = Math.atan2(heap.position.x - excavator.position.x, heap.position.z - excavator.position.z) - excavator.rotation.y;
    const aDump = Math.atan2(stock.position.x - excavator.position.x, stock.position.z - excavator.position.z) - excavator.rotation.y;
    const slew = lerp(aHeap, aDump, toDump);
    const boomA = lerp(0.55, 0.15, dig) + 0.25 * toDump; const stickA = lerp(1.0, 1.35, dig) - 0.5 * toDump; const bucketA = lerp(0.7, 1.4, dig) - 1.0 * (cyc > 0.6 && cyc < 0.8 ? 1 : 0);
    MM.setExcavatorPose(excavator, boomA, stickA, bucketA, slew);
  }
  // kosár és daru
  cage.visible = t >= 100; vibrator.visible = false;
  let cageBottom = 0;
  if (t < 116) { cage.rotation.x = -Math.PI / 2; cage.position.copy(P_PICK).setY(0.5); MM.setCranePose(crane, 1.1, 14, Math.atan2(P_PICK.x - crane.position.x, P_PICK.z - crane.position.z) + 0.6); cageBottom = 0.5; }
  else {
    let th = -Math.PI / 2, base = P_PICK.clone().setY(0.5), hookAbove = 1.9;
    let hookXZ, hookY;
    if (t < 121) { // horog leereszkedik a kosár felső végéhez
      th = -Math.PI / 2; const top = V3(base.x, base.y + PILE.cageL * Math.cos(th), base.z + PILE.cageL * Math.sin(th));
      hookXZ = [top.x, top.z]; hookY = lerp(top.y + 8, top.y + hookAbove, ease(ramp(t, 116, 121)));
    } else if (t < 127) { // felállítás az alsó vég körül
      th = -Math.PI / 2 * (1 - ease(ramp(t, 121, 127)));
      const top = V3(base.x, base.y + PILE.cageL * Math.cos(th), base.z + PILE.cageL * Math.sin(th));
      hookXZ = [top.x, top.z]; hookY = top.y + hookAbove;
    } else if (t < 133) { // átforgatás a cölöp fölé
      th = 0; const u = ease(ramp(t, 127, 133));
      const a0 = Math.atan2(base.x - crane.position.x, base.z - crane.position.z), a1 = Math.atan2(0 - crane.position.x, 0 - crane.position.z);
      const r0 = Math.hypot(base.x - crane.position.x, base.z - crane.position.z), r1 = Math.hypot(crane.position.x, crane.position.z);
      const a = lerp(a0, a1, u), r = lerp(r0, r1, u);
      hookXZ = [crane.position.x + r * Math.sin(a), crane.position.z + r * Math.cos(a)];
      const lift = lerp(0.5, 2.2, ease(ramp(t, 127, 129)));
      base = V3(hookXZ[0], lift, hookXZ[1]); hookY = lift + PILE.cageL + hookAbove;
    } else if (t < 139.5) { // lesüllyesztés a friss betonba
      th = 0; hookXZ = [0, 0];
      const u = ramp(t, 133, 139.5); const y = lerp(2.2, -(PILE.cageL - 0.8), u < 0.6 ? ease(u / 0.6) * 0.75 : 0.75 + 0.25 * ease((u - 0.6) / 0.4));
      base = V3(0, y, 0); hookY = y + PILE.cageL + hookAbove;
      if (t > 134.5) { vibrator.visible = true; const vib = 0.025 * Math.sin(t * 95); base.x += vib; base.z += vib * 0.6; vibrator.position.set(base.x, y + PILE.cageL - 0.2, base.z); }
    } else { th = 0; hookXZ = [0, 0]; base = V3(0, -(PILE.cageL - 0.8), 0); hookY = lerp(base.y + PILE.cageL + hookAbove, 14, ease(ramp(t, 139.5, 142))); }
    cage.rotation.x = th; cage.position.copy(base); cageBottom = base.y;
    const dx = hookXZ[0] - crane.position.x, dz = hookXZ[1] - crane.position.z; const rr = Math.hypot(dx, dz);
    const boomA = Math.acos(clamp((rr - 1.6) / crane.userData.boomLen, 0.2, 0.95));
    MM.setCranePose(crane, boomA, t < 142 ? hookY : 14, Math.atan2(dx, dz));
  }
  state.cageBottom = cageBottom;
  ripples.forEach((m, i) => { const on = t >= 133.5 && t < 140; const ph = ((t * 0.9) + i / 3) % 1; m.visible = on; if (on) { const r = 0.32 + 0.55 * ph; m.scale.set(r / 0.32, r / 0.32, 1); m.material.opacity = 0.55 * (1 - ph); } });
  // munkások, bontókalapács
  w1.visible = t >= 6 && t < 102 || t >= 116; w1.position.set(t >= 116 ? -2.4 : -3.2, 0, -2.2);
  w2.visible = t >= 116 && t < 156; w2.position.set(t >= 140 ? 1.5 : 2.2, 0, -1.2);
  breaker.visible = false;
  const gone = t >= T.head[0]; rig.visible = !gone; auger.visible = !gone; crane.visible = !gone; excavator.visible = !gone; pump.visible = !gone; mixer.visible = !gone; if (hoseMesh) hoseMesh.visible = !gone; cage2.visible = !gone; w1.visible = w1.visible && !gone; heap.visible = !gone; stock.visible = !gone;
  pile2.visible = gone; pile2cap.visible = t >= 150; pile2cap.scale.y = Math.max(0.0001, ease(ramp(t, 150, 155)));
  // karók: az aktuális cölöpé eltűnik a fúrás alatt
  pegs[0].visible = t < 20; pegs[1].visible = t < 118; pegs[2].visible = t < T.head[0];
  ruler.visible = inRange(t, RULER_T);
  // részecskék: furadék a spiráltisztítónál kihúzáskor, por fúráskor, betontörmelék véséskor
  {
    const pos = spoilParts.geometry.attributes.position; const on = t >= 66 && t < 101;
    for (let i = 0; i < spoilParts.userData.n; i++) {
      if (!on) { pos.setXYZ(i, 0, -500, 0); continue; }
      const ph = (t / 0.9 + seeded(i, 1)) % 1; const a = seeded(i, 2) * 1.6 + 0.2; const sp = 1.6 + seeded(i, 3) * 1.6;
      const x = -0.45 - Math.cos(a) * sp * ph, z = 0.5 - Math.sin(a) * sp * ph * 0.9 - 1.2 * ph, y = CLEANER_Y + 0.1 + 1.4 * ph - 4.9 * ph * ph;
      pos.setXYZ(i, x, Math.max(y, 0.05), z);
    }
    pos.needsUpdate = true;
    const dp = dustParts.geometry.attributes.position; const don = (t >= 22 && t < 56) || (t >= 119 && t < 156);
    const cx = t >= 119 ? NEXT_X : 0;
    for (let i = 0; i < dustParts.userData.n; i++) {
      if (!don) { dp.setXYZ(i, 0, -500, 0); continue; }
      const ph = (t / 2.2 + seeded(i, 4)) % 1; const a = seeded(i, 5) * Math.PI * 2; const r = 0.6 + 1.6 * ph;
      dp.setXYZ(i, cx + Math.cos(a) * r, 0.1 + 0.9 * ph * (1 - ph) * 2, Math.min(-0.15, Math.sin(a) * r - 0.4));
    }
    dp.needsUpdate = true; dustParts.material.opacity = don ? 0.6 : 0;
    const cp = chunkParts.geometry.attributes.position; const con = t >= 142 && t < 149.5;
    for (let i = 0; i < chunkParts.userData.n; i++) {
      if (!con) { cp.setXYZ(i, 0, -500, 0); continue; }
      const ph = (t / 0.7 + seeded(i, 6)) % 1; const a = seeded(i, 7) * Math.PI; const sp = 0.8 + seeded(i, 8) * 1.4;
      cp.setXYZ(i, Math.cos(a) * (0.35 + sp * ph), Math.max(state.concTop + 0.8 * ph - 3.5 * ph * ph, -PILE.cutoff), Math.max(-1.6, -0.2 - Math.sin(a) * sp * ph * 0.6));
    }
    cp.needsUpdate = true;
  }
  // --- kamerák ---
  const c = camAt(t); cam.position.set(...c.p); cam.lookAt(...c.a);
  sun.target.position.set(rigX, 0, -5);
  { const u = ease(ramp(t, T.head[0], T.head[0] + 1.5)); sun.position.set(lerp(40, -35, u), lerp(70, 55, u), lerp(55, 45, u)); }
  const ins = insetAt(t); insetCam.position.set(...ins.p); insetCam.lookAt(...ins.a);

  // --- DOM: fülek, feliratok, kártya, HUD, címkék ---
  let active = -1; PHASES.forEach((p, i) => { const el = $('tab_' + p.key); const st = t >= p.t[1] ? 'done' : (t >= p.t[0] ? 'active' : ''); if (st === 'active') active = i; el.className = 'tab ' + st; });
  const cap = CAPTIONS.find(c => t >= c.t[0] && t < c.t[1]);
  const capEl = $('caption'); capEl.style.opacity = cap ? String(Math.min(1, ramp(t, cap.t[0], cap.t[0] + 0.5)) * (1 - ramp(t, cap.t[1] - 0.5, cap.t[1]) * (CAPTIONS.some(c2 => c2.t[0] === cap.t[1]) ? 0 : 1))) : '0';
  if (cap) { setText($('capPh'), cap.ph); setPanel($('capTx'), typo(cap.tx)); }
  const card = CARDS.find(c => t >= c.t[0] && t < c.t[1]);
  const cardEl = $('card');
  if (card) { const o = ease(ramp(t, card.t[0], card.t[0] + 0.7)) * (1 - ease(ramp(t, card.t[1] - 0.7, card.t[1]))); cardEl.style.opacity = String(o); cardEl.style.transform = `translateY(${(1 - o) * -10}px)`; setHTML($('cardT'), typo(card.title)); setPanel($('cardX'), typo(card.text)); }
  else cardEl.style.opacity = '0';
  // HUD
  const depth = Math.max(0, -tipY); const drilling = t >= T.drill[0] && t < T.drill[1]; const extracting = t >= T.extract[0] && t < T.extract[1];
  const drilling2 = t >= 118 && t < 158;
  const depthHUD = t >= T.extract[1] ? 0 : depth;
  setText($('hDepth'), fmt(depthHUD, 2));
  const revPerPitch = depthHUD < 6.5 ? 2.5 : (depthHUD < 17.5 ? 1.8 : 2.2);
  const rpm = drilling ? 18 + 1.5 * Math.sin(t * 1.3) : (extracting ? 3 : 0);
  setText($('hRpm'), String(Math.round(rpm)));
  const torque = drilling ? 95 + 6 * depthHUD + 25 * Math.sin(t * 2.1) : (extracting ? 30 + 8 * Math.sin(t * 1.7) : 0);
  setText($('hTorque'), String(Math.round(Math.max(0, torque))));
  setText($('hRateL'), extracting ? 'Kihúzás' : 'Előtolás');
  const rate = drilling ? AUG.pitch * rpm / revPerPitch : (extracting ? 1.8 + 0.15 * Math.sin(t * 1.1) : 0);
  setText($('hRate'), fmt(rate, 1));
  let press = 0; if (t >= 59.5 && t < T.extract[0]) press = 0.3 * ease(ramp(t, 59.5, 60.8)) + 0.9 * ease(ramp(t, 60.8, 62)); else if (extracting) press = pressureAt(depth) * (1 - 0.6 * ramp(t, 100, 102));
  setText($('hPress'), fmt(press, 1));
  const cum = t < 59.5 ? 0 : (t < T.extract[0] ? 0.12 * ease(ramp(t, 59.5, 64)) : (extracting ? 0.12 + cumVol(Math.max(0, -tipY)) : 0.12 + cumVol(0)));
  setText($('hVol'), fmt(cum, 2));
  setText($('hTheo'), fmt(THEO, 2));
  setText($('hRt'), t < T.head[0] ? fmtRT(realTimeAt(t)) : '+ 2 nap');
  const placed = extracting ? (PILE.L - Math.max(0, -tipY)) : (t >= T.extract[1] ? PILE.L : 0);
  setText($('hOver'), placed > 1 ? '+' + Math.round(((cum - 0.12) / (THEO * placed) - 1) * 100) + ' %' : '–');
  setText($('hudst'), t < T.drill[0] ? (t >= 13 && t < 20 ? 'ÁRBOC DŐLÉSE ' + fmt(lerp(2.0, 0.2, ease(ramp(t, 14, 17.5))), 1) + '°' : 'KÉSZENLÉT') : drilling ? 'FÚRÁS · ' + fmt(revPerPitch, 1) + ' ford./menet' : (t < T.extract[0] ? 'BETONINDÍTÁS' : extracting ? 'KIHÚZÁS + BETONOZÁS' : 'CÖLÖPNAPLÓ LEZÁRVA'));
  drawChart(depth, extracting || (t >= 58 && t < T.extract[0]), t >= T.extract[1]);
  // 3D címkék
  const half = 0.6;
  for (const l of LABELS) {
    const el = $('lbl_' + l.id); if (!inRange(t, l.t)) { el.style.opacity = '0'; continue; }
    const rg = rangeOf(t, l.t);
    const p = l.pos().clone().project(cam);
    if (p.z > 1) { el.style.opacity = '0'; continue; }
    const x = (p.x + 1) / 2 * 1920, y = (1 - p.y) / 2 * 1080;
    if (x < -200 || x > 2200 || y < 140 || y > 900) { el.style.opacity = '0'; continue; }
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.opacity = String(ease(ramp(t, rg[0], rg[0] + half)) * (1 - ease(ramp(t, rg[1] - half, rg[1]))));
  }
  // közelkép felirat
  setText($('insT'), ins.title); setPanel($('insS'), typo(ins.sub));
  $('inset').className = ins.bad ? 'bad' : (ins.good ? 'good' : '');
  // címkártya, zárókártya, haladás
  $('titlecard').style.opacity = String(1 - ease(ramp(t, 4.5, 6)));
  $('top').style.opacity = String(ease(ramp(t, 5.5, 7)));
  const ec = $('endcard'); ec.style.opacity = String(ease(ramp(t, 158, 160)));
  $('hud').style.opacity = String(t < T.head[0] ? ease(ramp(t, 5.5, 7)) : 1 - ease(ramp(t, T.head[0], T.head[0] + 1)));
  $('prog').style.width = (t / DUR * 100) + '%';
  $('note').style.opacity = String(ease(ramp(t, 6, 8)));
  $('inset').style.opacity = String(ease(ramp(t, 5.5, 7)));
  return { ins, showInset: t >= 5.5 };
}

function render(t) {
  const { ins, showInset } = update(t);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, 1920, 1080);
  renderer.render(scene, cam);
  if (!showInset) return;
  // közelkép: ugyanaz a jelenet, más kamera, opcionálisan átlátszó fúrószár
  const saveStem = AU.stem.material; if (ins.glass) AU.stem.material = stemGlass;
  const saveConc = concClip.constant;
  if (ins.bad) { concClip.constant = state.tipY - 1.7; neck.visible = true; neck.position.y = state.tipY - 0.6; neck2.visible = true; neck2.position.y = state.tipY - 1.25; concTopCap.position.y = state.tipY - 1.7; }
  const gx = INSET.x, gy = INSET.y; // WebGL: alsó origó; INSET.y = alsó margó
  renderer.setViewport(gx, gy, INSET.w, INSET.h); renderer.setScissor(gx, gy, INSET.w, INSET.h); renderer.setScissorTest(true);
  renderer.render(scene, insetCam);
  renderer.setScissorTest(false);
  AU.stem.material = saveStem;
  if (ins.bad) { concClip.constant = saveConc; neck.visible = false; neck2.visible = false; concTopCap.position.y = saveConc; }
}

window.__duration = DUR;
window.__setTime = (t) => { lastT = t; render(t); };
await document.fonts.ready;
// magyar elválasztó: a kész jelzés (__ready, videórenderelés) előtt megvárjuk, legfeljebb 4 s-ig
try {
  const H = window.Hyphenopoly;
  if (H && H.hyphenators && H.hyphenators.hu) HY = await Promise.race([H.hyphenators.hu.catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
} catch (e) { console.error('Elválasztás', e); HY = null; }
if (HY) {
  document.querySelectorAll('#endcard li, #hudfoot').forEach((el) => { el.innerHTML = hy(el.innerHTML).trim(); ragFit(el); });
  // az összefoglaló kártyán egységes igazítás: ha egy pont balra zárt (keskeny hasáb), minden pont az
  if (document.querySelector('#endcard li.rag')) document.querySelectorAll('#endcard li').forEach((li) => li.classList.add('rag'));
}
render(0);
window.__ready = true;

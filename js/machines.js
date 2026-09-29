// Gépek és tárgyak építése egyszerű testekből. 1 egység = 1 m.
import * as THREE from '../lib/three.module.min.js';

const matCache = new Map();
export function M(color, opts = {}) {
  const key = JSON.stringify([color, opts]);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts });
  matCache.set(key, m);
  return m;
}
export function box(w, h, d, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow; return m;
}
export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 24, shadow = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow; return m;
}
export function cylZ(r, h, mat, x = 0, y = 0, z = 0, seg = 24) { // henger z tengellyel (kerekek, dobok)
  const m = cyl(r, r, h, mat, x, y, z, seg); m.rotation.x = Math.PI / 2; return m;
}
export function cylX(r, h, mat, x = 0, y = 0, z = 0, seg = 24) {
  const m = cyl(r, r, h, mat, x, y, z, seg); m.rotation.z = Math.PI / 2; return m;
}
// két pont közé feszített henger (kötél, rúd)
export function rod(a, b, r, mat, seg = 8) {
  const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), mat);
  m.castShadow = true; m.userData.isRod = true; setRod(m, a, b); return m;
}
export function setRod(m, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

// ---------- geometria-összefűzés ----------
function mergeGeoms(geoms) {
  let nV = 0, nI = 0;
  for (const g of geoms) { nV += g.attributes.position.count; nI += g.index.count; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), idx = new Uint32Array(nI);
  let vo = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
    const gi = g.index.array; for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function gridSurface(nu, nv, fn) { // fn(u,v) -> [x,y,z]
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const p = fn(i / nu, j / nv); pos.push(p[0], p[1], p[2]); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
// Csavarvonal-szalag (csigamenet): rIn..rOut sugár, pitch menetemelkedés, turns fordulat, th vastagság. Jobbmenetű: y nő, ha θ nő.
export function helixRibbon(rIn, rOut, pitch, turns, th = 0.03, segPerTurn = 40) {
  const nu = Math.max(2, Math.round(turns * segPerTurn));
  const P = (u, v, dy) => { const th_ = u * turns * Math.PI * 2; const r = rIn + v * (rOut - rIn); return [r * Math.cos(th_), u * turns * pitch + dy, -r * Math.sin(th_)]; }; // jobbmenetű
  const top = gridSurface(nu, 2, (u, v) => P(u, v, th / 2));
  const bot = gridSurface(nu, 2, (u, v) => P(u, 1 - v, -th / 2)); // fordított irány -> normál lefelé
  const edge = gridSurface(nu, 1, (u, v) => P(u, 1, th / 2 - v * th));
  const g = mergeGeoms([top, bot, edge]); g.computeVertexNormals(); return g;
}

// ---------- CFA csiga ----------
export function buildAuger(o) {
  const { stemR = 0.14, flightR = 0.4, pitch = 0.55, length = 20, colors } = o;
  const g = new THREE.Group();
  const steel = M(colors.augerSteel || 0x6d7580, { metalness: 0.55, roughness: 0.45 });
  const stem = cyl(stemR, stemR, length, steel, 0, length / 2, 0, 20); g.add(stem);
  const turns = (length - 0.6) / pitch;
  const flight = new THREE.Mesh(helixRibbon(stemR * 0.98, flightR, pitch, turns, 0.035, 36), M(colors.augerFlight || 0x8d949c, { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
  flight.position.y = 0.45; flight.castShadow = true; flight.receiveShadow = true; g.add(flight);
  // talp: fúrófej, fogak, csapóajtós zárás
  const tip = new THREE.Group(); g.add(tip);
  const cone = cyl(stemR * 1.05, stemR * 0.55, 0.45, steel, 0, 0.225, 0, 16); tip.add(cone);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, r = flightR * 0.82;
    const tooth = box(0.12, 0.28, 0.09, M(0x3b4148, { metalness: 0.6, roughness: 0.4 }), Math.cos(a) * r, 0.32, Math.sin(a) * r);
    tooth.rotation.y = -a; tip.add(tooth);
  }
  const flap = box(stemR * 1.9, 0.05, stemR * 1.9, M(0x2f3439, { metalness: 0.6 }), 0, 0.02, 0); tip.add(flap);
  // talaj a meneteken (klippelve mutatjuk)
  const soilFill = cyl(flightR * 0.93, flightR * 0.93, length, M(colors.spoil || 0x7a6446, { roughness: 1 }), 0, length / 2, 0, 28);
  soilFill.castShadow = false; g.add(soilFill);
  // betonkilépés jelzése (kis világos henger a talpnál, csak betonozáskor)
  g.userData = { stem, flight, tip, flap, soilFill, length, flightR, stemR, pitch };
  return g;
}

// ---------- CFA fúrógép ----------
export function buildRig(colors) {
  const c = colors;
  const body = M(c.rigBody, { roughness: 0.5 });
  const accent = M(c.rigAccent, { roughness: 0.5 });
  const dark = M(0x2b2f36, { roughness: 0.7 });
  const steel = M(0x9aa3ad, { metalness: 0.5, roughness: 0.45 });
  const glass = M(0x8fc7ff, { roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.7 });
  const rig = new THREE.Group();

  // lánctalpak: két hernyótalp, z irányban hosszú (a gép a +z felé néz)
  const tracks = new THREE.Group(); rig.add(tracks);
  for (const sx of [-1, 1]) {
    const x = sx * 2.0;
    const frame = box(0.9, 0.6, 7.6, dark, x, 0.75, 0); tracks.add(frame);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.25, 8.2), M(0x1d2024, { roughness: 0.9 })); belt.position.set(x, 0.65, 0); belt.castShadow = true; belt.receiveShadow = true; tracks.add(belt);
    // kerekek/görgők jelzése
    for (const z of [-3.7, 3.7]) { const w = cylX(0.62, 1.02, dark, x, 0.65, z, 20); tracks.add(w); }
    for (let i = -3; i <= 3; i++) { const r = cylX(0.22, 1.04, M(0x3a3f47), x, 0.25, i * 1.0, 12); tracks.add(r); }
    // talp-lemezek (fogazat)
    for (let i = -8; i <= 8; i++) { const p = box(1.04, 0.08, 0.16, M(0x33373d), x, 0.02, i * 0.48); tracks.add(p); }
  }
  const carbody = box(3.6, 0.6, 3.4, dark, 0, 1.2, -0.3); tracks.add(carbody);
  // forgózsámoly + felsőváz
  const upper = new THREE.Group(); upper.position.y = 1.5; rig.add(upper);
  upper.add(cyl(1.7, 1.7, 0.35, steel, 0, 0.17, -0.3, 32));
  const deck = box(3.4, 0.35, 7.0, body, 0, 0.5, -1.3); upper.add(deck);
  const engine = box(3.2, 1.9, 3.6, body, 0, 1.6, -2.0); upper.add(engine);
  upper.add(box(3.25, 0.25, 3.65, accent, 0, 2.6, -2.0));
  // hűtőrács, kipufogó
  upper.add(box(0.3, 1.2, 2.0, dark, 1.66, 1.5, -2.4));
  upper.add(cyl(0.12, 0.12, 1.4, dark, -1.0, 3.2, -3.2, 12));
  // ellensúly
  const cw = box(3.4, 1.7, 1.5, dark, 0, 1.55, -4.55); upper.add(cw);
  upper.add(box(3.45, 0.3, 1.55, accent, 0, 2.55, -4.55));
  // fülke (bal-elöl)
  const cab = new THREE.Group(); cab.position.set(-1.05, 0.7, 1.2); upper.add(cab);
  cab.add(box(1.5, 0.5, 2.2, body, 0, 0.25, 0));
  cab.add(box(1.5, 1.7, 2.2, glass, 0, 1.35, 0));
  cab.add(box(1.55, 0.18, 2.25, body, 0, 2.28, 0));
  for (const p of [[-0.72, 1.35, 1.05], [0.72, 1.35, 1.05], [-0.72, 1.35, -1.05], [0.72, 1.35, -1.05]]) cab.add(box(0.08, 1.7, 0.1, dark, ...p));
  // gémszerkezet (paralelogramma) a felsővázról az árbochoz
  const mastX = 0.35, mastZ = 5.6; // árboc helye a forgózsámolyhoz képest
  const arms = new THREE.Group(); upper.add(arms);
  const A1 = new THREE.Vector3(mastX - 0.9, 1.0, 1.3), B1 = new THREE.Vector3(mastX - 0.9, 3.2, mastZ - 0.75);
  const A2 = new THREE.Vector3(mastX + 0.9, 1.0, 1.3), B2 = new THREE.Vector3(mastX + 0.9, 3.2, mastZ - 0.75);
  const A3 = new THREE.Vector3(mastX - 0.9, 2.8, 0.3), B3 = new THREE.Vector3(mastX - 0.9, 6.8, mastZ - 0.75);
  const A4 = new THREE.Vector3(mastX + 0.9, 2.8, 0.3), B4 = new THREE.Vector3(mastX + 0.9, 6.8, mastZ - 0.75);
  for (const [a, b] of [[A1, B1], [A2, B2]]) arms.add(rod(a, b, 0.22, body, 10));
  for (const [a, b] of [[A3, B3], [A4, B4]]) arms.add(rod(a, b, 0.16, body, 10));
  arms.add(box(2.2, 0.5, 0.5, body, mastX, 1.0, 1.3));
  arms.add(box(2.2, 0.4, 0.4, body, mastX, 2.8, 0.3));
  // hidraulikus munkahengerek
  arms.add(rod(new THREE.Vector3(mastX - 0.5, 0.6, -0.5), new THREE.Vector3(mastX - 0.5, 4.9, mastZ - 0.9), 0.12, steel));
  arms.add(rod(new THREE.Vector3(mastX + 0.5, 0.6, -0.5), new THREE.Vector3(mastX + 0.5, 4.9, mastZ - 0.9), 0.12, steel));

  // árboc (a felsőváz koordinátáiban, de a talppontja a talajszinten)
  const mast = new THREE.Group(); mast.position.set(mastX, -1.5, mastZ); upper.add(mast); // -1.5 -> világ y=0
  const mastH = 26;
  const mastBody = box(1.1, mastH, 0.9, body, 0, mastH / 2, -0.55); mast.add(mastBody);
  // vezetősínek elöl
  mast.add(box(0.18, mastH, 0.22, steel, -0.62, mastH / 2, 0.02));
  mast.add(box(0.18, mastH, 0.22, steel, 0.62, mastH / 2, 0.02));
  // rácsozat-imitáció (vízszintes bordák)
  for (let y = 1; y < mastH; y += 1.6) mast.add(box(1.16, 0.12, 0.96, accent, 0, y, -0.55));
  // árbocfej csigákkal
  mast.add(box(1.4, 1.0, 1.4, dark, 0, mastH + 0.4, -0.35));
  mast.add(cylX(0.45, 1.5, steel, 0, mastH + 0.9, -0.1, 20));
  // árboctalp + csigatisztító keret
  const foot = box(2.4, 0.5, 1.6, dark, 0, 0.25, -0.2); mast.add(foot);
  const cleaner = new THREE.Group(); cleaner.position.set(0, 1.1, 0.95); mast.add(cleaner);
  cleaner.add(box(1.7, 0.16, 0.16, steel, 0, 0, 0.75));
  cleaner.add(box(0.16, 0.16, 1.5, steel, -0.85, 0, 0)); cleaner.add(box(0.16, 0.16, 1.5, steel, 0.85, 0, 0));
  cleaner.add(box(0.5, 0.06, 0.12, M(0xd8b24a), 0.45, 0.02, 0.35)); // kaparólap
  cleaner.add(box(0.12, 0.6, 0.12, steel, -0.85, -0.35, 0.75)); cleaner.add(box(0.12, 0.6, 0.12, steel, 0.85, -0.35, 0.75));
  // forgatófej a síneken (y állítható)
  const head = new THREE.Group(); mast.add(head);
  head.add(box(1.7, 2.1, 1.3, accent, 0, 0, 0.75));
  head.add(box(1.75, 0.3, 1.35, dark, 0, 0.95, 0.75));
  head.add(cyl(0.6, 0.6, 0.5, dark, 0, -1.25, 1.4, 24)); // hajtómű alul
  head.add(cyl(0.28, 0.28, 0.8, steel, 0, 1.45, 1.4, 16)); // betonforgó (swivel)
  head.add(cylZ(0.5, 0.6, dark, -1.0, 0.4, 0.75, 16)); head.add(cylZ(0.5, 0.6, dark, 1.0, 0.4, 0.75, 16)); // hidromotorok
  // csiga függesztési pontja a fej alatt: helyi (0, -1.5, 1.4)
  const augerMount = new THREE.Group(); augerMount.position.set(0, -1.5, 1.4); head.add(augerMount);
  // kötelek az árbocfejtől a fejig (2 db), később setRod-dal frissítve
  const ropes = [rod(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.04, dark), rod(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.04, dark)];
  ropes.forEach(r => mast.add(r));
  // gémkötél az ellensúlytól az árbocfejig (stabilizáló)
  const backstay = rod(new THREE.Vector3(mastX - 0.6, 2.7, -4.0), new THREE.Vector3(mastX - 0.6, mastH - 0.5, mastZ - 0.9), 0.045, dark); upper.add(backstay);
  const backstay2 = rod(new THREE.Vector3(mastX + 0.6, 2.7, -4.0), new THREE.Vector3(mastX + 0.6, mastH - 0.5, mastZ - 0.9), 0.045, dark); upper.add(backstay2);

  rig.userData = { tracks, upper, mast, head, augerMount, cleaner, ropes, mastH, mastX, mastZ };
  return rig;
}
export function setRigHead(rig, y) { // forgatófej magassága (a csiga függesztése y-nál)
  const u = rig.userData; u.head.position.y = y + 1.5; // augerMount lokál y = -1.5
  const top = new THREE.Vector3(0, u.mastH + 0.9, 0.3);
  setRod(u.ropes[0], new THREE.Vector3(-0.45, u.mastH + 0.9, 0.3), new THREE.Vector3(-0.45, y + 2.45, 0.9));
  setRod(u.ropes[1], new THREE.Vector3(0.45, u.mastH + 0.9, 0.3), new THREE.Vector3(0.45, y + 2.45, 0.9));
}

// ---------- betonszivattyú (utánfutós) + mixer ----------
export function buildPump(colors) {
  const g = new THREE.Group();
  const body = M(colors.pump || 0xd9d9d9), dark = M(0x2b2f36), steel = M(0x9aa3ad, { metalness: 0.5 });
  g.add(box(4.2, 1.4, 1.9, body, 0, 1.25, 0));
  g.add(box(4.25, 0.12, 1.95, M(colors.pumpAccent || 0x1e63b8), 0, 1.98, 0));
  g.add(box(1.4, 0.8, 1.8, dark, -1.0, 2.35, 0)); // motorház
  // garat (hopper) hátul
  g.add(cyl(0.9, 0.5, 0.9, steel, 1.9, 1.9, 0, 4).rotateY(Math.PI / 4));
  g.add(box(1.6, 0.1, 1.6, M(0x50565e), 1.9, 2.35, 0));
  // kerekek
  g.add(cylX(0.5, 0.35, dark, -0.4, 0.5, 1.0, 16)); g.add(cylX(0.5, 0.35, dark, -0.4, 0.5, -1.0, 16));
  g.add(cylX(0.5, 0.35, dark, 0.7, 0.5, 1.0, 16)); g.add(cylX(0.5, 0.35, dark, 0.7, 0.5, -1.0, 16));
  g.add(cyl(0.06, 0.06, 1.0, steel, -2.2, 0.5, 0, 8)); g.add(box(0.5, 0.2, 0.3, steel, -2.4, 0.55, 0)); // vonórúd
  g.userData = { outlet: new THREE.Vector3(-2.1, 1.0, 0) };
  return g;
}
export function buildMixer(colors) {
  const g = new THREE.Group();
  const cabM = M(colors.mixerCab || 0xf2f2f2), dark = M(0x2b2f36), drumM = M(colors.mixerDrum || 0xe8e8e8, { roughness: 0.45 }), stripe = M(colors.mixerStripe || 0x1e63b8);
  const glass = M(0x8fc7ff, { roughness: 0.15, transparent: true, opacity: 0.7 });
  // alváz + kerekek (x irányban hosszú, +x az eleje)
  g.add(box(9.0, 0.5, 2.4, dark, 0, 0.85, 0));
  for (const x of [3.2, -1.2, -2.6]) for (const z of [1.15, -1.15]) g.add(cylX(0.55, 0.4, dark, x, 0.55, z, 18));
  // fülke
  g.add(box(2.2, 1.2, 2.4, cabM, 3.4, 1.7, 0));
  g.add(box(2.1, 1.3, 2.3, glass, 3.4, 2.85, 0));
  g.add(box(2.2, 0.15, 2.4, cabM, 3.4, 3.55, 0));
  g.add(box(0.1, 1.3, 2.3, cabM, 2.4, 2.85, 0));
  // dob (ferde, forgatható)
  const drumPivot = new THREE.Group(); drumPivot.position.set(-0.6, 2.6, 0); drumPivot.rotation.z = 0.22; g.add(drumPivot);
  const drum = new THREE.Group(); drumPivot.add(drum);
  drum.add(cylX(1.15, 3.6, drumM, 0, 0, 0, 28));
  drum.add(cyl(0.7, 1.15, 1.4, drumM, -2.5, 0, 0, 28).rotateZ(Math.PI / 2));
  drum.add(cyl(1.15, 0.9, 1.0, drumM, 2.3, 0, 0, 28).rotateZ(Math.PI / 2));
  for (let i = 0; i < 3; i++) { const s = cylX(1.17, 0.2, stripe, -1.2 + i * 1.3, 0, 0, 28); drum.add(s); }
  // adagoló csúszda hátul
  g.add(box(1.6, 0.15, 0.7, dark, -4.4, 2.0, 0).rotateZ(-0.6));
  g.add(cyl(0.6, 0.6, 0.7, dark, -4.0, 2.9, 0, 16).rotateZ(Math.PI / 2));
  g.userData = { drum };
  return g;
}

// ---------- kotró ----------
export function buildExcavator(colors) {
  const g = new THREE.Group();
  const body = M(colors.excavator || 0xf0b323), dark = M(0x2b2f36), steel = M(0x9aa3ad, { metalness: 0.5 });
  const glass = M(0x8fc7ff, { roughness: 0.15, transparent: true, opacity: 0.7 });
  const tracks = new THREE.Group(); g.add(tracks);
  for (const x of [-1.2, 1.2]) { tracks.add(box(0.7, 0.9, 4.2, dark, x, 0.5, 0)); tracks.add(cylX(0.45, 0.72, dark, x, 0.5, 2.0, 16)); tracks.add(cylX(0.45, 0.72, dark, x, 0.5, -2.0, 16)); }
  tracks.add(box(2.0, 0.5, 2.0, dark, 0, 0.9, 0));
  const upper = new THREE.Group(); upper.position.y = 1.15; g.add(upper);
  upper.add(box(2.6, 1.3, 3.4, body, 0, 0.65, -0.6));
  upper.add(box(2.7, 0.9, 1.2, dark, 0, 0.45, -2.2));
  upper.add(box(1.1, 1.5, 1.4, glass, -0.7, 1.9, 0.6)); upper.add(box(1.15, 0.12, 1.45, body, -0.7, 2.7, 0.6));
  const boomPivot = new THREE.Group(); boomPivot.position.set(0.55, 1.2, 0.6); upper.add(boomPivot);
  const boom = new THREE.Group(); boomPivot.add(boom);
  boom.add(box(0.5, 0.7, 4.6, body, 0, 0, 2.3).rotateX(0)); // gém z irányba
  const stickPivot = new THREE.Group(); stickPivot.position.set(0, 0, 4.6); boom.add(stickPivot);
  stickPivot.add(box(0.4, 0.5, 3.0, body, 0, 0, 1.5));
  const bucketPivot = new THREE.Group(); bucketPivot.position.set(0, 0, 3.0); stickPivot.add(bucketPivot);
  const bucket = new THREE.Group(); bucketPivot.add(bucket);
  bucket.add(box(1.3, 0.9, 0.9, steel, 0, -0.45, 0.35));
  bucket.add(box(1.32, 0.1, 0.5, dark, 0, -0.95, 0.75));
  // hidraulikus hengerek
  boom.add(rod(new THREE.Vector3(0.35, -0.6, 0.4), new THREE.Vector3(0.35, 0.3, 2.6), 0.09, steel));
  stickPivot.add(rod(new THREE.Vector3(0, 0.6, -1.2), new THREE.Vector3(0, 0.35, 1.2), 0.08, steel));
  g.userData = { upper, boomPivot, stickPivot, bucketPivot, bucket };
  return g;
}
export function setExcavatorPose(ex, boomA, stickA, bucketA, slew = 0) {
  const u = ex.userData; u.upper.rotation.y = slew; u.boomPivot.rotation.x = -boomA; u.stickPivot.rotation.x = stickA; u.bucketPivot.rotation.x = bucketA;
}

// ---------- lánctalpas daru rácsos gémmel ----------
export function buildCrane(colors) {
  const g = new THREE.Group();
  const body = M(colors.crane || 0xc8102e), dark = M(0x2b2f36), steel = M(0x9aa3ad, { metalness: 0.5 });
  const glass = M(0x8fc7ff, { roughness: 0.15, transparent: true, opacity: 0.7 });
  for (const x of [-1.8, 1.8]) { g.add(box(0.9, 1.1, 7.0, dark, x, 0.6, 0)); g.add(cylX(0.55, 0.92, dark, x, 0.6, 3.3, 16)); g.add(cylX(0.55, 0.92, dark, x, 0.6, -3.3, 16)); }
  g.add(box(3.2, 0.6, 3.0, dark, 0, 1.2, 0));
  const upper = new THREE.Group(); upper.position.y = 1.5; g.add(upper);
  upper.add(box(3.2, 1.4, 5.6, body, 0, 0.7, -1.4));
  upper.add(box(3.3, 1.8, 1.4, dark, 0, 0.9, -3.9)); // ellensúly
  upper.add(box(1.1, 1.5, 1.6, glass, -1.0, 2.15, 1.4)); upper.add(box(1.15, 0.12, 1.65, body, -1.0, 2.95, 1.4));
  // gém: rácsos szerkezet imitáció
  const boomPivot = new THREE.Group(); boomPivot.position.set(0, 1.2, 1.6); upper.add(boomPivot);
  const boomLen = 24;
  const boom = new THREE.Group(); boomPivot.add(boom);
  for (const [x, y] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) boom.add(box(0.14, 0.14, boomLen, body, x, y, boomLen / 2));
  for (let z = 1; z < boomLen; z += 1.5) { boom.add(box(1.0, 0.08, 0.08, body, 0, -0.45, z)); boom.add(box(1.0, 0.08, 0.08, body, 0, 0.45, z)); boom.add(box(0.08, 1.0, 0.08, body, -0.45, 0, z)); boom.add(box(0.08, 1.0, 0.08, body, 0.45, 0, z)); }
  boom.add(cylX(0.35, 1.2, steel, 0, 0, boomLen, 16)); // gémcsúcs csiga
  // gémkötél a felsőváz hátuljától a gémcsúcsig
  const pendant = rod(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.05, dark); upper.add(pendant);
  const aframe = new THREE.Group(); upper.add(aframe);
  aframe.add(rod(new THREE.Vector3(-0.8, 1.4, -2.2), new THREE.Vector3(0, 6.0, -1.2), 0.12, body));
  aframe.add(rod(new THREE.Vector3(0.8, 1.4, -2.2), new THREE.Vector3(0, 6.0, -1.2), 0.12, body));
  // teherkötél + horog
  const hoist = rod(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.04, dark); g.add(hoist);
  const hook = new THREE.Group(); g.add(hook);
  hook.add(box(0.5, 0.7, 0.3, dark, 0, -0.35, 0));
  hook.add(cyl(0.05, 0.05, 0.9, steel, 0, -1.1, 0, 8).rotateX(0));
  hook.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 16, Math.PI * 1.3), steel).translateY(-1.7).rotateZ(-Math.PI * 0.6));
  g.userData = { upper, boomPivot, boom, boomLen, pendant, hoist, hook };
  return g;
}
// daru pozícionálása: gém dőlésszöge (rad, vízszintestől), horog magassága (világ y), felsőváz elforgatása
export function setCranePose(crane, boomAngle, hookY, slew = 0) {
  const u = crane.userData; u.upper.rotation.y = slew; u.boomPivot.rotation.x = -boomAngle;
  const tipLocal = new THREE.Vector3(0, 0, u.boomLen); const tipWorld = u.boom.localToWorld(tipLocal.clone());
  crane.updateMatrixWorld(true);
  const tipW = u.boom.localToWorld(new THREE.Vector3(0, 0, u.boomLen));
  const tipInCrane = crane.worldToLocal(tipW.clone());
  const hookPos = new THREE.Vector3(tipInCrane.x, hookY, tipInCrane.z);
  setRod(u.hoist, tipInCrane, hookPos);
  u.hook.position.copy(hookPos);
  const tipInUpper = u.upper.worldToLocal(tipW.clone());
  setRod(u.pendant, new THREE.Vector3(0, 6.0, -1.2), tipInUpper);
  return tipW;
}

// ---------- vasalókosár ----------
export function buildCage(o) {
  const { length = 12, radius = 0.33, nBars = 10, barR = 0.03, spiralPitch = 0.25, barsAbove = 1.3, colors } = o;
  const g = new THREE.Group();
  const steel = M(colors.rebar || 0x7a5a3a, { metalness: 0.35, roughness: 0.6 });
  for (let i = 0; i < nBars; i++) { const a = i / nBars * Math.PI * 2; g.add(cyl(barR, barR, length, steel, Math.cos(a) * radius, length / 2, Math.sin(a) * radius, 8)); }
  const spiralLen = length - barsAbove - 0.15;
  const turns = spiralLen / spiralPitch;
  const spiral = new THREE.Mesh(helixRibbon(radius + barR * 0.9, radius + barR * 2.1, spiralPitch, turns, 0.02, 24), M(colors.rebar || 0x7a5a3a, { metalness: 0.35, roughness: 0.6, side: THREE.DoubleSide }));
  spiral.position.y = 0.1; spiral.castShadow = true; g.add(spiral);
  // távtartó kerekek (3 szinten, 3-3 db)
  const spacerM = M(0xdddddd, { roughness: 0.6 });
  for (const y of [1.0, spiralLen / 2, spiralLen - 0.8]) for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.3; const s = cylZ(0.11, 0.06, spacerM, Math.cos(a) * (radius + 0.08), y, Math.sin(a) * (radius + 0.08), 12); s.lookAt(new THREE.Vector3(0, y, 0)); g.add(s); }
  // emelőfül felül
  g.add(box(0.5, 0.06, 0.06, steel, 0, length - 0.03, 0)); g.add(box(0.06, 0.06, 0.5, steel, 0, length - 0.03, 0));
  // emelőkeret felül (a hosszvasak fölé nyúlnak)
  g.userData = { length, radius };
  return g;
}

// ---------- talajtömb hornyolt homlokfelülettel ----------
// rétegek: [{top, bottom, color}] (top/bottom pozitív mélység m-ben). W: fél szélesség x-ben, Dz: mélység z-ben (a tömb z<0). R: horony sugara.
// A shape az (x, z) síkban készül (z<=0 a tömb), az extrude irányát (e) a világ -y-ba képezzük: (x, zq, e) -> (x, -top-e, zq). Determináns +1, a lapok kifelé néznek.
export function buildSoil(layers, W, Dz, R, opts = {}) {
  const g = new THREE.Group();
  for (const L of layers) {
    const h = L.bottom - L.top;
    const shape = new THREE.Shape();
    shape.moveTo(-W, 0); shape.lineTo(-R, 0);
    shape.absarc(0, 0, R, Math.PI, Math.PI * 2, false); // félkör a tömb belsejébe (z<0)
    shape.lineTo(W, 0); shape.lineTo(W, -Dz); shape.lineTo(-W, -Dz); shape.lineTo(-W, 0);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 28 });
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), zq = pos.getY(i), e = pos.getZ(i); pos.setXYZ(i, x, -L.top - e, zq); }
    pos.needsUpdate = true; geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: L.color, roughness: 0.95, map: L.map || null });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.layer = L;
    g.add(mesh);
  }
  g.userData = { layers, W, Dz, R };
  return g;
}

// ---------- fúradékkúp, részecskék ----------
export function buildSpoilHeap(color) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1), M(color, { roughness: 1 }));
  m.castShadow = true; m.receiveShadow = true; m.position.y = 0.5; // egységkúp, alul-középen origó
  const g = new THREE.Group(); g.add(m); g.userData = { cone: m }; return g;
}
export function setHeap(heap, radius, height) { heap.userData.cone.scale.set(radius, Math.max(0.001, height), radius); heap.userData.cone.position.y = Math.max(0.001, height) / 2; }

export function buildParticles(n, color, size = 0.12) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData = { n }; return pts;
}

// egyszerű ember-figura (méretarány-jelzés)
export function buildWorker(colors) {
  const g = new THREE.Group();
  const vest = M(colors.vest || 0xff7a00), pants = M(0x2c3e66), skin = M(0xe0b090), helmet = M(colors.helmet || 0xffffff);
  g.add(box(0.36, 0.8, 0.22, pants, 0, 0.4, 0));
  g.add(box(0.44, 0.62, 0.26, vest, 0, 1.11, 0));
  g.add(cyl(0.12, 0.12, 0.2, skin, 0, 1.52, 0, 10));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), helmet).translateY(1.7));
  g.add(box(0.1, 0.55, 0.1, vest, -0.28, 1.12, 0)); g.add(box(0.1, 0.55, 0.1, vest, 0.28, 1.12, 0));
  return g;
}

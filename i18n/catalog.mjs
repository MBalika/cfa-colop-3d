// katalógus: egyedi magyar szövegek azonosítóval (sha1 első 7 jegye), fájlonként, első előfordulás sorrendjében
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { htmlUnits, jsUnits } from './units.mjs'; import { classify } from './classify.mjs';
export const hid = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 7);
export function collect(root, files) { const U = []; for (const f of files) { const src = fs.readFileSync(path.join(root, f), 'utf8'); const us = f.endsWith('.html') ? htmlUnits(src, f) : jsUnits(src, f); for (const u of us) { u.cls = classify(u); u.id = hid(u.t); u.line = src.slice(0, u.s).split('\n').length; U.push(u); } } return U; }
if (process.argv[1].endsWith('catalog.mjs')) {
  const [root, out, ...files] = process.argv.slice(2); const U = collect(root, files); const seen = new Set(); let txt = '';
  for (const f of files) { txt += `\n##### ${f}\n`; for (const u of U) { if (u.file !== f || u.cls !== 'hu' || seen.has(u.id)) continue; seen.add(u.id); txt += `${u.id}\t${u.t.replace(/\n/g, '⏎')}\n`; } }
  fs.writeFileSync(out, txt); console.log('unique hu', seen.size, 'chars', [...U].filter(u => u.cls === 'hu').reduce((a, u) => a, 0));
}

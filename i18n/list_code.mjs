import { collect } from './catalog.mjs';
const [root, ...files] = process.argv.slice(2); const U = collect(root, files); const seen = new Set();
for (const u of U) { if (u.cls !== 'code') continue; if (seen.has(u.id)) continue; seen.add(u.id); const t = u.t.replace(/\$\{[^}]*\}/g, ' ');
  if (!/[A-Za-zÀ-ž]{2,}\s+[A-Za-zÀ-ž*]{2,}/.test(t) && !/^[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]{2,}/.test(t)) continue;
  console.log(`${u.id}\t${u.file}:${u.line}\t${u.t.slice(0, 150).replace(/\n/g, '⏎')}`); }

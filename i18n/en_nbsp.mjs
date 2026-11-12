// Angol tördelési szabály a JS-karakterláncokban: a névelő (a, an, the) után nem törő szóköz, hogy ne maradjon a sor végén.
// usage: node en_nbsp.mjs <fájl.js>  (modul; csak a karakterlánc- és sablonliterálokat módosítja)
import fs from 'fs'; import * as acorn from 'acorn'; import * as walk from 'acorn-walk';
const f = process.argv[2]; const src = fs.readFileSync(f, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
const RE = /(^|[\s(“])(a|an|A|An|the|The) (?=[\p{L}\d*<“(])/gu;
const edits = [];
const fix = (s, e) => { const raw = src.slice(s, e); const out = raw.replace(RE, '$1$2 '); if (out !== raw) edits.push([s, e, out]); };
walk.full(ast, (n) => {
  if (n.type === 'Literal' && typeof n.value === 'string' && /\s/.test(n.value)) fix(n.start, n.end);
  if (n.type === 'TemplateElement') fix(n.start, n.end);
});
let out = src; for (const [s, e, t] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + t + out.slice(e);
fs.writeFileSync(f, out); console.log(f, edits.length, 'karakterlánc');

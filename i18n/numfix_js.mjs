// angol változat: a JS karakterlánc-literálokban és sablonrészekben a tizedesvessző → pont (képletek, behelyettesítések)
// Használat: node numfix_js.mjs <fájl>... (helyben ír);  LIST=1 → csak kilistázza az érintett literálokat
import fs from 'fs'; import * as acorn from 'acorn'; import * as walk from 'acorn-walk';
const SKIP = /rgba?\(|hsla?\(|points=|viewBox|\bd=\"|#include|void main|\bvec[234]\b|\buniform |\bvarying |^,|,\d+,\d+,/;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8'); let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: process.env.MODULE || f.includes('sim3d') || f.includes('calc3d') ? 'module' : 'script', ranges: true }); } catch (e) { console.error(f, e.message); process.exit(1); }
  const edits = [];
  const fix = (s, e, raw) => { if (!/\d,\d/.test(raw) || SKIP.test(raw)) return; const nr = raw.replace(/(\d),(?=\d)/g, (m, d, off) => /[MLHVCSQTAmlhvcsqta]-?[\d.]*$/.test(raw.slice(0, off + 1)) || /\{\d*$/.test(raw.slice(0, off + 1)) ? m : d + '.');   // SVG-útvonal (l8,11) és regex-kvantor ({0,5}) kivétel
  if (nr === raw) return; if (process.env.LIST) console.log(f + '\t' + raw.slice(0, 120)); edits.push([s, e, nr]); };
  walk.full(ast, (n) => {
    if (n.type === 'Literal' && typeof n.value === 'string') fix(n.start + 1, n.end - 1, src.slice(n.start + 1, n.end - 1));
    else if (n.type === 'TemplateElement') fix(n.start, n.end, src.slice(n.start, n.end));
  });
  if (process.env.LIST) continue;
  edits.sort((a, b) => b[0] - a[0]); let out = src; for (const [s, e, nr] of edits) out = out.slice(0, s) + nr + out.slice(e);
  fs.writeFileSync(f, out); console.log(f.split('/').pop(), 'tizedespont:', edits.length);
}

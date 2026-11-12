// Fordítási egységek kinyerése: HTML (parse5) és JS (acorn) forrásból, pontos forráspozíciókkal.
// Egység = egy szöveges blokk belső HTML-je (ha csak szöveget és soron belüli elemeket tartalmaz), egy szöveges attribútum,
// vagy egy JS-karakterlánc / sablonliterál (a ${…} kifejezésekkel együtt, ha nincs benne beágyazott sablon).
import * as acorn from 'acorn'; import * as walk from 'acorn-walk'; import { parse } from 'parse5';
const INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'sub', 'sup', 'span', 'small', 'br', 'code', 'abbr', 'mark', 'u', 's', 'kbd', 'wbr', 'q', 'tspan', 'bdi', 'time', 'var']);
const SKIPEL = new Set(['script', 'style', 'template']);
const ATTRS = ['alt', 'title', 'aria-label', 'placeholder', 'data-title', 'data-tip', 'data-label', 'data-cap', 'data-q', 'data-text', 'data-hint', 'data-name', 'data-desc', 'label'];
// csak számot (tizedesvesszővel), jeleket és mértékegységet tartalmazó karakterlánc, pl. '0,5 m', '≥ 2,00 m' (rgb-hármas nem)
export const numLike = (t) => t.length < 40 && /\d,\d/.test(t) && !/\d+,\d+,\d+/.test(t) && !/\p{L}{2,}/u.test(t.replace(/(mm|cm|kPa|MPa|kN|m²|m³)/g, ''));
export const hasWords = (s) => /\p{L}{2,}/u.test(s.replace(/<[^>]*>|&[a-z#0-9]+;|\$\{[^}]*\}/gi, ' '));
// inline = true: a <script> blokkok (src nélkül) JS-egységei is (egyfájlos oldalakhoz)
export function htmlUnits(src, file, inline = true) {
  const doc = parse(src, { sourceCodeLocationInfo: true }); const out = [];
  const isInlineOnly = (n) => (n.childNodes || []).every(c => c.nodeName === '#text' || c.nodeName === '#comment' || (INLINE.has(c.nodeName) && isInlineOnly(c)));
  const attrs = (n) => { const L = n.sourceCodeLocation; if (!L || !L.attrs) return; for (const a of n.attrs || []) { const want = ATTRS.includes(a.name) || (a.name === 'content' && n.nodeName === 'meta'); if (!want || !hasWords(a.value)) continue; const loc = L.attrs[a.name]; const raw = src.slice(loc.startOffset, loc.endOffset); const i = raw.indexOf('=') + 1; let s = loc.startOffset + i, e = loc.endOffset; if (/["']/.test(src[s])) { s++; e--; } out.push({ file, kind: 'attr:' + a.name, s, e, t: src.slice(s, e) }); } };
  const visit = (n, inSvg) => {
    if (n.nodeName === 'script' && inline) { const a = Object.fromEntries((n.attrs || []).map(x => [x.name, x.value])); const c = (n.childNodes || [])[0];
      if (!a.src && c && c.sourceCodeLocation && (!a.type || /^(module|text\/javascript)$/.test(a.type))) { const o = c.sourceCodeLocation.startOffset; for (const u of jsUnits(src.slice(o, c.sourceCodeLocation.endOffset), file)) { u.s += o; u.e += o; if (u.ex) u.ex = u.ex.map(x => ({ ...x, s: x.s + o, e: x.e + o })); out.push(u); } }
      return; }
    if (SKIPEL.has(n.nodeName)) return;
    if (n.nodeName !== '#document' && n.nodeName !== '#text' && n.nodeName !== '#comment' && n.nodeName !== '#documentType') attrs(n);
    const kids = n.childNodes || (n.content ? n.content.childNodes : []);
    const L = n.sourceCodeLocation;
    if (L && L.startTag && L.endTag && n.nodeName !== 'html' && n.nodeName !== 'body' && n.nodeName !== 'head' && kids.length && isInlineOnly(n)) {
      const s = L.startTag.endOffset, e = L.endTag.startOffset; const t = src.slice(s, e);
      if (hasWords(t)) { const lead = t.length - t.trimStart().length, trail = t.length - t.trimEnd().length; out.push({ file, kind: 'html:' + n.nodeName, s: s + lead, e: e - trail, t: t.trim() }); }
      for (const c of kids) if (c.nodeName !== '#text' && c.nodeName !== '#comment') attrsDeep(c);
      return;
    }
    for (const c of kids) {
      if (c.nodeName === '#text') { const cl = c.sourceCodeLocation; if (!cl) continue; const t = src.slice(cl.startOffset, cl.endOffset); if (!hasWords(t)) continue; const lead = t.length - t.trimStart().length, trail = t.length - t.trimEnd().length; out.push({ file, kind: 'text', s: cl.startOffset + lead, e: cl.endOffset - trail, t: t.trim() }); }
      else if (c.nodeName !== '#comment') visit(c, inSvg || c.nodeName === 'svg');
    }
  };
  const attrsDeep = (n) => { attrs(n); for (const c of n.childNodes || []) if (c.nodeName !== '#text' && c.nodeName !== '#comment') attrsDeep(c); };
  visit(doc, false);
  return out.sort((a, b) => a.s - b.s);
}
export function jsUnits(src, file) {
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }); } catch (e) { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }); }
  const out = []; const tpl = [];
  walk.full(ast, (n) => {
    if (n.type === 'Literal' && typeof n.value === 'string') out.push({ file, kind: 'str', s: n.start + 1, e: n.end - 1, t: src.slice(n.start + 1, n.end - 1), q: src[n.start] });
    if (n.type === 'TemplateLiteral') tpl.push(n);
  });
  for (const n of tpl) {
    const nested = tpl.some(m => m !== n && m.start > n.start && m.end < n.end);
    if (!nested) out.push({ file, kind: 'tpl', s: n.start + 1, e: n.end - 1, t: src.slice(n.start + 1, n.end - 1), q: '`', ex: n.expressions.map(x => ({ s: x.start, e: x.end, t: src.slice(x.start, x.end) })) });
    else for (const q of n.quasis) out.push({ file, kind: 'quasi', s: q.start, e: q.end, t: src.slice(q.start, q.end), q: '`' });
  }
  // a beágyazott sablonok külső darabjai és a belső teljes sablonok nem fedhetik egymást: a teljes sablon nyer, a vele átfedő quasi kiesik
  const full = out.filter(u => u.kind === 'tpl');
  return out.filter(u => u.kind !== 'quasi' || !full.some(f => f.s < u.e && u.s < f.e)).filter(u => hasWords(u.t) || numLike(u.t)).sort((a, b) => a.s - b.s);
}

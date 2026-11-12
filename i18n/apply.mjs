// Fordítás alkalmazása: a forrásfájlok egységeit (units.mjs) a TSV-ben megadott angol szövegre cseréli, pontos forráspozíció szerint.
// TSV sor: <id>\t<angol>  vagy  <id>@<fájl>:<sor>\t<angol>  (egy adott előfordulásra); az angol "=" esetén változatlan marad.
// A "?"-lel kezdődő angol szöveg a HTML-címkeellenőrzést kikapcsolja. Hibánál (hiányzó fordítás, rossz idézőjel, eltérő ${…}) leáll.
import fs from 'fs'; import path from 'path'; import { collect } from './catalog.mjs'; import { numLike } from './units.mjs';
export function loadTSV(files) { const T = new Map(); for (const f of files) { if (!fs.existsSync(f)) continue; for (const ln of fs.readFileSync(f, 'utf8').split('\n')) { if (!ln.trim() || ln.startsWith('#')) continue; const i = ln.indexOf('\t'); if (i < 0) throw new Error('rossz TSV-sor: ' + ln.slice(0, 80)); T.set(ln.slice(0, i).trim(), ln.slice(i + 1).replace(/⏎/g, '\n')); } } return T; }
const exprs = (s) => (s.match(/\$\{[^}]*\}/g) || []).sort().join('|');
const tags = (s) => (s.match(/<\/?([a-z0-9]+)/gi) || []).map(x => x.toLowerCase()).sort().join(',');
export function applyAll(root, files, T, { strict = true, numfix = !!process.env.NUMFIX } = {}) {
  const U = collect(root, files); const out = {}; const missing = [], errors = []; const used = new Set();
  for (const f of files) {
    let src = fs.readFileSync(path.join(root, f), 'utf8'); const us = U.filter(u => u.file === f).sort((a, b) => b.s - a.s);
    // az azonos sorban ugyanazzal a szöveggel álló egységek sorszáma (balról, 1-től): <id>@<fájl>:<sor>#<n>
    const nth = new Map(); for (const u of us.slice().sort((a, b) => a.s - b.s)) { const k = u.id + ':' + u.line; nth.set(k, (nth.get(k) || 0) + 1); u.nth = nth.get(k); }
    const look = (u) => { const on = `${u.id}@${f}:${u.line}#${u.nth}`, ok = `${u.id}@${f}:${u.line}`; const fk = u.id + '!'; return T.has(on) ? (used.add(on), T.get(on)) : T.has(ok) ? (used.add(ok), T.get(ok)) : T.has(fk) ? (used.add(fk), T.get(fk)) : T.has(u.id) && u.cls !== 'code' ? (used.add(u.id), T.get(u.id)) : null; };   // <id>! = minden előfordulás, osztálytól függetlenül
    const enOf = new Map(us.map(u => [u, look(u)]));
    // lefordított sablonliterál: a ${…} kifejezésekben lévő karakterláncokat is lefordítjuk, és a belső egységeket külön nem cseréljük
    const consumed = new Set();
    for (const u of us) { const en = enOf.get(u); if (u.kind !== 'tpl' || en === null || en === '=' || !u.ex.length) continue;
      let out = en.startsWith('?') ? en.slice(1) : en;
      for (const x of u.ex) { const inner = us.filter(v => v !== u && v.s >= x.s && v.e <= x.e).sort((a, b) => b.s - a.s); let xt = x.t;
        for (const v of inner) { consumed.add(v); const ve = enOf.get(v); if (ve === null) { if (v.cls === 'hu') missing.push(v); continue; } if (ve === '=') continue; xt = xt.slice(0, v.s - x.s) + ve + xt.slice(v.e - x.s); }
        if (xt !== x.t) { if (!out.includes('${' + x.t + '}')) errors.push(`${f}:${u.line} [${u.id}] a kifejezés nem található a fordításban: \${${x.t}}`); out = out.split('${' + x.t + '}').join('${' + xt + '}'); } }
      u.tx = out; u.txSkip = en.startsWith('?'); }
    // lefordított HTML-blokkba ágyazott egységek (pl. egy gyerekelem attribútuma): a blokk fordítása tartalmazza őket
    for (const u of us) { const en = enOf.get(u); if (!u.kind.startsWith('html') || en === null || en === '=') continue;
      for (const v of us) if (v !== u && v.s >= u.s && v.e <= u.e) consumed.add(v); }
    for (const u of us) {
      if (consumed.has(u)) continue;
      let en = enOf.get(u);
      // tizedesvessző → pont a le nem fordított, csak számot (és mértékegységet) tartalmazó karakterláncokban (pl. '0,5 m')
      if (en === null && numfix && numLike(u.t)) en = u.t.replace(/(\d),(\d)/g, '$1.$2');
      if (en === null) { if (u.cls === 'hu') missing.push(u); continue; }
      if (en === '=') continue;
      let skipTags = false; if (en.startsWith('?')) { skipTags = true; en = en.slice(1); }
      // a szöveg eleji/végi szóköz a TSV-ben könnyen elvész: az eredetiét megtartjuk
      { const lead = u.t.match(/^[ \u00A0]*/)[0], trail = u.t.match(/[ \u00A0]*$/)[0]; if (lead && !/^[ \u00A0]/.test(en)) en = lead + en; if (trail && !/[ \u00A0]$/.test(en)) { en = en + trail; if (u.tx !== undefined && !/[ \u00A0]$/.test(u.tx)) u.tx += trail; } }
      const isJS = u.q !== undefined;   // JS-karakterlánc (külön fájlban vagy beágyazott <script>-ben)
      if (isJS) { if (u.q === "'" && /(^|[^\\])'/.test(en)) errors.push(`${f}:${u.line} [${u.id}] ' a fordításban (egyszeres idézőjeles karakterlánc): ${en.slice(0, 60)}`);
        if (u.q === '"' && /(^|[^\\])"/.test(en)) errors.push(`${f}:${u.line} [${u.id}] " a fordításban: ${en.slice(0, 60)}`);
        if (u.q === '`' && /(^|[^\\])`/.test(en)) errors.push(`${f}:${u.line} [${u.id}] backtick a fordításban`);
        if (exprs(en) !== exprs(u.t)) errors.push(`${f}:${u.line} [${u.id}] eltérő \${…}: ${exprs(u.t)} ≠ ${exprs(en)}`); }
      if (!skipTags && tags(en) !== tags(u.t)) errors.push(`${f}:${u.line} [${u.id}] eltérő címkék: ${tags(u.t)} ≠ ${tags(en)}`);
      if (u.tx !== undefined) en = u.tx;
      src = src.slice(0, u.s) + en + src.slice(u.e);
    }
    out[f] = src;
  }
  const unused = [...T.keys()].filter(k => !used.has(k));
  return { out, missing, errors, unused };
}
if (process.argv[1].endsWith('apply.mjs')) {
  const [root, outDir, tsvList, ...files] = process.argv.slice(2); const T = loadTSV(tsvList.split(','));
  const { out, missing, errors, unused } = applyAll(root, files, T);
  const seen = new Set(); const miss = missing.filter(u => !seen.has(u.id) && seen.add(u.id));
  if (miss.length) { fs.writeFileSync(path.join(outDir, '..', 'missing.tsv'), miss.map(u => `${u.id}\t${u.t.replace(/\n/g, '⏎')}\t# ${u.file}:${u.line}`).join('\n') + '\n'); }
  console.log(`hiányzó: ${miss.length} · hiba: ${errors.length} · fel nem használt: ${unused.length}`); errors.slice(0, 40).forEach(e => console.log('  ' + e)); if (unused.length) console.log('  fel nem használt:', unused.slice(0, 20).join(' '));
  for (const f in out) { const p = path.join(outDir, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, out[f]); }
  // a sorhoz kötött kulcs (id@fájl:sor) elcsúszott, ha nem használtuk: a forrás változott, a sorszámot frissíteni kell
  const lost = unused.filter(k => k.includes('@')); if (lost.length) console.log('  elcsúszott sorkulcsok:', lost.join(' '));
  if (errors.length || ((miss.length || lost.length) && process.env.STRICT)) process.exit(1);
}

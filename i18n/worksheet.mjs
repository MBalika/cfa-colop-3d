// munkalap: a fordítandó egységek (hu + a „maybe” osztályú, szövegnek látszó egységek), egyedi azonosítóval, első előfordulás sorrendjében
import { collect } from './catalog.mjs';
const [root, ...files] = process.argv.slice(2); const U = collect(root, files); const seen = new Set();
const ID = /^[a-z0-9_-]+$/; const CODEISH = /^(main |sub, |FORCEHYPHENOPOLY|use strict|SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE|SVG|CANVAS|SELECT|OPTION|characterData|scrollRestoration|\(\^)/;
const strip = (t) => t.replace(/<[^>]*>|\$\{[^}]*\}/g, ' ').replace(/^[^<]*>/, ' ').replace(/<[^>]*$/, ' ');
for (const u of U) { if (seen.has(u.id)) continue;
  if (u.cls === 'hu' || (u.cls === 'maybe' && !ID.test(u.t) && !CODEISH.test(u.t) && /\p{L}{2,}/u.test(strip(u.t))))
  { seen.add(u.id); console.log(`${u.id}\t${u.cls === 'hu' ? '' : '~'}${u.t.replace(/\n/g, '⏎')}`); } }

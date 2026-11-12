// egységek osztályozása: 'hu' (biztosan szöveg), 'maybe' (átnézendő), 'code'
export const HUCH = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
export function classify(u) {
  const t = u.t.replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  if (u.kind.startsWith('html') || u.kind === 'text' || u.kind.startsWith('attr')) return 'hu';
  if (HUCH.test(t) || HUCH.test(u.t.replace(/\$\{[^}]*\}/g, ' '))) return 'hu';   // ékezetes betű a szövegben vagy egy beágyazott címke attribútumában (title, aria-label…)
  const s = t.trim();
  if (/^(#|\.|\[|rgba?\(|hsla?\(|var\(|url\(|data:|https?:|\/|\.\/|M[\d\s.-]|[\d.\s,-]+$)/.test(s)) return 'code';
  if (/^[a-z0-9_-]+$/i.test(s)) return /^[A-Za-z]+$/.test(s) && s.length >= 3 ? 'maybe' : 'code';  // egyetlen szó
  if (/[{};]|:\s*\d|px\b|%\)|\bvar\(--/.test(s)) return 'code';
  if (/^[\w.-]+(\s+[\w.-]+)*$/.test(s) && /\s/.test(s)) { const w = s.split(/\s+/); if (w.every(x => /^[a-z][\w-]*$/.test(x) && x.length < 14) && w.some(x => /-/.test(x))) return 'code'; return 'maybe'; }
  return 'maybe';
}

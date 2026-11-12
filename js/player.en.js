// Interaktív lejátszó a determinisztikus jelenethez: lejátszás/szünet, csúszka, fázisugrás, ablakhoz igazítás.
(function () {
  const PH = [
    ['Positioning', 6], ['Drilling', 20], ['Concrete start', 56], ['Extraction + concreting', 64], ['Spoil', 102], ['Reinforcement', 116], ['Pile head', 140], ['Finished pile', 156],
  ];
  const EN = (document.documentElement.lang || '').toLowerCase().startsWith('en');
  const css = `
  #ply{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;align-items:center;gap:14px;padding:10px 18px;background:rgba(8,12,20,0.92);color:#f3f6fa;font:14px Inter,system-ui,sans-serif;border-top:1px solid rgba(255,255,255,0.12)}
  #ply button{background:#ffb347;color:#1a1200;border:0;border-radius:999px;padding:8px 16px;font-weight:700;cursor:pointer;font:inherit;font-weight:700}
  #ply button.sec{background:rgba(255,255,255,0.12);color:#fff}
  #ply input[type=range]{flex:1;accent-color:#ffb347}
  #ply .t{font-family:Mono,monospace;min-width:92px;text-align:right}
  #ply .ph{display:flex;gap:4px;flex-wrap:wrap}
  #ply .ph button{padding:5px 10px;font-size:12px;font-weight:600}
  #ply .lang{flex:none;display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid rgba(255,255,255,.22);border-radius:999px;text-decoration:none;color:inherit;font:500 12px/1 Inter,system-ui,sans-serif;letter-spacing:.04em}
  #ply .lang b,#ply .lang span{display:inline-grid;place-items:center;min-width:30px;padding:5px 8px;border-radius:999px}
  #ply .lang b{background:#eef1f4;color:#141a20;font-weight:600}
  #ply .lang span{opacity:.75}
  #ply .lang:hover span{opacity:1;background:rgba(255,255,255,.12)}
  #stage{transform-origin:0 0}
  html,body{width:auto!important;height:auto!important;overflow:hidden!important;background:#0b1020!important}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  // színpad: a 1920x1080-as tartalom skálázása az ablakhoz
  const stage = document.createElement('div'); stage.id = 'stage'; stage.style.position = 'absolute'; stage.style.left = '0'; stage.style.top = '0'; stage.style.width = '1920px'; stage.style.height = '1080px';
  const c = document.getElementById('c'), ui = document.getElementById('ui');
  document.body.insertBefore(stage, c); stage.appendChild(c); stage.appendChild(ui);
  const bar = document.createElement('div'); bar.id = 'ply';
  bar.innerHTML = `<button id="pp">▶ Play</button><span class="t" id="tm">0:00 / 0:00</span><input type="range" id="sc" min="0" max="1000" value="0"><div class="ph" id="phs"></div>` + (EN ? '<a class="lang" id="lang" href="../" hreflang="hu" lang="hu" aria-label="Magyar változat"><span>HU</span><b>EN</b></a>' : '<a class="lang" id="lang" href="en/" hreflang="en" lang="en" aria-label="English version"><b>HU</b><span>EN</span></a>');
  document.body.appendChild(bar);
  const phs = bar.querySelector('#phs'); PH.forEach(([n, t0], i) => { const b = document.createElement('button'); b.className = 'sec'; b.textContent = (i + 1) + ' · ' + n; b.onclick = () => { seek(t0); }; phs.appendChild(b); });
  function fit() { const bh = bar.offsetHeight || 56; const s = Math.min(innerWidth / 1920, (innerHeight - bh) / 1080); stage.style.transform = `scale(${s})`; stage.style.left = ((innerWidth - 1920 * s) / 2) + 'px'; }
  addEventListener('resize', fit); fit();
  const DUR = window.__duration || 172;
  let t = 0, playing = false, last = 0, raf = 0;
  const pp = bar.querySelector('#pp'), tm = bar.querySelector('#tm'), sc = bar.querySelector('#sc');
  const fmtT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function show(tt) { t = Math.max(0, Math.min(DUR, tt)); window.__setTime(t); tm.textContent = fmtT(t) + ' / ' + fmtT(DUR); sc.value = String(Math.round(t / DUR * 1000)); }
  function seek(tt) { show(tt); }
  function loop(now) { if (!playing) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; show(t + dt); if (t >= DUR) { playing = false; pp.textContent = '↺ Again'; return; } raf = requestAnimationFrame(loop); }
  pp.onclick = () => { if (playing) { playing = false; pp.textContent = '▶ Play'; cancelAnimationFrame(raf); } else { if (t >= DUR) t = 0; playing = true; pp.textContent = '❚❚ Pause'; last = performance.now(); raf = requestAnimationFrame(loop); } };
  sc.oninput = () => { show(sc.value / 1000 * DUR); };
  // nyelvváltó: a választás megmarad (alap-lang), a másik nyelvű lejátszó ugyanott folytatódik (#t=…)
  const lg = bar.querySelector('#lang'); if (lg) lg.addEventListener('click', () => { try { localStorage.setItem('alap-lang', EN ? 'hu' : 'en'); } catch (e) {} lg.setAttribute('href', (EN ? '../' : 'en/') + (t > 0 ? '#t=' + t.toFixed(1) : '')); });
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); pp.onclick(); } if (e.code === 'ArrowRight') show(t + 2); if (e.code === 'ArrowLeft') show(t - 2); });
  const t0 = (/[#&]t=([\d.]+)/.exec(location.hash) || [])[1];
  const wait = () => { if (window.__ready) { show(t0 ? +t0 : 0); fit(); } else setTimeout(wait, 50); }; wait();
})();

/* ============================================================
   FAHRENHEIT — main app: entrance, transitions, glitch title,
   background drift, scroll reveal, gallery + lightbox.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- image manifests (hardcoded so file:// works) ---------- */
  const PORTFOLIO = ['DSC_0378','DSC_0405','DSC_0452','DSC_0723','DSC_0997','DSC_1215',
                     'DSC_1226','DSC_0661','DSC_0667','DSC_1134','DSC_1255','DSC_1257',
                     'DSC_1070','DSC_0388','DSC_0120'];
  const LANDSCAPE = ['DSC_1913','DSC_1817','DSC_1485','DSC_1470','DSC_1309','DSC_0541',
                     'DSC_0542','DSC_0571','DSC_1245','DSC_2029','DSC_0366'];
  const BGS = ['DSC_1051','DSC_0190','DSC_1383','DSC_1119','DSC_0796','DSC_1125','DSC_0234'];

  /* ---------- circuit-bent TEXT hue ----------
     Rotate the text hue OPPOSITE the background's hue rotation so the text
     colour never lands on the background colour. Synced to the same clock the
     WebGL shader uses (u_time = performance.now()*0.001, hueRotate * 0.15 rad/s).
     Falls back gracefully if WebGL isn't running. */
  (function hueDrive() {
    const root = document.documentElement.style;
    const DEG = 0.15 * 180 / Math.PI;         // shader hue rotation fallback (deg/sec)
    let cur = 300;                             // smoothed text hue

    function rgb2hue(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < 0.0001) return null;             // grey -> no meaningful hue
      let h;
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
      return h;
    }
    // shortest-path angular lerp
    function alerp(a, b, t) {
      let d = ((b - a + 540) % 360) - 180;
      return (a + d * t + 360) % 360;
    }
    function tick() {
      let bgHue;
      const s = window.__FH_bgRGB;             // real sampled background colour
      if (s) bgHue = rgb2hue(s[0], s[1], s[2]);
      if (bgHue == null) bgHue = (performance.now() * 0.001 * DEG) % 360;
      const targetTxt = (bgHue + 180) % 360;   // exact complement => never the bg hue
      cur = alerp(cur, targetTxt, 0.06);        // ease so it drifts smoothly
      root.setProperty('--cb', cur.toFixed(1));
      root.setProperty('--cb2', ((cur + 38) % 360).toFixed(1));
      requestAnimationFrame(tick);
    }
    tick();
  })();

  /* ---------- background drift cycling ---------- */
  const drift = document.getElementById('bg-drift');
  if (drift) {
    let bi = Math.random() * BGS.length | 0;
    const setBg = () => { drift.style.backgroundImage = `url("assets/bg/${BGS[bi]}.jpg")`; bi = (bi + 1) % BGS.length; };
    setBg();
    setInterval(setBg, 11000);
  }

  /* ---------- glitch title: subtle shake + occasional glyph scramble ---------- */
  const glitchEls = document.querySelectorAll('[data-glitch]');
  glitchEls.forEach(el => {
    const real = el.textContent;
    el.setAttribute('data-text', real);
    const pool = 'アカサタナ0123FHｦｧｨ華氏火度';
    function corrupt() {
      // brief scramble then restore
      const arr = real.split('');
      const hits = 1 + (Math.random() * 2 | 0);
      for (let k = 0; k < hits; k++) {
        const idx = Math.random() * arr.length | 0;
        arr[idx] = pool[Math.random() * pool.length | 0];
      }
      el.textContent = arr.join('');
      el.setAttribute('data-text', arr.join(''));
      setTimeout(() => { el.textContent = real; el.setAttribute('data-text', real); }, 70 + Math.random() * 90);
      setTimeout(corrupt, 1400 + Math.random() * 3200);
    }
    setTimeout(corrupt, 1500 + Math.random() * 2500);

    // continuous micro-shake via transform (tiny, not much)
    let sh = 0;
    (function shake() {
      sh += 0.05;
      const dx = Math.sin(sh * 2.3) * 0.8 + (Math.random() - 0.5) * 0.6;
      const dy = Math.cos(sh * 1.7) * 0.6 + (Math.random() - 0.5) * 0.5;
      el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      requestAnimationFrame(shake);
    })();
  });

  /* ---------- scroll reveal ---------- */
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---------- gallery builder ---------- */
  function buildGrid(id, list, prefix) {
    const grid = document.getElementById(id);
    if (!grid) return;
    list.forEach((n, i) => {
      const a = document.createElement('a');
      a.className = 'tile reveal';
      a.href = `assets/${prefix}/${n}.jpg`;
      a.dataset.full = `assets/${prefix}/${n}.jpg`;
      a.dataset.cap = `${prefix === 'portfolio' ? 'PORTRAIT' : 'FIELD'} // ${n}`;
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = `assets/${prefix}/${n}_t.jpg`;
      img.alt = n;
      const corner = document.createElement('span');
      corner.className = 'corner';
      corner.textContent = String(i + 1).padStart(2, '0');
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.innerHTML = `<span>${n}</span><span>華氏</span>`;
      a.append(img, corner, meta);
      grid.appendChild(a);
      io.observe(a);
    });
  }
  buildGrid('grid-portfolio', PORTFOLIO, 'portfolio');
  buildGrid('grid-landscape', LANDSCAPE, 'landscape');

  /* ---------- lightbox ---------- */
  const lb = document.getElementById('lb');
  if (lb) {
    const lbImg = lb.querySelector('img');
    const lbCap = lb.querySelector('.lb-cap');
    let seq = [], pos = 0;
    function collect() { seq = [...document.querySelectorAll('.tile')]; }
    function show(i) {
      pos = (i + seq.length) % seq.length;
      const t = seq[pos];
      lbImg.style.opacity = 0;
      const full = t.dataset.full;
      const im = new Image();
      im.onload = () => { lbImg.src = full; lbImg.style.opacity = 1; };
      im.src = full;
      lbCap.textContent = t.dataset.cap;
      if (window.FH_glitchBurst) window.FH_glitchBurst(300);
      if (window.FH_bgBurst) window.FH_bgBurst(350);
      if (window.FH_audioGlitch) window.FH_audioGlitch(260);
    }
    document.addEventListener('click', e => {
      const tile = e.target.closest('.tile');
      if (tile) { e.preventDefault(); collect(); show(seq.indexOf(tile)); lb.classList.add('open'); }
    });
    lb.querySelector('.lb-x').onclick = () => lb.classList.remove('open');
    lb.querySelector('.prev').onclick = e => { e.stopPropagation(); show(pos - 1); };
    lb.querySelector('.next').onclick = e => { e.stopPropagation(); show(pos + 1); };
    lb.addEventListener('click', e => { if (e.target === lb) lb.classList.remove('open'); });
    addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lb.classList.remove('open');
      if (e.key === 'ArrowLeft') show(pos - 1);
      if (e.key === 'ArrowRight') show(pos + 1);
    });
  }

  /* ---------- entrance overlay -> starts audio + vortex reveal ---------- */
  const enter = document.getElementById('enter');
  if (enter) {
    const go = () => {
      enter.classList.add('gone');
      if (window.FH_audioStart) window.FH_audioStart();
      if (window.FH_glitchBurst) window.FH_glitchBurst(700);
      if (window.FH_bgBurst) window.FH_bgBurst(800);
      if (window.FH_audioGlitch) setTimeout(() => window.FH_audioGlitch(500), 400);
      setTimeout(() => enter.remove(), 900);
    };
    const btn = enter.querySelector('.en-btn');
    if (btn) btn.addEventListener('click', go);
    enter.addEventListener('click', e => { if (e.target === enter) go(); });
  }

  /* ---------- page transition curtain (vortex/fade out on internal nav) ---------- */
  const curtain = document.getElementById('curtain');
  function leaveTo(url) {
    if (!curtain) { location.href = url; return; }
    if (window.FH_glitchBurst) window.FH_glitchBurst(600);
    if (window.FH_bgBurst) window.FH_bgBurst(700);
    if (window.FH_audioGlitch) window.FH_audioGlitch(600);
    curtain.style.transition = 'opacity .5s';
    curtain.style.opacity = 1;
    curtain.animate(
      [{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(1.4) rotate(180deg)' }],
      { duration: 600, easing: 'cubic-bezier(.7,0,.3,1)' }
    );
    document.body.animate(
      [{ filter: 'none', transform: 'none' }, { filter: 'blur(6px) hue-rotate(60deg)', transform: 'scale(.96)' }],
      { duration: 600, easing: 'ease-in', fill: 'forwards' }
    );
    setTimeout(() => location.href = url, 560);
  }
  document.querySelectorAll('[data-nav]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (href && href.indexOf('#') !== 0) { e.preventDefault(); leaveTo(href); }
    });
  });

  /* audio fallback: start on first user gesture if entrance was skipped */
  const kick = () => { if (window.FH_audioStart) window.FH_audioStart(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    addEventListener(ev, kick, { once: true, passive: true }));

  /* fade-in on arrival */
  document.body.animate(
    [{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'none' }],
    { duration: 700, easing: 'ease-out' }
  );
})();

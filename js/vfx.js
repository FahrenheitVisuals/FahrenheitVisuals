/* ============================================================
   FAHRENHEIT — iridescent VFX engine
   Slow-shifting aurora orbs + swirls + periodic glitch bursts.
   Canvas 2D, low opacity, easy on the eyes.
   ============================================================ */
(function () {
  const canvas = document.getElementById('vfx-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  let W, H, DPR;

  const IRIS = [
    [99, 245, 208],   // mint
    [122, 162, 255],  // periwinkle
    [255, 110, 199],  // magenta
    [255, 209, 102],  // amber
    [138, 255, 228],  // hot mint
    [180, 120, 255],  // violet
  ];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.6);
    W = canvas.width = Math.floor(innerWidth * DPR);
    H = canvas.height = Math.floor(innerHeight * DPR);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
  }
  resize();
  addEventListener('resize', resize);

  // ---- drifting iridescent orbs ----
  const N = 7;
  const orbs = [];
  for (let i = 0; i < N; i++) {
    const c = IRIS[i % IRIS.length];
    orbs.push({
      x: Math.random(), y: Math.random(),
      r: 0.28 + Math.random() * 0.34,
      sx: (Math.random() * 2 - 1) * 0.00004,
      sy: (Math.random() * 2 - 1) * 0.00004,
      phase: Math.random() * Math.PI * 2,
      pspeed: 0.00018 + Math.random() * 0.00022,
      col: c,
    });
  }

  let t = 0;
  let glitchUntil = 0, nextGlitch = 2000 + Math.random() * 6000;

  function drawOrb(o) {
    const x = (o.x + Math.sin(t * o.pspeed + o.phase) * 0.06) * W;
    const y = (o.y + Math.cos(t * o.pspeed * 1.3 + o.phase) * 0.06) * H;
    const rad = o.r * Math.max(W, H) * (0.9 + Math.sin(t * 0.0006 + o.phase) * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const [r, gr, b] = o.col;
    g.addColorStop(0, `rgba(${r},${gr},${b},0.08)`);
    g.addColorStop(0.5, `rgba(${r},${gr},${b},0.03)`);
    g.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }


  // horizontal wave bands (subtle iridescent scan waves)
  function drawWaves() {
    const bands = 3;
    for (let i = 0; i < bands; i++) {
      const c = IRIS[(i + 1) % IRIS.length];
      const yBase = ((Math.sin(t * 0.0003 + i * 2.1) * 0.5 + 0.5) * H);
      const grad = ctx.createLinearGradient(0, yBase - H * 0.18, 0, yBase + H * 0.18);
      grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      grad.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},0.045)`);
      grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, yBase - H * 0.18, W, H * 0.36);
    }
  }

  // occasional glitch: RGB-split horizontal slices
  function drawGlitch() {
    const slices = 6 + (Math.random() * 8 | 0);
    for (let i = 0; i < slices; i++) {
      const y = Math.random() * H;
      const h = 2 + Math.random() * 20 * DPR;
      const off = (Math.random() * 40 - 20) * DPR;
      const c = IRIS[Math.random() * IRIS.length | 0];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.12)`;
      ctx.fillRect(off, y, W, h);
    }
  }

  function frame(now) {
    t = now;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    drawWaves();
    for (const o of orbs) drawOrb(o);   // drifting orbs only — no spinning swirls

    // glitch scheduling
    if (now > nextGlitch) { glitchUntil = now + 120 + Math.random() * 220; nextGlitch = now + 3500 + Math.random() * 9000; }
    if (now < glitchUntil && Math.random() > 0.3) drawGlitch();

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // expose a manual burst (used on transitions)
  window.FH_glitchBurst = function (ms) { glitchUntil = performance.now() + (ms || 400); };
})();

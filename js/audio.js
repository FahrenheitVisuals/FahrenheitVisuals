/* ============================================================
   FAHRENHEIT — ambient audio engine
   Randomized playlist, seamless crossfades between track ends,
   quiet "elevator" level, Web Audio FX chain:
   lowpass (mellow) -> gentle reverb -> soft saturation -> master.
   ============================================================ */
(function () {
  const TRACKS = [
    { src: 'assets/audio/track1.mp3', name: 'GAZE OF WISDOM' },
    { src: 'assets/audio/track2.mp3', name: 'LIGHT BLUE SKY' },
    { src: 'assets/audio/track3.mp3', name: 'LUCIFERIAN TRANCE' },
    { src: 'assets/audio/track4.mp3', name: 'THE GREAT DIVIDE' },
  ];
  const XFADE = 6.0;          // crossfade seconds
  const LEVEL = 0.34;         // master level — background, but clearly audible
  const hud = document.getElementById('audio-hud');
  const hudName = hud ? hud.querySelector('.tk') : null;

  let ctx, master, verbGain, dryGain, filter, started = false, muted = false;
  const players = [];         // {el, src, gain}
  let order = [], oi = 0, active = 0;

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }

  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate, len = rate * seconds;
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function softCurve() {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = Math.tanh(x * 1.4); }
    return c;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = LEVEL;

    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 9500; filter.Q.value = 0.3;  // gentle warmth, not muffled

    const shaper = ctx.createWaveShaper();
    shaper.curve = softCurve(); shaper.oversample = '2x';

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(3.2, 2.6);
    verbGain = ctx.createGain(); verbGain.gain.value = 0.22;
    dryGain = ctx.createGain(); dryGain.gain.value = 0.95;

    // chain: [players] -> filter -> shaper -> (dry + verb) -> master -> out
    filter.connect(shaper);
    shaper.connect(dryGain).connect(master);
    shaper.connect(convolver).connect(verbGain).connect(master);
    master.connect(ctx.destination);

    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      const g = ctx.createGain(); g.gain.value = 0;
      const node = ctx.createMediaElementSource(el);
      node.connect(g).connect(filter);
      players.push({ el, gain: g });
      el.addEventListener('timeupdate', () => watch(i));
    }
    order = shuffle(TRACKS.map((_, i) => i));
  }

  function loadInto(pi, ti) {
    const p = players[pi], tr = TRACKS[ti];
    p.el.src = tr.src; p.el.dataset.name = tr.name; p.el.load();
  }

  function fade(gain, to, secs) {
    const now = ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(to, now + secs);
  }

  function watch(pi) {
    if (pi !== active || muted) return;
    const p = players[pi];
    if (!p.el.duration) return;
    const remaining = p.el.duration - p.el.currentTime;
    if (remaining <= XFADE && !p._xfading) {
      p._xfading = true;
      // prep next player
      const next = 1 - active;
      oi = (oi + 1) % order.length;
      loadInto(next, order[oi]);
      const np = players[next];
      const go = () => {
        np.el.play().catch(() => {});
        fade(np.gain, 1, XFADE);
        fade(p.gain, 0, XFADE);
        if (hudName) hudName.textContent = TRACKS[order[oi]].name;
        active = next;
        setTimeout(() => { p.el.pause(); p._xfading = false; }, XFADE * 1000 + 200);
      };
      if (np.el.readyState >= 3) go(); else np.el.addEventListener('canplay', go, { once: true });
    }
  }

  function start() {
    if (started) return; started = true;
    if (!ctx) build();
    if (ctx.state === 'suspended') ctx.resume();
    if (hudName) hudName.textContent = TRACKS[order[0]].name;   // reflect immediately
    loadInto(0, order[0]);
    const p = players[0];
    const go = () => {
      p.el.play().catch(() => {});
      fade(p.gain, 1, 3.0);
    };
    if (p.el.readyState >= 3) go(); else p.el.addEventListener('canplay', go, { once: true });
  }

  // keep trying to resume on later gestures if the browser blocked autoplay
  window.addEventListener('pointerdown', () => {
    if (ctx && ctx.state === 'suspended') ctx.resume();
    const p = players[active];
    if (p && p.el.paused && !muted) p.el.play().catch(() => {});
  });

  window.FH_audioStatus = function () {
    return {
      started, muted,
      ctxState: ctx && ctx.state,
      active,
      masterGain: master ? +master.gain.value.toFixed(3) : null,
      playerGain: players[active] ? +players[active].gain.gain.value.toFixed(3) : null,
      lowpass: filter ? filter.frequency.value : null,
      current: players[active] ? { paused: players[active].el.paused, t: +players[active].el.currentTime.toFixed(2), dur: +(players[active].el.duration || 0).toFixed(1) } : null,
    };
  };

  function toggleMute() {
    if (!ctx) return;
    muted = !muted;
    fade(master.gain, muted ? 0 : LEVEL, 0.6);
    hud.classList.toggle('muted', muted);
  }

  if (hud) hud.addEventListener('click', toggleMute);
  window.FH_audioStart = start;
})();

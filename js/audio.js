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
  const LEVEL = 0.014;        // master level — very quiet background
  const CRUSH_BITS = 8;       // always-on bit depth (lower = grittier / more glitched)
  const CRUSH_NORM = 0.25;    // always-on sample-rate reduction (lower = crunchier)
  const hud = document.getElementById('audio-hud');
  const hudName = hud ? hud.querySelector('.tk') : null;

  let ctx, master, verbGain, dryGain, filter, started = false, muted = false;
  let stutter, analyser, crushBits, crushNorm, filterBase = 7000;   // nodes/params automated by the FX
  let nextAutoGlitch = 0;
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

  // ---- AudioWorklet bitcrusher + sample-rate reducer (runs on audio thread) ----
  const CRUSHER_SRC = `
  class FHCrusher extends AudioWorkletProcessor {
    static get parameterDescriptors(){ return [
      { name:'bits', defaultValue:12, minValue:2,  maxValue:16, automationRate:'k-rate' },
      { name:'norm', defaultValue:0.33, minValue:0.02, maxValue:1, automationRate:'k-rate' }
    ]; }
    constructor(){ super(); this.phase = 0; this.hold = [0,0]; }
    process(inputs, outputs, params){
      const input = inputs[0], output = outputs[0];
      if(!output) return true;
      const nCh = output.length, n = output[0].length;
      const bits = params.bits[0], norm = params.norm[0];
      const step = Math.pow(2, bits);
      for(let i=0;i<n;i++){
        this.phase += norm;
        const take = this.phase >= 1; if(take) this.phase -= 1;
        for(let ch=0; ch<nCh; ch++){
          const inp = input && (input[ch] || input[0]);
          if(take) this.hold[ch] = inp ? (Math.round(inp[i]*step)/step) : 0;
          output[ch][i] = this.hold[ch] || 0;
        }
      }
      return true;
    }
  }
  registerProcessor('fh-crusher', FHCrusher);`;

  // insert the crusher between two passthrough gains once the module loads,
  // so playback never has to wait on the async worklet load.
  function loadCrusher(preNode, postNode) {
    if (!ctx.audioWorklet) return;                    // unsupported -> stays passthrough
    const url = URL.createObjectURL(new Blob([CRUSHER_SRC], { type: 'application/javascript' }));
    ctx.audioWorklet.addModule(url).then(() => {
      const node = new AudioWorkletNode(ctx, 'fh-crusher', { outputChannelCount: [2] });
      crushBits = node.parameters.get('bits'); crushBits.value = CRUSH_BITS;   // always-on crush
      crushNorm = node.parameters.get('norm'); crushNorm.value = CRUSH_NORM;   // sample-rate reduction
      preNode.disconnect();
      preNode.connect(node); node.connect(postNode);
      URL.revokeObjectURL(url);
    }).catch(() => { /* keep passthrough */ });
  }

  // a slow sine LFO -> AudioParam (returns the osc so caller can tweak)
  function lfo(freq, depth, param, base) {
    const o = ctx.createOscillator(); o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = depth;
    if (base != null) param.value = base;
    o.connect(g).connect(param); o.start();
    return o;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = LEVEL;

    // --- LOWPASS with a slow breathing sweep (auto-wah, machine "inhale/exhale") ---
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.Q.value = 0.7;
    lfo(0.05, 2600, filter.frequency, filterBase);       // cutoff drifts ~5900..11100 Hz

    // --- soft saturation (analog warmth + a little drive/grit) ---
    const shaper = ctx.createWaveShaper();
    shaper.curve = softCurve(); shaper.oversample = '2x';
    filter.connect(shaper);

    // --- ALWAYS-ON CRUSHER (12-bit + sample-rate reduction) ---
    // passthrough until the worklet loads, then the crusher is spliced in.
    const preCrush = ctx.createGain(), postCrush = ctx.createGain();
    shaper.connect(preCrush);
    preCrush.connect(postCrush);
    loadCrusher(preCrush, postCrush);

    // --- CHORUS (modulated delay) -> shimmer / metallic width ---
    const chorus = ctx.createDelay(0.05);
    lfo(0.18, 0.004, chorus.delayTime, 0.022);
    const chorusWet = ctx.createGain(); chorusWet.gain.value = 0.3;
    const chorusOut = ctx.createGain();
    postCrush.connect(chorusOut);                                    // dry
    postCrush.connect(chorus).connect(chorusWet).connect(chorusOut); // wet

    // --- AUTO-PAN: slow stereo drift ---
    const panner = ctx.createStereoPanner();
    lfo(0.06, 0.35, panner.pan, 0);
    chorusOut.connect(panner);

    // --- COMPRESSOR (glue + pump, tames peaks) ---
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26; comp.knee.value = 28; comp.ratio.value = 5;
    comp.attack.value = 0.006; comp.release.value = 0.2;
    panner.connect(comp);

    // --- STUTTER gain (chopped during glitches) ---
    stutter = ctx.createGain(); stutter.gain.value = 1.0;
    comp.connect(stutter);

    // --- REVERB (parallel) + dry -> master ---
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(3.2, 2.6);
    verbGain = ctx.createGain(); verbGain.gain.value = 0.2;
    dryGain = ctx.createGain(); dryGain.gain.value = 0.95;
    stutter.connect(dryGain).connect(master);
    stutter.connect(convolver).connect(verbGain).connect(master);
    master.connect(ctx.destination);

    analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    master.connect(analyser);                  // tap for level metering

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
    nextAutoGlitch = performance.now() + 4000 + Math.random() * 5000;

    // ongoing self-glitches every ~5-13s so it stays actively mangled
    setInterval(() => {
      if (!started || muted || document.hidden) return;
      if (performance.now() >= nextAutoGlitch) {
        audioGlitch(180 + Math.random() * 340);
        nextAutoGlitch = performance.now() + 5000 + Math.random() * 8000;
      }
    }, 1000);
  }

  // ---- glitch audio hit: filter duck + bitcrush swell + chopped stutter ----
  function audioGlitch(ms) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, dur = Math.max(0.12, (ms || 400) / 1000);

    // filter ducks down then recovers (a synced "wah/zap")
    const f = filter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(700, t + dur * 0.25);
    f.linearRampToValueAtTime(filterBase, t + dur + 0.15);

    // crush HARDER during the hit: down to ~3-bit + heavy SR reduction, then back to base
    if (crushBits) {
      crushBits.cancelScheduledValues(t); crushBits.setValueAtTime(crushBits.value, t);
      crushBits.linearRampToValueAtTime(3, t + dur * 0.2);
      crushBits.linearRampToValueAtTime(CRUSH_BITS, t + dur + 0.1);
    }
    if (crushNorm) {
      crushNorm.cancelScheduledValues(t); crushNorm.setValueAtTime(crushNorm.value, t);
      crushNorm.linearRampToValueAtTime(0.08, t + dur * 0.2);
      crushNorm.linearRampToValueAtTime(CRUSH_NORM, t + dur + 0.1);
    }

    // chopped stutter pattern
    const steps = 5 + (Math.random() * 4 | 0), pat = new Float32Array(steps + 1);
    for (let i = 0; i < steps; i++) pat[i] = (i % 2 === 0) ? 1.0 : 0.15 + Math.random() * 0.2;
    pat[steps] = 1.0;
    try { stutter.gain.cancelScheduledValues(t); stutter.gain.setValueCurveAtTime(pat, t, dur); }
    catch (e) { /* overlapping curve — ignore */ }
  }
  window.FH_audioGlitch = audioGlitch;

  function loadInto(pi, ti) {
    const p = players[pi], tr = TRACKS[ti];
    p.el.src = tr.src; p.el.dataset.name = tr.name; p.el.load();
  }

  function fade(target, to, secs) {
    // accept either a GainNode or an AudioParam
    const param = target.gain ? target.gain : target;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + secs);
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
      outLevel: (function () {
        if (!analyser) return null;
        const a = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(a);
        let pk = 0; for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i] - 128));
        return pk;   // 0 = silence, up to 128
      })(),
      lowpass: filter ? filter.frequency.value : null,
      crusher: crushBits ? { bits: +crushBits.value.toFixed(1), norm: +crushNorm.value.toFixed(2) } : 'not loaded',
      players: players.map((p, i) => ({
        i, gain: +p.gain.gain.value.toFixed(3),
        paused: p.el.paused, t: +p.el.currentTime.toFixed(2),
        dur: +(p.el.duration || 0).toFixed(1),
        ready: p.el.readyState, net: p.el.networkState,
        err: p.el.error ? p.el.error.code : null,
        src: (p.el.currentSrc || '').split('/').pop(),
      })),
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

/* ============================================================
   FAHRENHEIT — WebGL living background.
   The photo ITSELF is warped: slow swirl + wave domain-warp +
   chromatic RGB split + horizontal block-glitch, crossfading
   between the background photos. Falls back to CSS #bg-drift.
   ============================================================ */
(function () {
  const BGS = ['DSC_1051', 'DSC_0190', 'DSC_1383', 'DSC_1119', 'DSC_0796', 'DSC_1125', 'DSC_0234'];
  const canvas = document.getElementById('bg-gl');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return; // keep CSS fallback

  const drift = document.getElementById('bg-drift');
  if (drift) drift.style.display = 'none';

  const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }`;
  const FRAG = `
  precision highp float;
  uniform sampler2D u_t0, u_t1;
  uniform float u_mix, u_time, u_glitch;
  uniform vec2 u_res, u_asp0, u_asp1;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  vec2 cover(vec2 uv, vec2 a){ return (uv-0.5)*a + 0.5; }

  // drifting orb center (no rotation — pure translation)
  vec2 orbPos(float i){
    return vec2(0.5 + 0.34*sin(u_time*(0.05+0.017*i) + i*2.1),
                0.5 + 0.30*cos(u_time*(0.043+0.019*i) + i*1.3));
  }

  // sum of drifting orbs -> a lens displacement that WARPS the photo where they pass
  vec2 orbWarp(vec2 uv){
    vec2 disp = vec2(0.0);
    for(int i=0;i<4;i++){
      float fi = float(i);
      vec2 c = orbPos(fi);
      vec2 d = uv - c;
      float r = length(d);
      float rad = 0.26 + 0.05*sin(u_time*0.2 + fi);
      float infl = smoothstep(rad, 0.0, r);        // 1 at center -> 0 at edge
      // refraction-style push + gentle ripple, magnifies/bends the image
      disp += normalize(d + 0.0001) * infl * (0.045 + 0.02*sin(r*22.0 - u_time*1.2));
    }
    return disp;
  }

  vec3 grab(sampler2D tex, vec2 uv, vec2 asp){
    vec2 p = uv;
    p += orbWarp(uv);                                // <-- orbs warp the real picture
    // horizontal block glitch (occasional, circuit-bent tearing)
    float line = floor(p.y*46.0);
    float gate = step(0.93, hash(vec2(line, floor(u_time*7.0))));
    float amt = gate * (0.05 + 0.12*u_glitch);
    p.x += amt * (hash(vec2(line, 3.0))-0.5) * 2.0;
    // channel-split (chromatic aberration), stronger during glitch
    float ca = (0.004 + 0.03*u_glitch) * (0.4 + length(uv-0.5));
    float r = texture2D(tex, cover(vec2(p.x+ca, p.y), asp)).r;
    float g = texture2D(tex, cover(p, asp)).g;
    float b = texture2D(tex, cover(vec2(p.x-ca, p.y), asp)).b;
    return vec3(r,g,b);
  }

  // hue rotation matrix
  vec3 hueRotate(vec3 c, float a){
    const mat3 toYIQ = mat3(0.299,0.587,0.114, 0.596,-0.274,-0.322, 0.211,-0.523,0.312);
    const mat3 toRGB = mat3(1.0,0.956,0.621, 1.0,-0.272,-0.647, 1.0,-1.106,1.703);
    vec3 yiq = toYIQ*c;
    float s=sin(a), co=cos(a);
    yiq.yz = mat2(co,-s,s,co)*yiq.yz;
    return toRGB*yiq;
  }

  void main(){
    vec2 uv = gl_FragCoord.xy/u_res; uv.y = 1.0-uv.y;
    vec3 c0 = grab(u_t0, uv, u_asp0);
    vec3 c1 = grab(u_t1, uv, u_asp1);
    vec3 col = mix(c0, c1, u_mix);

    // ================= INTENSE CIRCUIT-BENT COLOR =================
    // keep only the photo's LUMINANCE (its structure); throw away its real
    // colors entirely and rebuild them from a saturated palette that slowly
    // drifts through randomized hues + a hue-rotation on top.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));

    // databent posterize -> hard color bands
    float lq = mix(lum, floor(lum*6.0)/6.0, 0.65);

    float T = u_time * 0.06;                          // slow master drift
    vec3 phase = vec3(0.0, 0.33, 0.67)
               + 0.55*vec3(sin(T*0.7), sin(T*0.9+2.0), sin(T*0.6+4.0));
    // many hue cycles across the tonal range = vivid banded rainbow
    vec3 bent = 0.5 + 0.5*cos(6.28318*(vec3(2.2)*lq + phase
                 + 0.10*vec3(sin(uv.x*3.0), sin(uv.y*3.0+1.0), 0.0)));

    // crush saturation UP hard
    float bl = dot(bent, vec3(0.3333));
    bent = clamp((bent - bl)*2.1 + bl, 0.0, 1.0);
    // spin the whole hue slowly over time too
    bent = hueRotate(bent, u_time*0.15);

    // structure: bright where photo is bright, dark where dark (legible + glowy)
    bent *= (0.12 + 1.05*lum);

    vec3 outc = bent;                                // FULLY false-colored, no real color
    outc *= 0.62;                                     // overall level
    outc *= 0.93 + 0.07*sin(uv.y*u_res.y*1.4);        // fine scanline
    gl_FragColor = vec4(outc, 1.0);
  }`;

  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { if (drift) drift.style.display = ''; return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(prog, n);
  const uT0 = U('u_t0'), uT1 = U('u_t1'), uMix = U('u_mix'), uTime = U('u_time'),
        uGl = U('u_glitch'), uRes = U('u_res'), uA0 = U('u_asp0'), uA1 = U('u_asp1');

  function newTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 12, 18, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return { tex: t, asp: [1, 1] };
  }
  const slot = [newTex(), newTex()];

  function computeAsp(iw, ih) {
    const sa = canvas.width / canvas.height, ia = iw / ih;
    return sa < ia ? [sa / ia, 1] : [1, ia / sa];
  }
  function load(slotObj, name) {
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, slotObj.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      slotObj._iw = img.naturalWidth; slotObj._ih = img.naturalHeight;
      slotObj.asp = computeAsp(img.naturalWidth, img.naturalHeight);
    };
    img.src = `assets/bg/${name}.jpg`;
  }

  let DPR;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.3);
    canvas.width = Math.floor(innerWidth * DPR);
    canvas.height = Math.floor(innerHeight * DPR);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
    for (const s of slot) if (s._iw) s.asp = computeAsp(s._iw, s._ih);
  }
  resize();
  addEventListener('resize', resize);

  // start: slot0 = first image, slot1 = second
  let idx = Math.random() * BGS.length | 0;
  load(slot[0], BGS[idx]);
  let nextIdx = (idx + 1) % BGS.length;
  load(slot[1], BGS[nextIdx]);

  let mix = 0, target = 0, showing = 0;   // showing which slot is fully visible
  const HOLD = 9000;
  let nextSwap = performance.now() + HOLD;

  // glitch level: idle low + random bursts
  let glitch = 0.05, burstUntil = 0, nextBurst = 1500 + Math.random() * 5000;
  window.FH_bgBurst = function (ms) { burstUntil = performance.now() + (ms || 500); };

  function frame(now) {
    // crossfade scheduling
    if (now > nextSwap) {
      showing = 1 - showing;
      target = showing;                       // ramp mix toward the newly-shown slot
      nextSwap = now + HOLD;
      // preload the *other* slot with the upcoming image
      const other = 1 - showing;
      nextIdx = (nextIdx + 1) % BGS.length;
      setTimeout(() => load(slot[other], BGS[nextIdx]), 1600);
    }
    mix += (target - mix) * 0.02;              // smooth crossfade

    // glitch envelope
    if (now > nextBurst) { burstUntil = now + 120 + Math.random() * 260; nextBurst = now + 3000 + Math.random() * 8000; }
    const wantG = now < burstUntil ? (0.6 + Math.random() * 0.4) : 0.05;
    glitch += (wantG - glitch) * 0.15;

    gl.uniform1f(uTime, now * 0.001);
    gl.uniform1f(uMix, mix);
    gl.uniform1f(uGl, glitch);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, slot[0].tex); gl.uniform1i(uT0, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, slot[1].tex); gl.uniform1i(uT1, 1);
    gl.uniform2f(uA0, slot[0].asp[0], slot[0].asp[1]);
    gl.uniform2f(uA1, slot[1].asp[0], slot[1].asp[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();

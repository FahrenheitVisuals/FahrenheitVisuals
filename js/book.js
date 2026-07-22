/* ============================================================
   FAHRENHEIT — booking flow.
   (B) HEAT SLIDER: smooth drag, snaps to 4 thermal tiers. The
   whole box heats up (--heat 0..1), and past the midpoint it
   starts to shake + RGB-glitch ("divine machinery") toward max.
   Then a stylized CALENDAR reveals; pick an open day -> hands
   off to the contact form with the session prefilled.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- backend (Stripe/D1 Worker). Flip enabled -> true at cutover.
     While false, booking uses the mailto contact-form handoff (current live
     behaviour), so this file is safe to ship before the backend is live. ---- */
  const BACKEND = { enabled: true };
  const DAY_BUDGET = 3;                 // must match the Worker

  /* ---------- the 4 real choices (key must match the Worker CATALOG) ---------- */
  const STOPS = [
    { key: 'ember',    deg: '98.6°', name: 'Ember',         price: 90,  weight: 1, blurb: '~20 min · 1 look · 8 delivered frames' },
    { key: 'boiling',  deg: '212°',  name: 'Boiling Point', price: 185, weight: 1, blurb: '~1 hr · up to 2 looks · 25 delivered frames' },
    { key: 'ignition', deg: '451°',  name: 'Ignition',      price: 350, weight: 2, blurb: '~2 hrs · multi-look / location · 45+ frames · full treatment' },
    { key: 'meltdown', deg: '∞°',    name: 'Meltdown',      price: 600, weight: 3, blurb: 'half-day · everything · all glass, all locations, the works' },
  ];
  const MAXV = 1000;
  const stopVal = i => Math.round(i / (STOPS.length - 1) * MAXV);
  const nearestStop = v => Math.round(v / MAXV * (STOPS.length - 1));

  const box   = document.getElementById('heat-box');
  const range = document.getElementById('heat-range');
  if (!box || !range) return;

  const elDeg   = document.getElementById('heat-deg');
  const elName  = document.getElementById('heat-name');
  const elPrice = document.getElementById('heat-price');
  const elBlurb = document.getElementById('heat-blurb');
  const ticks   = [...document.querySelectorAll('#heat-ticks span')];

  let chosen = 0;                       // current snapped heat tier
  let selection = null;                 // what actually gets booked (heat tier OR student session)

  function paint(rawT) {                // rawT = continuous 0..1 (heat look)
    box.style.setProperty('--heat', rawT.toFixed(3));
  }
  function setStop(i) {
    chosen = i;
    const s = STOPS[i];
    elDeg.textContent = s.deg;
    elName.textContent = s.name;
    elPrice.innerHTML = '$' + s.price + '<small>flat</small>';
    elBlurb.textContent = s.blurb;
    ticks.forEach((t, k) => t.classList.toggle('on', k === i));
  }

  function onInput() {
    const raw = +range.value;
    paint(raw / MAXV);                  // smooth heat follows the raw handle
    setStop(nearestStop(raw));          // label snaps to nearest of 4
  }
  function onCommit() {                 // snap the handle to the chosen stop
    const i = nearestStop(+range.value);
    range.value = stopVal(i);
    paint(range.value / MAXV);
    setStop(i);
    if (i >= 2 && window.FH_bgBurst) window.FH_bgBurst(300);
    if (i >= 3 && window.FH_audioGlitch) window.FH_audioGlitch(360);
  }
  range.addEventListener('input', onInput);
  range.addEventListener('change', onCommit);
  range.addEventListener('pointerup', onCommit);
  range.addEventListener('keyup', onCommit);

  /* ---------- shake + RGB glitch loop (gated by heat) ---------- */
  (function shakeLoop() {
    const t = parseFloat(box.style.getPropertyValue('--heat')) || 0;
    if (t > 0.5) {
      const amp = (t - 0.5) / 0.5;                 // 0..1 above the midpoint
      const dx = (Math.random() - 0.5) * amp * 6.5;
      const dy = (Math.random() - 0.5) * amp * 5.5;
      const rot = (Math.random() - 0.5) * amp * 0.9;
      box.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
      box.classList.toggle('rgb', Math.random() < amp * 0.85);
    } else if (box.style.transform) {
      box.style.transform = '';
      box.classList.remove('rgb');
    }
    requestAnimationFrame(shakeLoop);
  })();

  setStop(0);                            // start cold-ish at Ember

  /* ---------- reveal the calendar ---------- */
  const cal = document.getElementById('cal');
  function openCalendar(sel) {
    selection = sel;                    // { key, name, price, weight }
    cal.classList.add('open');
    document.getElementById('blocks').classList.remove('open');   // reset the block step
    if (window.FH_glitchBurst) window.FH_glitchBurst(300);
    document.getElementById('cal-sel').innerHTML = ':// ' + sel.name + ' — pick an open day';
    if (BACKEND.enabled) loadAvail(); else render();
    setTimeout(() => document.getElementById('pickdate')
      .scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }
  document.getElementById('lock-btn').addEventListener('click', e => {
    e.preventDefault();
    const s = STOPS[chosen];
    openCalendar({ key: s.key, name: s.deg + ' ' + s.name, price: s.price, weight: s.weight });
  });
  const studentBtn = document.getElementById('student-btn');
  if (studentBtn) studentBtn.addEventListener('click', e => {
    e.preventDefault();
    openCalendar({ key: 'student', name: 'Student Session', price: 135, weight: 1 });
  });

  /* ---------- CALENDAR + TIME BLOCKS ---------- */
  const BLOCKS_DEF = [
    { key: 'midday',    name: 'Midday',    win: '12PM – 4PM' },
    { key: 'afternoon', name: 'Afternoon', win: '4PM – 8PM' },
    { key: 'evening',   name: 'Evening',   win: '8PM – 12AM' },
  ];
  const ALL_BLOCKS = BLOCKS_DEF.map(b => b.key);
  const BOOKED = {};                     // fallback when backend is off (kept empty)
  let AVAIL = { taken: {} };             // { 'YYYY-MM-DD': ['midday','all',...] }
  let chosenDate = null;                 // { iso, pretty }

  async function loadAvail() {
    const mk = viewY + '-' + String(viewM + 1).padStart(2, '0');
    try {
      const r = await fetch('/api/availability?month=' + mk);
      if (r.ok) { const j = await r.json(); AVAIL = { taken: j.taken || {} }; }
    } catch (e) { /* keep whatever we have */ }
    render();
  }

  const grid = document.getElementById('cal-grid');
  const moLabel = document.getElementById('cal-mo');
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let viewY = today.getFullYear(), viewM = today.getMonth();   // 0-indexed month

  function dayFull(iso) {
    const taken = AVAIL.taken[iso] || [];
    if (!taken.length) return false;
    if ((selection && selection.key) === 'meltdown') return true;   // meltdown needs the whole day
    return taken.indexOf('all') !== -1 || ALL_BLOCKS.every(b => taken.indexOf(b) !== -1);
  }

  function render() {
    grid.innerHTML = '';
    moLabel.textContent = MON[viewM] + ' ' + viewY;
    DOW.forEach(d => {
      const h = document.createElement('div'); h.className = 'cal-dow'; h.textContent = d; grid.appendChild(h);
    });
    const first = new Date(viewY, viewM, 1).getDay();
    const days = new Date(viewY, viewM + 1, 0).getDate();
    const booked = BOOKED[viewY + '-' + (viewM + 1)] || [];
    for (let i = 0; i < first; i++) {
      const e = document.createElement('div'); e.className = 'cal-day empty'; grid.appendChild(e);
    }
    for (let d = 1; d <= days; d++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      cell.textContent = d;
      const date = new Date(viewY, viewM, d);
      const isToday = date.getTime() === today.getTime();
      if (isToday) cell.classList.add('today');
      const iso = viewY + '-' + String(viewM + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const full = BACKEND.enabled ? dayFull(iso) : (booked.indexOf(d) !== -1);
      if (date < today) {
        cell.classList.add('past');
      } else if (full) {
        cell.classList.add('booked');
      } else {
        cell.classList.add('open');
        cell.addEventListener('click', () => pick(viewY, viewM + 1, d));
      }
      grid.appendChild(cell);
    }
    prevBtn.disabled = (viewY === today.getFullYear() && viewM === today.getMonth());
  }

  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  function hop(dir) {
    viewM += dir;
    if (viewM < 0) { viewM = 11; viewY--; } else if (viewM > 11) { viewM = 0; viewY++; }
    blocksWrap.classList.remove('open');
    if (BACKEND.enabled) loadAvail(); else render();
  }
  prevBtn.addEventListener('click', () => hop(-1));
  nextBtn.addEventListener('click', () => hop(1));

  /* day picked -> open the time-block step */
  const blocksWrap = document.getElementById('blocks');
  const blkGrid = document.getElementById('blk-grid');
  function pick(y, m, d) {
    chosenDate = {
      iso: y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
      pretty: MON[m - 1] + ' ' + d + ', ' + y,
    };
    if (window.FH_glitchBurst) window.FH_glitchBurst(250);
    showBlocks();
  }

  function blkEl(b, taken) {
    const el = document.createElement('div');
    el.className = 'blk' + (taken ? ' taken' : '');
    el.innerHTML = '<div class="b-name">' + b.name + '</div><div class="b-win">' + b.win + '</div>';
    if (!taken) el.addEventListener('click', () => startCheckout(b.key));
    return el;
  }
  function showBlocks() {
    const s = selection || {};
    const isMeltdown = s.key === 'meltdown';
    document.getElementById('blk-date').textContent = chosenDate.pretty;
    document.getElementById('blk-sel').innerHTML = ':// ' + (s.name || '') + (isMeltdown ? ' — the whole day' : ' — choose your block');
    const taken = AVAIL.taken[chosenDate.iso] || [];
    blkGrid.innerHTML = '';
    blkGrid.classList.toggle('one', isMeltdown);
    if (isMeltdown) {
      blkGrid.appendChild(blkEl({ key: 'all', name: 'Full Day', win: '12PM – 12AM' }, false));
    } else {
      BLOCKS_DEF.forEach(b => blkEl && blkGrid.appendChild(
        blkEl(b, taken.indexOf('all') !== -1 || taken.indexOf(b.key) !== -1)));
    }
    blocksWrap.classList.add('open');
    setTimeout(() => blocksWrap.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }
  document.getElementById('blk-back').addEventListener('click', () => blocksWrap.classList.remove('open'));

  async function startCheckout(block) {
    const s = selection || { key: STOPS[chosen].key, name: STOPS[chosen].deg + ' ' + STOPS[chosen].name, price: STOPS[chosen].price };
    if (window.FH_glitchBurst) window.FH_glitchBurst(400);
    if (window.FH_audioGlitch) window.FH_audioGlitch(300);
    if (BACKEND.enabled && s.key) {
      try {
        const r = await fetch('/api/checkout', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: s.key, date: chosenDate.iso, block }),
        });
        const j = await r.json();
        if (r.ok && j.url) { location.href = j.url; return; }
        document.getElementById('blk-sel').innerHTML = ':// ' + (j.error || 'that just filled — pick another');
        await loadAvail(); showBlocks();
        return;
      } catch (e) { /* network down -> fall back to the contact handoff */ }
    }
    const label = block === 'all' ? 'Full Day' : block;
    const q = 'heat=' + encodeURIComponent(s.name) + '&price=' + s.price +
              '&date=' + encodeURIComponent(chosenDate.pretty + ' · ' + label);
    location.href = 'contact.html?' + q;
  }
  render();

  /* ---------- membership + payment handoffs ---------- */
  const CASHTAG = 'FahrenheitVisuals';
  document.getElementById('join-btn').addEventListener('click', async e => {
    e.preventDefault();
    if (BACKEND.enabled) {
      try {
        const r = await fetch('/api/membership', { method: 'POST' });
        const j = await r.json();
        if (r.ok && j.url) { location.href = j.url; return; }
      } catch (err) { /* fall back below */ }
    }
    location.href = 'contact.html?plan=' + encodeURIComponent('Membership — $35/mo (35 frames · up to 2 sessions)');
  });
  const cash = document.getElementById('cashapp');
  if (cash) { cash.textContent = '$' + CASHTAG; cash.href = 'https://cash.app/$' + CASHTAG; cash.target = '_blank'; cash.rel = 'noopener'; }
})();

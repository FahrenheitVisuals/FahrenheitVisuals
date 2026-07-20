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

  /* ---------- the 4 real choices ---------- */
  const STOPS = [
    { deg: '98.6°', name: 'Ember',         price: 90,  blurb: '~20 min · 1 look · 8 delivered frames' },
    { deg: '212°',  name: 'Boiling Point', price: 185, blurb: '~1 hr · up to 2 looks · 25 delivered frames' },
    { deg: '451°',  name: 'Ignition',      price: 350, blurb: '~2 hrs · multi-look / location · 45+ frames · full treatment' },
    { deg: '∞°',    name: 'Meltdown',      price: 600, blurb: 'half-day · everything · all glass, all locations, the works' },
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
    selection = sel;                    // { name, price }
    cal.classList.add('open');
    if (window.FH_glitchBurst) window.FH_glitchBurst(300);
    document.getElementById('cal-sel').innerHTML = ':// ' + sel.name + ' — pick an open day';
    setTimeout(() => document.getElementById('pickdate')
      .scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }
  document.getElementById('lock-btn').addEventListener('click', e => {
    e.preventDefault();
    const s = STOPS[chosen];
    openCalendar({ name: s.deg + ' ' + s.name, price: s.price });
  });
  const studentBtn = document.getElementById('student-btn');
  if (studentBtn) studentBtn.addEventListener('click', e => {
    e.preventDefault();
    openCalendar({ name: 'Student Session', price: 135 });
  });

  /* ---------- CALENDAR — booked days keyed 'YYYY-M' (month 1-12) ---------- */
  const BOOKED = {};

  const grid = document.getElementById('cal-grid');
  const moLabel = document.getElementById('cal-mo');
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let viewY = today.getFullYear(), viewM = today.getMonth();   // 0-indexed month

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
      if (date < today) {
        cell.classList.add('past');
      } else if (booked.indexOf(d) !== -1) {
        cell.classList.add('booked');
      } else {
        cell.classList.add('open');
        cell.addEventListener('click', () => pick(viewY, viewM + 1, d));
      }
      grid.appendChild(cell);
    }
    const atStart = (viewY === today.getFullYear() && viewM === today.getMonth());
    prevBtn.disabled = atStart;
  }

  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  prevBtn.addEventListener('click', () => { if (viewM === 0) { viewM = 11; viewY--; } else viewM--; render(); });
  nextBtn.addEventListener('click', () => { if (viewM === 11) { viewM = 0; viewY++; } else viewM++; render(); });

  function pick(y, m, d) {
    const s = selection || { name: STOPS[chosen].deg + ' ' + STOPS[chosen].name, price: STOPS[chosen].price };
    const pretty = MON[m - 1] + ' ' + d + ', ' + y;
    if (window.FH_glitchBurst) window.FH_glitchBurst(400);
    if (window.FH_audioGlitch) window.FH_audioGlitch(300);
    const q = 'heat=' + encodeURIComponent(s.name) +
              '&price=' + s.price +
              '&date=' + encodeURIComponent(pretty);
    setTimeout(() => { location.href = 'contact.html?' + q; }, 260);
  }
  render();

  /* ---------- membership + payment handoffs ---------- */
  const CASHTAG = 'FahrenheitVisuals';
  document.getElementById('join-btn').addEventListener('click', e => {
    e.preventDefault();
    location.href = 'contact.html?plan=' + encodeURIComponent('Membership — $35/mo (35 frames · up to 2 sessions)');
  });
  const cash = document.getElementById('cashapp');
  if (cash) { cash.textContent = '$' + CASHTAG; cash.href = 'https://cash.app/$' + CASHTAG; cash.target = '_blank'; cash.rel = 'noopener'; }
})();

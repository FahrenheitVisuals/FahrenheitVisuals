/* ============================================================
   FAHRENHEIT — one-time thank-you / call-sign reveal.
   Reads ?cs=<stripe checkout session id>, pulls the order's
   call-sign from the backend (which seals it after a grace
   window), and renders it. Falls back gracefully.
   ============================================================ */
(function () {
  'use strict';
  const codeEl = document.getElementById('callsign');
  const metaEl = document.getElementById('callsign-meta');
  const boxEl = document.getElementById('callsign-box');
  const sealEl = document.getElementById('seal-note');

  const cs = new URLSearchParams(location.search).get('cs');

  function sealed(msg) {
    if (codeEl) { codeEl.textContent = 'SEALED'; codeEl.removeAttribute('data-glitch'); }
    if (metaEl) metaEl.textContent = msg || 'this transmission has closed';
    if (sealEl) sealEl.textContent = ':// check your emailed receipt for your call-sign.';
  }

  if (!cs) { sealed('no order reference'); return; }

  fetch('/api/order?cs=' + encodeURIComponent(cs))
    .then(r => r.json())
    .then(d => {
      if (!d || d.error) { sealed('order not found'); return; }
      if (d.sealed) { sealed('you already opened this once'); return; }
      if (codeEl) {
        codeEl.textContent = d.callsign || '—';
        codeEl.setAttribute('data-alt', d.callsign || '');
        codeEl.setAttribute('data-text', d.callsign || '');
      }
      if (metaEl) {
        const parts = [];
        if (d.session_name) parts.push(d.session_name);
        if (d.date) parts.push(d.date);
        metaEl.textContent = parts.join(' · ') || 'order confirmed';
      }
      if (sealEl) sealEl.textContent = ':// screenshot now — this seals in 15 minutes.';
    })
    .catch(() => sealed('could not retrieve — see your receipt'));
})();

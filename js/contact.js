/* ============================================================
   FAHRENHEIT — booking form delivery.
   Default (works offline, no signup): opens the visitor's mail
   client addressed to Fahrenheit with all details prefilled.
   Optional: paste a Formspree endpoint into ENDPOINT to receive
   submissions automatically without the visitor needing email.
   ============================================================ */
(function () {
  const TO = 'Fahrenheit.Support@gmail.com';
  const ENDPOINT = ''; // e.g. 'https://formspree.io/f/xxxxxxx' — leave '' for mailto mode

  const form = document.getElementById('book-form');
  const msg = document.getElementById('sent-msg');
  if (!form) return;

  /* ---------- carry-over from the booking flow (book.html) ----------
     ?heat=..&price=..&date=..  (single session)  or  ?plan=..  (membership) */
  let SESSION = '';
  (function prefill() {
    const p = new URLSearchParams(location.search);
    const banner = document.getElementById('session-banner');
    const heat = p.get('heat'), price = p.get('price'), date = p.get('date'), plan = p.get('plan');
    if (plan) {
      SESSION = plan;
      if (banner) { banner.innerHTML = ':// <b>MEMBERSHIP</b> — ' + esc(plan); banner.classList.add('show'); }
      selectLooking('membership');
    } else if (heat) {
      SESSION = heat + (price ? ' ($' + esc(price) + ')' : '') + (date ? ' — ' + esc(date) : '');
      if (banner) {
        banner.innerHTML = ':// <b>SESSION</b> — ' + esc(heat) +
          (price ? ' · <b>$' + esc(price) + '</b>' : '') + (date ? ' · <b>' + esc(date) + '</b>' : '');
        banner.classList.add('show');
      }
      if (date && form.when && !form.when.value) form.when.value = date;
      selectLooking('session');
    }
  })();
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function selectLooking(kind) {
    // nudge the dropdown toward a photography option if present
    if (!form.looking) return;
    for (const o of form.looking.options) {
      if (/portrait|streetwear/i.test(o.text)) { o.selected = true; break; }
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const data = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      looking: form.looking.value,
      details: form.details.value.trim(),
      when: form.when.value.trim(),
    };
    if (!data.phone && !data.email) {
      msg.textContent = ':// ERROR — leave a phone number or email so I can reach you.';
      return;
    }
    if (window.FH_glitchBurst) window.FH_glitchBurst(500);

    const subject = `BOOKING REQUEST // ${data.name || 'Anonymous'}${SESSION ? ' // ' + SESSION : ''}`;
    const body =
`:// FAHRENHEIT BOOKING REQUEST ://
${SESSION ? '\nSELECTION  : ' + SESSION + '\n' : ''}
NAME       : ${data.name || '(not given)'}
PHONE      : ${data.phone || '(not given)'}
EMAIL      : ${data.email || '(not given)'}
LOOKING FOR: ${data.looking}
PREFERRED  : ${data.when || '(flexible)'}

DETAILS:
${data.details || '(none provided)'}

--- sent from fahrenheit.site ---`;

    if (ENDPOINT) {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ ...data, _subject: subject }),
      }).then(r => {
        msg.textContent = r.ok ? ':// TRANSMITTED — thank you. Fahrenheit will reach back soon.'
                               : ':// relay busy — opening your mail app instead...';
        if (!r.ok) mailtoFallback();
        if (r.ok) form.reset();
      }).catch(() => mailtoFallback());
    } else {
      mailtoFallback();
    }

    function mailtoFallback() {
      const url = `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      msg.innerHTML = ':// OPENING YOUR MAIL APP... if nothing happens, ' +
        `<a href="${url}">click here</a> or email <a href="mailto:${TO}">${TO}</a>.`;
      window.location.href = url;
    }
  });
})();

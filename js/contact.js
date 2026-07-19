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

    const subject = `BOOKING REQUEST // ${data.name || 'Anonymous'}`;
    const body =
`:// FAHRENHEIT BOOKING REQUEST ://

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

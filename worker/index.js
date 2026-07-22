/* ============================================================
   FAHRENHEIT — booking backend (Cloudflare Worker)
   Routes:
     GET  /api/availability?month=YYYY-MM  -> { "YYYY-MM-DD": usedWeight }
     POST /api/checkout   {session,date}   -> { url }   (15% retainer)
     POST /api/membership                   -> { url }   ($35/mo sub)
     POST /api/webhook    (Stripe)          -> confirms booking, drafts 85% invoice
     GET  /api/admin?key=..                 -> booking list (quick view)
   Everything else -> static assets (env.ASSETS).

   Secrets (wrangler secret put / dashboard, NEVER committed):
     STRIPE_SECRET_KEY        sk_test_... then sk_live_...
     STRIPE_WEBHOOK_SECRET    whsec_...
     ADMIN_KEY                any long random string (for /api/admin)
   Vars (wrangler.toml [vars], safe):
     MEMBERSHIP_PRICE_ID      price_... (the $35/mo recurring price)
     SITE_ORIGIN              https://fahrenheitvisuals.com
   Binding:  DB  (D1)   ·   ASSETS (static)
   ============================================================ */

// canonical prices (cents) — SINGLE SOURCE OF TRUTH. edit here only.
const CATALOG = {
  ember:    { name: '98.6° Ember',         price: 9000,  weight: 1 },
  boiling:  { name: '212° Boiling Point',  price: 18500, weight: 1 },
  ignition: { name: '451° Ignition',       price: 35000, weight: 2 },
  meltdown: { name: '∞° Meltdown',         price: 60000, weight: 3 },
  student:  { name: 'Student Session',     price: 13500, weight: 1 },
};
const DAY_BUDGET = 3;                 // "2–3 shoots/day depending on type"
const RETAINER = 0.15;                // 15% non-refundable deposit
const HOLD_MS = 30 * 60 * 1000;       // pending hold: 30 min

const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s, headers: { 'content-type': 'application/json' },
});

/* ---------- per-order CALL-SIGN (photography · glitchcore · temperature) ---------- */
// NOTE: no word here may contain the letter B, and the end code is digits only.
const CS_TEMP  = ['FROST','SCORCH','KELVIN','THERMAL','IGNIS','CINDER','INFERNO','GLACIER','MAGMA','WICK','ZERO','CHILL','SEAR','ASH','FLARE','PYRE','TUNDRA','KINDLE'];
const CS_OPTIC = ['APERTURE','SHUTTER','GRAIN','SILVER','NEGATIVE','EXPOSURE','PRISM','LUMEN','FOCAL','HALIDE','DARKROOM','SCANLINE','STATIC','VOID','SIGNAL','RASTER','GHOST','ARTIFACT','FLICKER','FILM','GLARE','NOISE','PIXEL','CONTRAST'];
function makeCallsign(seed) {
  let h = 5381 >>> 0;
  for (const c of seed) h = (((h * 33) >>> 0) ^ c.charCodeAt(0)) >>> 0;
  const w1 = CS_TEMP[h % CS_TEMP.length];
  const w2 = CS_OPTIC[(h >>> 4) % CS_OPTIC.length];
  const num = (h % 10000).toString().padStart(4, '0');   // digits only — no letters
  const deg = 100 + (h % 900);
  return `${w1}-${w2}·${deg}°·${num}`;
}
const VIEW_GRACE = 15 * 60 * 1000;   // one-time page: re-viewable for 15 min, then sealed

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === '/api/availability' && request.method === 'GET') return availability(url, env);
      if (p === '/api/checkout'     && request.method === 'POST') return checkout(request, env, url);
      if (p === '/api/order'        && request.method === 'GET')  return order(url, env);
      if (p === '/api/membership'   && request.method === 'POST') return membership(env, url);
      if (p === '/api/webhook'      && request.method === 'POST') return webhook(request, env);
      if (p === '/api/admin'        && request.method === 'GET')  return admin(url, env);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
    return env.ASSETS.fetch(request);   // static site
  },
};

/* ---------- availability ---------- */
async function availability(url, env) {
  const month = url.searchParams.get('month'); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month || '')) return json({ error: 'bad month' }, 400);
  const now = Date.now();
  const rows = await env.DB.prepare(
    `SELECT date, SUM(weight) AS used FROM bookings
      WHERE date LIKE ?1
        AND (status='confirmed' OR (status='pending' AND expires_at > ?2))
      GROUP BY date`
  ).bind(month + '-%', now).all();
  const out = {};
  for (const r of (rows.results || [])) out[r.date] = r.used;
  return json({ budget: DAY_BUDGET, used: out });
}

/* ---------- retainer checkout ---------- */
async function checkout(request, env, url) {
  const body = await request.json().catch(() => ({}));
  const key = String(body.session || '');
  const date = String(body.date || '');           // YYYY-MM-DD
  const item = CATALOG[key];
  if (!item) return json({ error: 'unknown session' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad date' }, 400);
  if (new Date(date + 'T00:00:00') < new Date(new Date().toDateString()))
    return json({ error: 'date in the past' }, 400);

  // server-side capacity guard (authoritative — client may be stale)
  const now = Date.now();
  const used = await env.DB.prepare(
    `SELECT COALESCE(SUM(weight),0) AS used FROM bookings
      WHERE date=?1 AND (status='confirmed' OR (status='pending' AND expires_at>?2))`
  ).bind(date, now).first();
  if ((used.used || 0) + item.weight > DAY_BUDGET)
    return json({ error: 'That day just filled up — pick another.' }, 409);

  const retainer = Math.round(item.price * RETAINER);
  const id = crypto.randomUUID();
  const sign = makeCallsign(id);
  await env.DB.prepare(
    `INSERT INTO bookings (id,date,session_key,session_name,weight,package_price,retainer_amount,callsign,status,created_at,expires_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'pending',?9,?10)`
  ).bind(id, date, key, item.name, item.weight, item.price, retainer, sign, now, now + HOLD_MS).run();

  const origin = env.SITE_ORIGIN || url.origin;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${origin}/thanks?cs={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${origin}/book?cancelled=1`);
  form.set('customer_creation', 'always');
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'usd');
  form.set('line_items[0][price_data][unit_amount]', String(retainer));
  form.set('line_items[0][price_data][product_data][name]', `${item.name} — 15% retainer (deposit)`);
  form.set('line_items[0][price_data][product_data][description]',
    `Secures ${date}. Call-sign ${sign}. Balance $${((item.price - retainer) / 100).toFixed(2)} invoiced later. Non-refundable.`);
  form.set('metadata[booking_id]', id);
  form.set('metadata[kind]', 'retainer');
  form.set('payment_intent_data[metadata][booking_id]', id);

  const s = await stripe(env, 'checkout/sessions', form);
  if (s.error) return json({ error: s.error.message }, 502);
  await env.DB.prepare(`UPDATE bookings SET stripe_checkout=?1 WHERE id=?2`).bind(s.id, id).run();
  return json({ url: s.url });
}

/* ---------- one-time thank-you / call-sign reveal ---------- */
async function order(url, env) {
  const cs = url.searchParams.get('cs');
  if (!cs) return json({ error: 'missing' }, 400);
  const b = await env.DB.prepare(
    `SELECT id, session_name, date, callsign, viewed_at FROM bookings WHERE stripe_checkout=?1`
  ).bind(cs).first();
  if (!b) return json({ error: 'not_found' }, 404);
  const now = Date.now();
  if (!b.viewed_at) {
    await env.DB.prepare(`UPDATE bookings SET viewed_at=?1 WHERE id=?2`).bind(now, b.id).run();
  } else if (now - b.viewed_at > VIEW_GRACE) {
    return json({ sealed: true });                       // one-time: window has closed
  }
  return json({ sealed: false, callsign: b.callsign, session_name: b.session_name, date: b.date });
}

/* ---------- membership subscription ---------- */
async function membership(env, url) {
  if (!env.MEMBERSHIP_PRICE_ID) return json({ error: 'membership price not configured' }, 500);
  const origin = env.SITE_ORIGIN || url.origin;
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('success_url', `${origin}/book?member=1`);
  form.set('cancel_url', `${origin}/book?cancelled=1`);
  form.set('line_items[0][price]', env.MEMBERSHIP_PRICE_ID);
  form.set('line_items[0][quantity]', '1');
  form.set('metadata[kind]', 'membership');
  const s = await stripe(env, 'checkout/sessions', form);
  if (s.error) return json({ error: s.error.message }, 502);
  return json({ url: s.url });
}

/* ---------- webhook (the trust anchor) ---------- */
async function webhook(request, env) {
  const sig = request.headers.get('stripe-signature') || '';
  const payload = await request.text();
  if (!(await verify(payload, sig, env.STRIPE_WEBHOOK_SECRET)))
    return new Response('bad signature', { status: 400 });

  const evt = JSON.parse(payload);
  if (evt.type === 'checkout.session.completed') {
    const s = evt.data.object;
    const kind = s.metadata && s.metadata.kind;
    const email = (s.customer_details && s.customer_details.email) || s.customer_email || null;

    if (kind === 'retainer') {
      const id = s.metadata.booking_id;
      // idempotent: Stripe may deliver the same event more than once
      const existing = await env.DB.prepare(`SELECT status FROM bookings WHERE id=?1`).bind(id).first();
      if (existing && existing.status !== 'confirmed') {
        await env.DB.prepare(
          `UPDATE bookings SET status='confirmed', stripe_pi=?1, stripe_customer=?2, email=?3 WHERE id=?4`
        ).bind(s.payment_intent || null, s.customer || null, email, id).run();
        // draft the remaining 85% as an invoice (kept DRAFT for review; send from dashboard)
        await draftBalanceInvoice(env, id, s.customer, email).catch(() => {});
      }
    } else if (kind === 'membership') {
      const dup = await env.DB.prepare(`SELECT id FROM members WHERE stripe_sub=?1`).bind(s.subscription || '').first();
      if (!dup) {
        await env.DB.prepare(
          `INSERT INTO members (id,email,stripe_customer,stripe_sub,status,created_at) VALUES (?1,?2,?3,?4,'active',?5)`
        ).bind(crypto.randomUUID(), email, s.customer || null, s.subscription || null, Date.now()).run();
      }
    }
  }
  return json({ received: true });
}

async function draftBalanceInvoice(env, bookingId, customer, email) {
  const b = await env.DB.prepare(`SELECT * FROM bookings WHERE id=?1`).bind(bookingId).first();
  if (!b || b.balance_invoice) return;      // idempotent: don't double-invoice
  let cust = customer;
  if (!cust && email) {
    const cf = new URLSearchParams(); cf.set('email', email);
    const c = await stripe(env, 'customers', cf); cust = c.id;
  }
  if (!cust) return;
  const balance = b.package_price - b.retainer_amount;
  const ii = new URLSearchParams();
  ii.set('customer', cust);
  ii.set('amount', String(balance));
  ii.set('currency', 'usd');
  ii.set('description', `${b.session_name} — remaining balance (${b.date})`);
  await stripe(env, 'invoiceitems', ii);
  const inv = new URLSearchParams();
  inv.set('customer', cust);
  inv.set('collection_method', 'send_invoice');
  inv.set('days_until_due', '14');
  inv.set('auto_advance', 'false');            // stays DRAFT — you review & send. flip true to auto-send.
  const created = await stripe(env, 'invoices', inv);
  if (created.id) await env.DB.prepare(`UPDATE bookings SET balance_invoice=?1 WHERE id=?2`).bind(created.id, bookingId).run();
}

/* ---------- admin quick view ---------- */
async function admin(url, env) {
  const adminKey = (env.ADMIN_KEY || '').trim();
  if (!adminKey || url.searchParams.get('key') !== adminKey)
    return new Response('nope', { status: 401 });
  if (url.searchParams.get('what') === 'prices') {   // helper: list Stripe prices
    const r = await fetch('https://api.stripe.com/v1/prices?limit=20&expand[]=data.product', {
      headers: { 'Authorization': 'Bearer ' + (env.STRIPE_SECRET_KEY || '').trim() } });
    const j = await r.json();
    if (j.error) return json({ error: j.error.message }, 502);
    return json((j.data || []).map(p => ({
      id: p.id, product: p.product && p.product.name,
      amount: p.unit_amount, interval: p.recurring && p.recurring.interval })));
  }
  const rows = await env.DB.prepare(
    `SELECT date,session_name,callsign,status,email,phone,package_price,retainer_amount,balance_invoice
       FROM bookings WHERE status='confirmed' ORDER BY date`).all();
  return json(rows.results || []);
}

/* ---------- Stripe REST helper ---------- */
async function stripe(env, path, form) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + (env.STRIPE_SECRET_KEY || '').trim(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  return r.json();
}

/* ---------- Stripe webhook signature verify (Web Crypto) ---------- */
async function verify(payload, header, secret) {
  secret = (secret || '').trim();
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  // constant-time-ish compare
  if (hex.length !== v1.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

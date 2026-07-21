# Fahrenheit — booking backend setup (test mode first)

Everything is built. This is the checklist to make it live. We do it all in
**Stripe test mode** first (fake cards), verify, then flip to live.

Files already written:
- `worker/index.js` — the backend (availability, 15% checkout, webhook, 85% invoice, membership)
- `worker/schema.sql` — the D1 database tables
- `worker/wrangler.cutover.toml` — the config that replaces root `wrangler.toml` at cutover
- `js/book.js` — client is backend-ready behind `BACKEND.enabled` (currently **false**)

The live site is UNCHANGED until step 6.

---

## 1. Tooling (one time)
Install Node + Wrangler, then log in (opens your browser):
```
winget install OpenJS.NodeJS
npm install -g wrangler
wrangler login
```

## 2. Create the database
```
wrangler d1 create fahrenheit-bookings
```
Copy the `database_id` it prints → paste into `worker/wrangler.cutover.toml`
(replace `PASTE_D1_DATABASE_ID_HERE`).

## 3. Create the tables
```
wrangler d1 execute fahrenheit-bookings --remote --file=worker/schema.sql
```

## 4. Membership price (Stripe dashboard, test mode)
Products → **Add product** → name "Fahrenheit Membership" → price **$35 / month, recurring**
→ Save → copy the **Price ID** (`price_…`) → paste into `wrangler.cutover.toml`
(`MEMBERSHIP_PRICE_ID`).

## 5. Set secrets (values never go in any file)
```
wrangler secret put STRIPE_SECRET_KEY        # paste your sk_test_… key
wrangler secret put ADMIN_KEY                # paste any long random string (your private view)
```
(We add `STRIPE_WEBHOOK_SECRET` in step 7 — it doesn't exist yet.)

## 6. Cut over + deploy
- Replace root `wrangler.toml` with the contents of `worker/wrangler.cutover.toml`
- In `js/book.js` set `BACKEND = { enabled: true }`
- Deploy: `wrangler deploy`

## 7. Webhook (creates the 3rd key)
Stripe dashboard → Developers → **Webhooks** → Add endpoint:
- URL: `https://fahrenheitvisuals.com/api/webhook`
- Events: `checkout.session.completed`
Save → copy the **Signing secret** (`whsec_…`):
```
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler deploy
```

## 8. Test the whole loop
- Open the site → slide heat → pick a day → pay with card `4242 4242 4242 4242`,
  any future expiry, any CVC, any ZIP.
- The day should lock (reload the calendar).
- Check your bookings: `https://fahrenheitvisuals.com/api/admin?key=YOUR_ADMIN_KEY`
- In Stripe (test) you'll see the 15% payment + a **draft** invoice for the 85%.
- Try the membership button → subscription checkout.

## 9. Go live
Swap the Stripe keys test→live (re-run the `wrangler secret put` for the
`sk_live_…` key, create a **live-mode** webhook + membership price, update the
`price_…` and publishable key), then `wrangler deploy`. Done.

---

### Money math (baked into the code, cents)
Ember $90 · Boiling $185 · Ignition $350 · Meltdown $600 · Student $135
Retainer = 15% now (non-refundable) · balance 85% = draft invoice, due in 14 days.
Day capacity = 3 "weight": Meltdown=3 (fills day), Ignition=2, others=1 → 2–3 shoots/day.

### The 85% invoice is DRAFT by default
It won't auto-send — you review and hit send in Stripe. To auto-send instead,
change `auto_advance` to `'true'` in `worker/index.js` (`draftBalanceInvoice`).

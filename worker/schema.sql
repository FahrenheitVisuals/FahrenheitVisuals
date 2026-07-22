-- Fahrenheit booking store (Cloudflare D1)
-- Apply with:  wrangler d1 execute fahrenheit-bookings --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY,        -- our booking id (also Stripe metadata)
  date              TEXT NOT NULL,           -- 'YYYY-MM-DD'
  session_key       TEXT NOT NULL,           -- ember | boiling | ignition | meltdown | student
  session_name      TEXT NOT NULL,           -- pretty label
  weight            INTEGER NOT NULL,        -- day-capacity cost (budget = 3/day)
  package_price     INTEGER NOT NULL,        -- full price, cents
  retainer_amount   INTEGER NOT NULL,        -- 15%, cents
  callsign          TEXT,                    -- per-order call-sign (shown on thank-you page + receipt)
  viewed_at         INTEGER,                 -- when the one-time thank-you page was first opened
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | cancelled
  name              TEXT,
  email             TEXT,
  phone             TEXT,
  stripe_checkout   TEXT,
  stripe_pi         TEXT,
  stripe_customer   TEXT,
  balance_invoice   TEXT,
  created_at        INTEGER NOT NULL,        -- epoch ms
  expires_at        INTEGER                  -- pending-hold expiry (epoch ms)
);
CREATE INDEX IF NOT EXISTS idx_bookings_date   ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE TABLE IF NOT EXISTS members (
  id                TEXT PRIMARY KEY,
  email             TEXT,
  stripe_customer   TEXT,
  stripe_sub        TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        INTEGER NOT NULL
);

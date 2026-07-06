# Clouds — ticketing backend + client

Real backend for the Clouds events site: Postgres/SQLite via Prisma, Stripe
card payments, PayPal payments, signed QR tickets, and an admin API for
publishing events with staged pricing (early bird → regular → door).

## What's real here vs. what you still need to do

This is production-shaped code — proper webhook-verified payments, signed
tickets, transactional scan validation — but it hasn't been deployed or run
against live payment accounts. Before it works end to end you need to:

1. Create Stripe and PayPal accounts and drop your real keys into `.env`
2. Run it somewhere with normal internet access (this was built in a sandbox
   with restricted network access, so `npx prisma generate` and `npm install`
   for the client's Stripe/PayPal SDKs couldn't be fully exercised here —
   they're standard commands that will work on your machine or host)
3. Swap SQLite for Postgres when you deploy (one line in `schema.prisma`)

## 1. Server setup

```bash
cd server
cp .env.example .env
# edit .env: JWT_SECRET, ADMIN_EMAIL/PASSWORD, STRIPE_SECRET_KEY,
# STRIPE_WEBHOOK_SECRET, PAYPAL_CLIENT_ID/SECRET

npm install
npx prisma migrate dev --name init   # creates dev.db (SQLite) + tables
npm run seed:admin                   # creates your first admin login
npm run dev                          # http://localhost:4000
```

### Stripe webhook (required — this is what actually confirms payment)
Locally, use the Stripe CLI to forward events:
```bash
stripe listen --forward-to localhost:4000/api/payments/stripe/webhook
```
It prints a `whsec_...` value — put that in `STRIPE_WEBHOOK_SECRET`.
In production, add the same webhook URL in the Stripe Dashboard
(Developers → Webhooks) listening for `payment_intent.succeeded`.

### Card brands (Visa / Mastercard / etc.)
The Stripe card element already accepts all major networks — Visa,
Mastercard, Amex, Discover — with no per-brand code. If you want to restrict
checkout to only Visa and Mastercard, that's a Dashboard setting, not a code
change: **Settings → Payment methods → Cards → Manage**, then turn off the
brands you don't want. This is account-wide, so it affects every charge on
this Stripe account, not just Clouds ticket sales. Test card numbers per
brand: Visa `4242 4242 4242 4242`, Mastercard `5555 5555 5555 4444`, Amex
`3782 822463 10005` — any future expiry, any CVC.

### PayPal
Get sandbox credentials at developer.paypal.com. Note: this build uses
`@paypal/checkout-server-sdk`, which PayPal has deprecated in favor of
`@paypal/paypal-server-sdk`. It still works today, but if you're starting
fresh it's worth migrating — the Orders API calls are conceptually the same,
just a different SDK surface.

## 2. Client setup

Open `client/index.html` directly, or serve it with any static server.
Edit two placeholders at the top of the file:
- `pk_test_YOUR_PUBLISHABLE_KEY` → your real Stripe publishable key
- `YOUR_PAYPAL_CLIENT_ID` in the PayPal `<script>` tag

And update `const API = 'http://localhost:4000/api'` to wherever you deploy
the server.

## 3. Deploying for real

- **Server**: Render, Railway, or Fly.io all work well for an Express app.
  Set `DATABASE_URL` to a managed Postgres instance (Supabase/Neon/Render
  Postgres are all easy). In `prisma/schema.prisma`, change
  `provider = "sqlite"` to `provider = "postgresql"`, then run
  `npx prisma migrate deploy`.
- **Client**: any static host (Vercel, Netlify, Cloudflare Pages).
- **Env vars**: set all of `.env`'s contents as environment variables on
  your host — never commit `.env` itself.

## How the security-relevant pieces work

- **Ticket QR codes contain a signed JWT**, not a plain ID — the scan
  endpoint verifies the signature before it ever queries the database, so a
  forged or hand-edited QR image is rejected immediately.
- **Payments are only ever confirmed server-side.** The client never marks a
  ticket "paid" itself — Stripe's webhook and PayPal's capture response are
  the only two places that happen, so a compromised browser can't grant a
  free ticket.
- **Scanning a ticket is a database transaction** — two doormen scanning the
  same code in the same second can't both admit the holder; the second scan
  correctly reads "already used."

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/events` | none | List events + active price tier |
| POST | `/api/events` | admin | Create event with price stages |
| DELETE | `/api/events/:id` | admin | Remove an event |
| POST | `/api/payments/stripe/create-intent` | none | Start a card payment |
| POST | `/api/payments/stripe/webhook` | Stripe signature | Confirms payment |
| POST | `/api/payments/paypal/create-order` | none | Start a PayPal payment |
| POST | `/api/payments/paypal/capture/:orderId` | none | Confirms payment |
| GET | `/api/payments/ticket/:id` | none | Poll a ticket's status |
| POST | `/api/scan` | admin | Validate + redeem a ticket |
| POST | `/api/admin/login` | none | Get an admin JWT |
| GET | `/api/admin/tickets` | admin | List sold tickets |

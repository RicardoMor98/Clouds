require('dotenv').config();
const express = require('express');
const cors = require('cors');

const eventsRouter = require('./routes/events');
const paymentsRouter = require('./routes/payments');
const scanRouter = require('./routes/scan');
const adminRouter = require('./routes/admin');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));

// The Stripe webhook route parses its own raw body (see routes/payments.js)
// to verify the signature, so it must skip this global JSON parser —
// running express.json() on an already-consumed stream would break it.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/stripe/webhook') return next();
  express.json()(req, res, next);
});

app.use('/api/events', eventsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/scan', scanRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Clouds API listening on :${port}`));

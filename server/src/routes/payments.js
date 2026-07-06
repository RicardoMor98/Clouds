const express = require('express');
const prisma = require('../db');
const stripe = require('../lib/stripeClient');
const { client: paypalClient, paypalSdk } = require('../lib/paypalClient');
const { signTicket } = require('../lib/ticketToken');

const router = express.Router();

async function createPendingTicket({ eventId, tierId, buyerEmail, buyerName, method }) {
  const tier = await prisma.priceTier.findUnique({ where: { id: tierId } });
  if (!tier || tier.eventId !== eventId) throw new Error('Tier does not match event');
  const ticket = await prisma.ticket.create({
    data: {
      token: 'pending', // replaced once payment is confirmed
      eventId,
      tierId,
      buyerEmail,
      buyerName,
      paymentMethod: method,
      status: 'pending',
    },
  });
  return { ticket, tier };
}

async function finalizeTicket(ticketId, paymentRef) {
  const token = signTicket(ticketId);
  return prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'paid', token, paymentRef, purchasedAt: new Date() },
  });
}

/* ---------------- STRIPE ---------------- */

// 1. Client asks for a PaymentIntent before showing the card form.
router.post('/stripe/create-intent', async (req, res) => {
  try {
    const { eventId, tierId, buyerEmail, buyerName } = req.body;
    const { ticket, tier } = await createPendingTicket({ eventId, tierId, buyerEmail, buyerName, method: 'card' });

    const intent = await stripe.paymentIntents.create({
      amount: tier.priceCents,
      currency: 'usd',
      metadata: { ticketId: ticket.id, eventId, tierId },
      receipt_email: buyerEmail || undefined,
    });

    await prisma.ticket.update({ where: { id: ticket.id }, data: { paymentRef: intent.id } });
    res.json({ clientSecret: intent.client_secret, ticketId: ticket.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Stripe calls this directly — this is the ONLY place a ticket is
//    actually marked "paid". Never trust the client's "success" callback
//    alone, since that can be spoofed by anyone with dev tools open.
//    Needs the raw request body (not JSON-parsed) to verify the signature,
//    so this route carries its own express.raw() middleware — see index.js
//    for the matching skip of the global JSON parser on this exact path.
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const ticketId = intent.metadata.ticketId;
    if (ticketId) {
      await finalizeTicket(ticketId, intent.id);
    }
  }
  res.json({ received: true });
});

/* ---------------- PAYPAL ---------------- */

// 1. Create a PayPal order for the tier's price.
router.post('/paypal/create-order', async (req, res) => {
  try {
    const { eventId, tierId, buyerEmail, buyerName } = req.body;
    const { ticket, tier } = await createPendingTicket({ eventId, tierId, buyerEmail, buyerName, method: 'paypal' });

    const request = new paypalSdk.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: ticket.id,
          amount: { currency_code: 'USD', value: (tier.priceCents / 100).toFixed(2) },
        },
      ],
    });
    const order = await paypalClient().execute(request);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { paymentRef: order.result.id } });
    res.json({ orderId: order.result.id, ticketId: ticket.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Client approves in the PayPal popup, then calls this to capture funds.
//    Ticket is only finalized after PayPal confirms the capture completed.
router.post('/paypal/capture/:orderId', async (req, res) => {
  try {
    const request = new paypalSdk.orders.OrdersCaptureRequest(req.params.orderId);
    request.requestBody({});
    const capture = await paypalClient().execute(request);

    const status = capture.result.status;
    const referenceId = capture.result.purchase_units?.[0]?.reference_id;
    if (status === 'COMPLETED' && referenceId) {
      const ticket = await finalizeTicket(referenceId, req.params.orderId);
      return res.json({ status: 'paid', ticketId: ticket.id, token: ticket.token });
    }
    res.status(400).json({ error: `Capture not completed (status: ${status})` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------------- SHARED: fetch a finalized ticket for display ---------------- */
router.get('/ticket/:ticketId', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.ticketId },
    include: { event: true, tier: true },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

module.exports = router;

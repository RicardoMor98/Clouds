const express = require('express');
const prisma = require('../db');
const { verifyTicketToken } = require('../lib/ticketToken');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Door staff scan a QR, the browser sends the raw token text here.
// Gated behind requireAdmin so randoms can't hit this endpoint directly —
// swap for a lighter "door staff" role if admins and scanners differ.
router.post('/', requireAdmin, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ result: 'invalid', reason: 'No token provided' });

  const verified = verifyTicketToken(token);
  if (!verified.valid) {
    return res.json({ result: 'invalid', reason: 'Signature check failed — not a real Clouds ticket' });
  }

  try {
    // Transaction: read + conditional update happen atomically so two
    // doormen scanning the same ticket at the same instant can't both admit it.
    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id: verified.ticketId },
        include: { event: true, tier: true },
      });
      if (!ticket || ticket.status === 'pending') {
        return { result: 'invalid', reason: 'Ticket not found or never paid' };
      }
      if (ticket.status === 'used') {
        return { result: 'used', ticket };
      }
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: 'used', scannedAt: new Date(), scannedBy: req.admin.email },
      });
      return { result: 'valid', ticket: { ...ticket, ...updated } };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ result: 'invalid', reason: err.message });
  }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { signAdminToken, requireAdmin } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signAdminToken(admin) });
});

// All tickets sold, for the admin dashboard table
router.get('/tickets', requireAdmin, async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    where: { status: { in: ['paid', 'used'] } },
    include: { event: true, tier: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tickets);
});

module.exports = router;

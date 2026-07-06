const express = require('express');
const prisma = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

function pickActiveTier(tiers) {
  const today = new Date();
  const sorted = [...tiers].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  let active = sorted[0];
  for (const t of sorted) {
    if (new Date(t.startDate) <= today) active = t;
  }
  return active;
}

// Public: list events with their currently active price tier
router.get('/', async (req, res) => {
  const events = await prisma.event.findMany({
    include: { tiers: true },
    orderBy: { date: 'asc' },
  });
  const shaped = events.map((ev) => ({
    id: ev.id,
    name: ev.name,
    venue: ev.venue,
    date: ev.date,
    tiers: ev.tiers,
    activeTier: pickActiveTier(ev.tiers),
  }));
  res.json(shaped);
});

router.get('/:id', async (req, res) => {
  const ev = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { tiers: true },
  });
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json({ ...ev, activeTier: pickActiveTier(ev.tiers) });
});

// Admin: create event with one or more price stages
router.post('/', requireAdmin, async (req, res) => {
  const { name, venue, date, tiers } = req.body;
  if (!name || !venue || !date || !Array.isArray(tiers) || tiers.length === 0) {
    return res.status(400).json({ error: 'name, venue, date, and at least one tier are required' });
  }
  const event = await prisma.event.create({
    data: {
      name,
      venue,
      date: new Date(date),
      tiers: {
        create: tiers.map((t) => ({
          name: t.name,
          priceCents: Math.round(Number(t.price) * 100),
          startDate: new Date(t.startDate),
        })),
      },
    },
    include: { tiers: true },
  });
  res.status(201).json(event);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.event.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;

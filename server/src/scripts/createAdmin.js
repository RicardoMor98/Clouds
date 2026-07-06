require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../db');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.admin.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`Admin ready: ${admin.email}`);
  process.exit(0);
}

main();

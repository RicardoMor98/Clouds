const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing admin token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'clouds-admin' });
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

function signAdminToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email }, process.env.JWT_SECRET, {
    expiresIn: '12h',
    issuer: 'clouds-admin',
  });
}

module.exports = { requireAdmin, signAdminToken };

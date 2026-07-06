const jwt = require('jsonwebtoken');

// The QR code contains ONLY this signed token — never the raw ticket id.
// A doorman's scanner verifies the signature before it ever touches the
// database, so nobody can hand-draw or edit a QR image to get in for free.
function signTicket(ticketId) {
  return jwt.sign({ tid: ticketId }, process.env.JWT_SECRET, {
    expiresIn: '180d',
    issuer: 'clouds-events',
  });
}

function verifyTicketToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'clouds-events' });
    return { valid: true, ticketId: payload.tid };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

module.exports = { signTicket, verifyTicketToken };

const crypto = require('crypto');

function generateOTP() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

module.exports = { generateOTP };

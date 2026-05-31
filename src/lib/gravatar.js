'use strict';

const crypto = require('crypto');

function gravatarUrl(email, size = 80) {
  const input = (email || '').trim().toLowerCase();
  const hash  = crypto.createHash('md5').update(input).digest('hex');
  // d=identicon gives a unique geometric pattern for users without a Gravatar
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

module.exports = { gravatarUrl };

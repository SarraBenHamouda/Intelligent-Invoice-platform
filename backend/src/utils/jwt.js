const jwt = require('jsonwebtoken');

function generateAccessToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(
    {
      sub: user.id,
      organizationId: user.organization_id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      issuer: 'invoice-platform-api',
      audience: 'invoice-platform-client',
    }
  );
}

function verifyAccessToken(token) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'invoice-platform-api',
    audience: 'invoice-platform-client',
  });
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
};
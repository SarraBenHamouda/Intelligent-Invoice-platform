const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  try {
    const authorizationHeader =
      req.headers.authorization;

    if (
      !authorizationHeader ||
      !authorizationHeader.startsWith('Bearer ')
    ) {
      return res.status(401).json({
        success: false,
        errorCode: 'ACCESS_TOKEN_REQUIRED',
        message:
          'Un jeton d’accès est obligatoire.',
      });
    }

    const token = authorizationHeader
      .substring(7)
      .trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        errorCode: 'ACCESS_TOKEN_REQUIRED',
        message:
          'Un jeton d’accès est obligatoire.',
      });
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (payload.tokenType !== 'access') {
      return res.status(401).json({
        success: false,
        errorCode: 'INVALID_ACCESS_TOKEN',
        message:
          'Le jeton fourni n’est pas un jeton d’accès.',
      });
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId:
        payload.organizationId || null,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        errorCode: 'ACCESS_TOKEN_EXPIRED',
        message:
          'Le jeton d’accès a expiré.',
      });
    }

    return res.status(401).json({
      success: false,
      errorCode: 'INVALID_ACCESS_TOKEN',
      message:
        'Le jeton d’accès est invalide ou expiré.',
    });
  }
}

module.exports = authenticate;
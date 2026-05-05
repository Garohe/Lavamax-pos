const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function extractUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return verifyToken(auth.slice(7));
  } catch {
    return null;
  }
}

function withAuth(handler) {
  return async (req, res) => {
    const user = extractUser(req);
    if (!user) return res.status(401).json({ error: 'No autorizado' });
    req.user = user;
    return handler(req, res);
  };
}

function withAdmin(handler) {
  return withAuth(async (req, res) => {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Sin permiso' });
    return handler(req, res);
  });
}

module.exports = { signToken, verifyToken, extractUser, withAuth, withAdmin };

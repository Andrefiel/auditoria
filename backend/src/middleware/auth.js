const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = payload; // { username, displayName, isLider }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

// Só usuários do grupo auditores_lideres passam daqui
function requireLider(req, res, next) {
  if (!req.user?.isLider) {
    return res.status(403).json({ error: 'Restrito ao grupo auditores_lideres' });
  }
  next();
}

module.exports = { requireAuth, requireLider };

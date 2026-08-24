const express = require('express');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../services/ldap');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Informe usuário e senha' });
  }

  try {
    const user = await authenticate(username, password);
    const token = jwt.sign(
      { username: user.username, displayName: user.displayName, isLider: user.isLider },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, user });
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    if (err.code === 'LDAP_UNAVAILABLE') {
      return res.status(503).json({ error: 'Não foi possível conectar ao Active Directory. Tente novamente em instantes.' });
    }
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro ao autenticar. Tente novamente.' });
  }
});

module.exports = router;

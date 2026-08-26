const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../services/ldap');
const { validateBody, z } = require('../middleware/validate');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Rate Limit estrito para tentativas de login: máx 10 tentativas a cada 5 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login com falha. Aguarde 5 minutos antes de tentar novamente.' },
});

// Schema de validação Zod do Login (inclui honeypot para proteção contra robôs)
const loginSchema = z.object({
  username: z.string({ required_error: 'Informe o usuário' }).trim().min(2, 'Usuário muito curto').max(80, 'Usuário muito longo'),
  password: z.string({ required_error: 'Informe a senha' }).min(1, 'Informe a senha').max(128, 'Senha muito longa'),
  website: z.string().optional().nullable(),
});

router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  const { username, password, website } = req.body;

  // Bot Protection: Se o campo oculto foi preenchido, é um bot
  if (website) {
    return res.status(400).json({ error: 'Requisição inválida' });
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


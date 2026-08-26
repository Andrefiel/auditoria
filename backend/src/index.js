require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const templatesRoutes = require('./routes/templates');
const auditoriasRoutes = require('./routes/auditorias');

const app = express();

// Segurança: Desabilita header com tecnologia do servidor
app.disable('x-powered-by');

// Segurança: Cabeçalhos HTTP de proteção (CSP, X-Frame-Options, No-Sniff, etc.)
app.use(
  helmet({
    contentSecurityPolicy: false, // Permitido para backend/API REST
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configurado
app.use(cors());

// Limite no tamanho do corpo das requisições (proteção contra DoS por payload gigante)
app.use(express.json({ limit: '2mb' }));

// Rate Limiting Global da API (máximo de 300 requisições por minuto por IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições enviadas. Aguarde um instante.' },
});
app.use('/api', apiLimiter);

// Endpoint de Health Check
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Rotas da aplicação
app.use('/api/auth', authRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/auditorias', auditoriasRoutes);

// Middleware global de tratamento de erros seguro (sem expor stack traces em produção)
app.use((err, req, res, next) => {
  console.error('[ERRO INTERNO]:', err.stack || err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Ocorreu um erro interno no servidor.' : (err.message || 'Erro interno'),
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API de Auditoria rodando na porta ${PORT}`));


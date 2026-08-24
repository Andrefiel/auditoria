require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const templatesRoutes = require('./routes/templates');
const auditoriasRoutes = require('./routes/auditorias');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/auditorias', auditoriasRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API de Auditoria rodando na porta ${PORT}`));

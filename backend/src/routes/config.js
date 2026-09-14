const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { pool } = require('../db');
const { requireAuth, requireLider } = require('../middleware/auth');
const { validateAndSanitizeFile } = require('../middleware/upload');
const { registrarLog } = require('../services/auditLog');

const router = express.Router();

// Diretório de uploads para imagens de branding
const BRANDING_UPLOAD_DIR = process.env.UPLOADS_DIR
  ? path.join(process.env.UPLOADS_DIR, 'branding')
  : path.join(__dirname, '../../uploads/branding');

if (!fs.existsSync(BRANDING_UPLOAD_DIR)) {
  fs.mkdirSync(BRANDING_UPLOAD_DIR, { recursive: true });
}

// Configuração do Multer para upload em memória antes de validação
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

let configMigrated = false;
async function ensureConfigTable() {
  if (configMigrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sistema_configuracoes (
        chave       VARCHAR(60) PRIMARY KEY,
        valor       TEXT NOT NULL,
        tipo        VARCHAR(20) NOT NULL DEFAULT 'string',
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      INSERT INTO sistema_configuracoes (chave, valor, tipo) VALUES
        ('login_logo_url', '', 'imagem_url'),
        ('login_banner_url', '', 'imagem_url'),
        ('login_titulo', 'Excelência diagnóstica e rigor técnico.', 'string'),
        ('login_subtitulo', 'Plataforma de Auditoria Interna e Qualidade Contínua.', 'string')
      ON CONFLICT (chave) DO NOTHING;
    `);
    configMigrated = true;
  } catch (err) {
    console.error('[MIGRATION] Erro ao verificar tabela sistema_configuracoes:', err.message);
  }
}

// GET /api/config/public — rota pública para a tela de login
router.get('/public', async (req, res) => {
  await ensureConfigTable();
  try {
    const { rows } = await pool.query(`SELECT chave, valor FROM sistema_configuracoes`);
    const configMap = {};
    rows.forEach((r) => {
      configMap[r.chave] = r.valor;
    });
    res.json({
      login_logo_url: configMap.login_logo_url || '',
      login_banner_url: configMap.login_banner_url || '',
      login_titulo: configMap.login_titulo || 'Excelência diagnóstica e rigor técnico.',
      login_subtitulo: configMap.login_subtitulo || 'Plataforma de Auditoria Interna e Qualidade Contínua.',
    });
  } catch (err) {
    console.error('Erro ao buscar configurações públicas:', err);
    res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
});

// GET /api/config — lista todas as configurações (requer lider)
router.get('/', requireAuth, requireLider, async (req, res) => {
  await ensureConfigTable();
  try {
    const { rows } = await pool.query(`SELECT chave, valor, tipo, atualizado_em FROM sistema_configuracoes ORDER BY chave`);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar configurações:', err);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// PUT /api/config — atualiza configurações (requer lider)
router.put('/', requireAuth, requireLider, async (req, res) => {
  await ensureConfigTable();
  const { configuracoes } = req.body;
  if (!configuracoes || typeof configuracoes !== 'object') {
    return res.status(400).json({ error: 'Formato de configurações inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [chave, valor] of Object.entries(configuracoes)) {
      if (typeof chave === 'string' && valor !== undefined) {
        await client.query(
          `INSERT INTO sistema_configuracoes (chave, valor, atualizado_em)
           VALUES ($1, $2, now())
           ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
          [chave, String(valor)]
        );
      }
    }
    await client.query('COMMIT');

    registrarLog({
      usuario: req.user.username,
      acao: 'ATUALIZAR_CONFIGURACOES',
      recurso: 'sistema_configuracoes',
      recurso_id: 'branding',
      req,
      detalhes: configuracoes,
    });

    res.json({ ok: true, message: 'Configurações atualizadas com sucesso' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao salvar configurações:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  } finally {
    client.release();
  }
});

// POST /api/config/upload — upload de imagem para branding (logo ou banner)
router.post('/upload', requireAuth, requireLider, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const validation = validateAndSanitizeFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const safeFileName = validation.safeFileName;
    const destPath = path.join(BRANDING_UPLOAD_DIR, safeFileName);

    await fs.promises.writeFile(destPath, req.file.buffer);

    const publicUrl = `/uploads/branding/${safeFileName}`;

    registrarLog({
      usuario: req.user.username,
      acao: 'UPLOAD_BRANDING',
      recurso: 'branding',
      recurso_id: safeFileName,
      req,
      detalhes: { originalName: req.file.originalname, safeFileName, size: req.file.size },
    });

    res.json({ ok: true, url: publicUrl, fileName: safeFileName });
  } catch (err) {
    console.error('Erro no upload de branding:', err);
    res.status(500).json({ error: 'Erro ao processar upload do arquivo' });
  }
});

module.exports = router;

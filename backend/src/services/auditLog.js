const { pool } = require('../db');

// Garante que a tabela exista caso o banco já tenha sido criado antes da migration
let tableInitialized = false;
async function ensureAuditTable() {
  if (tableInitialized) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seguranca_audit_logs (
        id          BIGSERIAL PRIMARY KEY,
        usuario     VARCHAR(80) NOT NULL,
        acao        VARCHAR(60) NOT NULL,
        recurso     VARCHAR(60),
        recurso_id  VARCHAR(100),
        ip          VARCHAR(45),
        user_agent  TEXT,
        detalhes    JSONB,
        criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario ON seguranca_audit_logs (usuario);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_acao ON seguranca_audit_logs (acao);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_criado_em ON seguranca_audit_logs (criado_em DESC);
    `);
    tableInitialized = true;
  } catch (err) {
    console.error('[AUDIT_LOG] Erro ao verificar tabela de logs:', err.message);
  }
}

/**
 * Registra um evento de auditoria de segurança de forma assíncrona.
 * @param {object} params
 * @param {string} params.usuario - Identificador do usuário (ex: maikel.fiel ou 'anonimo')
 * @param {string} params.acao - Nome da ação (ex: 'LOGIN_SUCESSO', 'CRIAR_AUDITORIA', 'APROVAR_AUDITORIA')
 * @param {string} [params.recurso] - Tipo do recurso (ex: 'auditoria', 'auth')
 * @param {string} [params.recurso_id] - ID do recurso afetado
 * @param {object} [params.req] - Objeto req do Express para extrair IP e User-Agent
 * @param {object} [params.detalhes] - Objeto JSON com dados contextuais
 */
async function registrarLog({ usuario, acao, recurso = null, recurso_id = null, req = null, detalhes = null }) {
  try {
    await ensureAuditTable();

    let ip = null;
    let userAgent = null;

    if (req) {
      ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
      userAgent = req.headers['user-agent'] || null;
    }

    await pool.query(
      `INSERT INTO seguranca_audit_logs (usuario, acao, recurso, recurso_id, ip, user_agent, detalhes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [usuario || 'anonimo', acao, recurso, recurso_id ? String(recurso_id) : null, ip, userAgent, detalhes ? JSON.stringify(detalhes) : null]
    );
  } catch (err) {
    // Não interrompe o fluxo principal da aplicação em caso de falha no log
    console.error('[AUDIT_LOG ERROR]:', err.message);
  }
}

module.exports = { registrarLog };

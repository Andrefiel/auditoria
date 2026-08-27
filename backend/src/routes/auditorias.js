const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireLider } = require('../middleware/auth');
const { validateBody, z } = require('../middleware/validate');
const { gerarRelatorioPDF } = require('../services/pdf');
const { notificarEnvioParaAprovacao, notificarDecisao } = require('../services/mailer');
const { registrarLog } = require('../services/auditLog');
const { criterios5s, calcularMedias5S } = require('../services/cincoS');

const router = express.Router();
router.use(requireAuth);

const APP_URL = process.env.APP_URL || 'http://localhost';
const LIDERES_EMAIL = process.env.LIDERES_NOTIFY_EMAIL;

// Schemas Zod de Validação
const criarAuditoriaSchema = z.object({
  template_id: z.number({ required_error: 'template_id é obrigatório' }).int().positive(),
  setor_unidade: z.string({ required_error: 'setor_unidade é obrigatório' }).trim().min(2, 'Setor/unidade muito curto').max(150, 'Setor/unidade muito longo'),
  auditor_lider: z.string().trim().max(120).optional().nullable(),
  auditor_auxiliar: z.string().trim().max(120).optional().nullable(),
  auditor_observador: z.string().trim().max(120).optional().nullable(),
});

const salvarRespostasSchema = z.object({
  respostas: z.array(
    z.object({
      requisito_id: z.number().int().positive(),
      resultado: z.enum(['C', 'NC', 'PA', 'OM', 'NA']).nullable().optional(),
      comentario: z.string().max(3000, 'Comentário muito longo').nullable().optional(),
    })
  ).optional(),
  dados5s: z.object({
    respostas: z.array(z.any()).optional(),
    observacoes: z.string().max(4000, 'Observações do 5S muito longas').nullable().optional(),
  }).optional(),
  conclusao: z.string().max(5000, 'Conclusão muito longa').nullable().optional(),
  auditor_lider: z.string().trim().max(120).nullable().optional(),
  auditor_auxiliar: z.string().trim().max(120).nullable().optional(),
  auditor_observador: z.string().trim().max(120).nullable().optional(),
  setor_unidade: z.string().trim().min(2).max(150).optional(),
});

const decidirSchema = z.object({
  decisao: z.enum(['aprovado', 'reprovado'], { required_error: "decisao deve ser 'aprovado' ou 'reprovado'" }),
  observacao: z.string().max(2000, 'Observação muito longa').nullable().optional(),
});

// Garante que as colunas e tabelas do 5S existam no PostgreSQL
let columnMigrated = false;
async function ensureColumns() {
  if (columnMigrated) return;
  try {
    await pool.query(`
      ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS auditor_observador VARCHAR(120);
      CREATE TABLE IF NOT EXISTS auditorias_5s (
        auditoria_id      UUID PRIMARY KEY REFERENCES auditorias(id) ON DELETE CASCADE,
        respostas         JSONB NOT NULL DEFAULT '[]',
        observacoes       TEXT,
        media_utilizacao  NUMERIC(4,2) DEFAULT 0,
        media_organizacao NUMERIC(4,2) DEFAULT 0,
        media_limpeza     NUMERIC(4,2) DEFAULT 0,
        media_saude       NUMERIC(4,2) DEFAULT 0,
        media_disciplina  NUMERIC(4,2) DEFAULT 0,
        media_geral       NUMERIC(4,2) DEFAULT 0,
        atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    columnMigrated = true;
  } catch (err) {
    console.error('[MIGRATION] Erro ao verificar tabelas 5S/observador:', err.message);
  }
}

// GET /api/auditorias/5s/criterios — retorna os 25 critérios estruturados do 5S
router.get('/5s/criterios', (req, res) => {
  res.json(criterios5s);
});

async function carregarItensComRespostas(auditoriaId, templateId) {
  const { rows } = await pool.query(
    `SELECT r.id AS requisito_id, r.codigo, r.nome, r.requisito, r.evidencia, r.core, r.tag,
            ar.resultado, ar.comentario
     FROM template_requisitos tr
     JOIN requisitos r ON r.id = tr.requisito_id
     LEFT JOIN auditoria_respostas ar
       ON ar.requisito_id = r.id AND ar.auditoria_id = $2
     WHERE tr.template_id = $1
     ORDER BY tr.ordem`,
    [templateId, auditoriaId]
  );
  return rows;
}

// POST /api/auditorias — cria um rascunho novo
router.post('/', validateBody(criarAuditoriaSchema), async (req, res) => {
  await ensureColumns();
  const { template_id, setor_unidade, auditor_lider, auditor_auxiliar, auditor_observador } = req.body;
  const liderEscolhido = auditor_lider || (req.user.isLider ? req.user.displayName : null);
  const auxiliarEscolhido = auditor_auxiliar?.trim() || req.user.displayName;
  const observadorEscolhido = auditor_observador?.trim() || null;

  const { rows } = await pool.query(
    `INSERT INTO auditorias (template_id, setor_unidade, auditor_lider, auditor_auxiliar, auditor_observador, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      template_id,
      setor_unidade,
      liderEscolhido,
      auxiliarEscolhido,
      observadorEscolhido,
      req.user.username,
    ]
  );

  const novaId = rows[0].id;
  registrarLog({
    usuario: req.user.username,
    acao: 'CRIAR_AUDITORIA',
    recurso: 'auditoria',
    recurso_id: novaId,
    req,
    detalhes: { template_id, setor_unidade, auditor_lider: liderEscolhido, auditor_auxiliar: auxiliarEscolhido, auditor_observador: observadorEscolhido },
  });

  res.status(201).json({ id: novaId });
});

// GET /api/auditorias/mine — minhas auditorias
router.get('/mine', async (req, res) => {
  await ensureColumns();
  const { rows } = await pool.query(
    `SELECT a.id, a.setor_unidade, a.status, a.criado_em, a.auditor_auxiliar, a.auditor_observador, t.nome AS template_nome
     FROM auditorias a JOIN templates t ON t.id = a.template_id
     WHERE a.criado_por = $1
     ORDER BY a.atualizado_em DESC`,
    [req.user.username]
  );
  res.json(rows);
});

// GET /api/auditorias/pendentes — fila de aprovação (só auditores_lideres)
router.get('/pendentes', requireLider, async (req, res) => {
  await ensureColumns();
  const { rows } = await pool.query(
    `SELECT a.id, a.setor_unidade, a.criado_em, a.auditor_auxiliar, a.auditor_observador, t.nome AS template_nome,
            (SELECT COUNT(*) FROM auditoria_respostas ar
              WHERE ar.auditoria_id = a.id AND ar.resultado IN ('NC','PA'))::int AS alertas
     FROM auditorias a JOIN templates t ON t.id = a.template_id
     WHERE a.status = 'aguardando_aprovacao'
     ORDER BY a.criado_em ASC`
  );
  res.json(rows);
});

const AUDITORIA_SELECT_FIELDS = `
  a.id, a.template_id, a.setor_unidade, a.auditor_lider, a.auditor_auxiliar, a.auditor_observador,
  a.conclusao, a.status, a.criado_por, a.aprovado_por, a.aprovado_em,
  a.criado_em, a.atualizado_em, t.nome AS template_nome
`;

// GET /api/auditorias/:id — detalhe completo
router.get('/:id', async (req, res) => {
  await ensureColumns();
  const { rows } = await pool.query(
    `SELECT ${AUDITORIA_SELECT_FIELDS} FROM auditorias a
     JOIN templates t ON t.id = a.template_id WHERE a.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
  const auditoria = rows[0];
  const itens = await carregarItensComRespostas(auditoria.id, auditoria.template_id);

  const { rows: r5s } = await pool.query(
    `SELECT respostas, observacoes, media_utilizacao, media_organizacao, media_limpeza, media_saude, media_disciplina, media_geral
     FROM auditorias_5s WHERE auditoria_id = $1`,
    [auditoria.id]
  );
  const dados5s = r5s.length > 0 ? r5s[0] : null;

  res.json({ ...auditoria, itens, dados5s });
});

// PUT /api/auditorias/:id/respostas — salva respostas + conclusão + metadados + 5S (rascunho)
router.put('/:id/respostas', validateBody(salvarRespostasSchema), async (req, res) => {
  await ensureColumns();
  const { respostas, dados5s, conclusao, auditor_lider, auditor_auxiliar, auditor_observador, setor_unidade } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: check } = await client.query(
      `SELECT status, criado_por FROM auditorias WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (check.length === 0) throw Object.assign(new Error('not_found'), { code: 404 });
    if (!['rascunho', 'reprovado'].includes(check[0].status)) {
      throw Object.assign(new Error('Só é possível editar auditorias em rascunho'), { code: 409 });
    }

    if (Array.isArray(respostas)) {
      for (const r of respostas) {
        await client.query(
          `INSERT INTO auditoria_respostas (auditoria_id, requisito_id, resultado, comentario)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (auditoria_id, requisito_id)
           DO UPDATE SET resultado = EXCLUDED.resultado, comentario = EXCLUDED.comentario, atualizado_em = now()`,
          [req.params.id, r.requisito_id, r.resultado || null, r.comentario || null]
        );
      }
    }

    if (dados5s !== undefined) {
      const respostas5s = Array.isArray(dados5s?.respostas) ? dados5s.respostas : [];
      const obs5s = dados5s?.observacoes || null;
      const medias = calcularMedias5S(respostas5s);
      await client.query(
        `INSERT INTO auditorias_5s (auditoria_id, respostas, observacoes, media_utilizacao, media_organizacao, media_limpeza, media_saude, media_disciplina, media_geral, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (auditoria_id) DO UPDATE SET
           respostas = EXCLUDED.respostas,
           observacoes = EXCLUDED.observacoes,
           media_utilizacao = EXCLUDED.media_utilizacao,
           media_organizacao = EXCLUDED.media_organizacao,
           media_limpeza = EXCLUDED.media_limpeza,
           media_saude = EXCLUDED.media_saude,
           media_disciplina = EXCLUDED.media_disciplina,
           media_geral = EXCLUDED.media_geral,
           atualizado_em = now()`,
        [
          req.params.id,
          JSON.stringify(respostas5s),
          obs5s,
          medias.media_utilizacao,
          medias.media_organizacao,
          medias.media_limpeza,
          medias.media_saude,
          medias.media_disciplina,
          medias.media_geral,
        ]
      );
    }

    if (conclusao !== undefined) {
      await client.query(`UPDATE auditorias SET conclusao = $1 WHERE id = $2`, [conclusao, req.params.id]);
    }
    if (auditor_lider !== undefined) {
      await client.query(`UPDATE auditorias SET auditor_lider = $1 WHERE id = $2`, [auditor_lider, req.params.id]);
    }
    if (auditor_auxiliar !== undefined) {
      await client.query(`UPDATE auditorias SET auditor_auxiliar = $1 WHERE id = $2`, [auditor_auxiliar, req.params.id]);
    }
    if (auditor_observador !== undefined) {
      await client.query(`UPDATE auditorias SET auditor_observador = $1 WHERE id = $2`, [auditor_observador, req.params.id]);
    }
    if (setor_unidade !== undefined) {
      await client.query(`UPDATE auditorias SET setor_unidade = $1 WHERE id = $2`, [setor_unidade, req.params.id]);
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === 404) return res.status(404).json({ error: 'Auditoria não encontrada' });
    if (err.code === 409) return res.status(409).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar respostas' });
  } finally {
    client.release();
  }
});

// POST /api/auditorias/:id/enviar — gera o relatório prévio e manda pra aprovação
router.post('/:id/enviar', async (req, res) => {
  await ensureColumns();
  const { rows } = await pool.query(
    `SELECT ${AUDITORIA_SELECT_FIELDS} FROM auditorias a
     JOIN templates t ON t.id = a.template_id WHERE a.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
  const auditoria = rows[0];

  const itens = await carregarItensComRespostas(auditoria.id, auditoria.template_id);
  const semResposta = itens.filter((i) => !i.resultado);
  if (semResposta.length > 0) {
    return res.status(422).json({ error: `${semResposta.length} item(ns) ainda não avaliado(s)` });
  }

  // Validação obrigatória de justificativa/comentário para NC, PA e NA
  const semJustificativa = itens.filter(
    (i) => ['NA', 'NC', 'PA'].includes(i.resultado) && (!i.comentario || !i.comentario.trim())
  );
  if (semJustificativa.length > 0) {
    const itensPendentes = semJustificativa.map((i) => i.codigo || i.nome).slice(0, 5).join(', ');
    return res.status(422).json({
      error: `Justificativa/comentário obrigatório para itens marcados como NC, PA ou NA (${semJustificativa.length} item(ns) pendente(s): ${itensPendentes})`,
    });
  }

  if (!auditoria.conclusao || !auditoria.conclusao.trim()) {
    return res.status(422).json({ error: 'A conclusão é obrigatória antes de enviar' });
  }

  await pool.query(`UPDATE auditorias SET status = 'aguardando_aprovacao' WHERE id = $1`, [req.params.id]);
  await pool.query(
    `INSERT INTO auditoria_historico (auditoria_id, usuario, de_status, para_status, observacao)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.params.id, req.user.username, auditoria.status, 'aguardando_aprovacao', null]
  );

  if (LIDERES_EMAIL) {
    notificarEnvioParaAprovacao({
      to: LIDERES_EMAIL,
      setorNome: auditoria.template_nome,
      unidade: auditoria.setor_unidade,
      auditor: req.user.displayName,
      link: `${APP_URL}/auditorias/${auditoria.id}`,
    });
  }

  registrarLog({
    usuario: req.user.username,
    acao: 'ENVIAR_APROVACAO',
    recurso: 'auditoria',
    recurso_id: req.params.id,
    req,
    detalhes: { setor: auditoria.template_nome, unidade: auditoria.setor_unidade },
  });

  res.json({ ok: true, status: 'aguardando_aprovacao' });
});

// POST /api/auditorias/:id/decidir — aprovar ou reprovar (só auditores_lideres)
router.post('/:id/decidir', requireLider, validateBody(decidirSchema), async (req, res) => {
  const { decisao, observacao } = req.body;
  if (decisao === 'reprovado' && !observacao) {
    return res.status(422).json({ error: 'Observação é obrigatória ao reprovar' });
  }

  const { rows } = await pool.query(
    `SELECT ${AUDITORIA_SELECT_FIELDS} FROM auditorias a
     JOIN templates t ON t.id = a.template_id WHERE a.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
  const auditoria = rows[0];
  if (auditoria.status !== 'aguardando_aprovacao') {
    return res.status(409).json({ error: 'Esta auditoria não está aguardando aprovação' });
  }

  const novoStatus = decisao === 'aprovado' ? 'aprovado' : 'rascunho';

  await pool.query(
    `UPDATE auditorias SET status = $1,
       aprovado_por = CASE WHEN $2 = 'aprovado' THEN $3 ELSE aprovado_por END,
       aprovado_em  = CASE WHEN $2 = 'aprovado' THEN now() ELSE aprovado_em END
     WHERE id = $4`,
    [novoStatus, decisao, req.user.displayName, req.params.id]
  );
  await pool.query(
    `INSERT INTO auditoria_historico (auditoria_id, usuario, de_status, para_status, observacao)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.params.id, req.user.username, auditoria.status, novoStatus, observacao || null]
  );

  notificarDecisao({
    to: `${auditoria.criado_por}@argospatologia.com.br`,
    setorNome: auditoria.template_nome,
    unidade: auditoria.setor_unidade,
    decisao,
    observacao,
    link: `${APP_URL}/auditorias/${auditoria.id}`,
  });

  registrarLog({
    usuario: req.user.username,
    acao: `DECISAO_${decisao.toUpperCase()}`,
    recurso: 'auditoria',
    recurso_id: req.params.id,
    req,
    detalhes: { decisao, observacao, setor: auditoria.template_nome, unidade: auditoria.setor_unidade },
  });

  res.json({ ok: true, status: novoStatus });
});

// GET /api/auditorias/:id/pdf — gera o PDF (prévio se aguardando_aprovacao, final se aprovado)
router.get('/:id/pdf', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${AUDITORIA_SELECT_FIELDS} FROM auditorias a
     JOIN templates t ON t.id = a.template_id WHERE a.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
  const auditoria = rows[0];

  if (!['aguardando_aprovacao', 'aprovado'].includes(auditoria.status)) {
    return res.status(409).json({ error: 'Relatório ainda não disponível para este status' });
  }

  const itens = await carregarItensComRespostas(auditoria.id, auditoria.template_id);

  const { rows: r5s } = await pool.query(
    `SELECT respostas, observacoes, media_utilizacao, media_organizacao, media_limpeza, media_saude, media_disciplina, media_geral
     FROM auditorias_5s WHERE auditoria_id = $1`,
    [auditoria.id]
  );
  const dados5s = r5s.length > 0 ? r5s[0] : null;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="auditoria-${auditoria.template_nome}-${auditoria.id}.pdf"`
  );
  gerarRelatorioPDF(res, auditoria, auditoria.template_nome, itens, auditoria.status === 'aprovado', dados5s);
});

module.exports = router;

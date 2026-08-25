const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireLider } = require('../middleware/auth');
const { gerarRelatorioPDF } = require('../services/pdf');
const { notificarEnvioParaAprovacao, notificarDecisao } = require('../services/mailer');

const router = express.Router();
router.use(requireAuth);

const APP_URL = process.env.APP_URL || 'http://localhost';
// Grupo auditores_lideres normalmente recebe notificação via lista de distribuição do Exchange
const LIDERES_EMAIL = process.env.LIDERES_NOTIFY_EMAIL;

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
router.post('/', async (req, res) => {
  const { template_id, setor_unidade, auditor_lider } = req.body || {};
  if (!template_id || !setor_unidade) {
    return res.status(400).json({ error: 'template_id e setor_unidade são obrigatórios' });
  }

  const liderEscolhido = auditor_lider || (req.user.isLider ? req.user.displayName : null);

  const { rows } = await pool.query(
    `INSERT INTO auditorias (template_id, setor_unidade, auditor_lider, auditor_auxiliar, criado_por)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [
      template_id,
      setor_unidade,
      liderEscolhido,
      req.user.displayName,
      req.user.username,
    ]
  );
  res.status(201).json({ id: rows[0].id });
});

// GET /api/auditorias/mine — minhas auditorias
router.get('/mine', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.setor_unidade, a.status, a.criado_em, t.nome AS template_nome
     FROM auditorias a JOIN templates t ON t.id = a.template_id
     WHERE a.criado_por = $1
     ORDER BY a.atualizado_em DESC`,
    [req.user.username]
  );
  res.json(rows);
});

// GET /api/auditorias/pendentes — fila de aprovação (só auditores_lideres)
router.get('/pendentes', requireLider, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.setor_unidade, a.criado_em, a.auditor_auxiliar, t.nome AS template_nome,
            (SELECT COUNT(*) FROM auditoria_respostas ar
              WHERE ar.auditoria_id = a.id AND ar.resultado IN ('NC','PA'))::int AS alertas
     FROM auditorias a JOIN templates t ON t.id = a.template_id
     WHERE a.status = 'aguardando_aprovacao'
     ORDER BY a.criado_em ASC`
  );
  res.json(rows);
});

// GET /api/auditorias/:id — detalhe completo
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, t.nome AS template_nome FROM auditorias a
     JOIN templates t ON t.id = a.template_id WHERE a.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
  const auditoria = rows[0];
  const itens = await carregarItensComRespostas(auditoria.id, auditoria.template_id);
  res.json({ ...auditoria, itens });
});

// PUT /api/auditorias/:id/respostas — salva respostas + conclusão + metadados (rascunho)
router.put('/:id/respostas', async (req, res) => {
  const { respostas, conclusao, auditor_lider, setor_unidade } = req.body || {};
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

    if (conclusao !== undefined) {
      await client.query(`UPDATE auditorias SET conclusao = $1 WHERE id = $2`, [conclusao, req.params.id]);
    }
    if (auditor_lider !== undefined) {
      await client.query(`UPDATE auditorias SET auditor_lider = $1 WHERE id = $2`, [auditor_lider, req.params.id]);
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
  const { rows } = await pool.query(
    `SELECT a.*, t.nome AS template_nome FROM auditorias a
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

  res.json({ ok: true, status: 'aguardando_aprovacao' });
});

// POST /api/auditorias/:id/decidir — aprovar ou reprovar (só auditores_lideres)
router.post('/:id/decidir', requireLider, async (req, res) => {
  const { decisao, observacao } = req.body || {};
  if (!['aprovado', 'reprovado'].includes(decisao)) {
    return res.status(400).json({ error: "decisao deve ser 'aprovado' ou 'reprovado'" });
  }
  if (decisao === 'reprovado' && !observacao) {
    return res.status(422).json({ error: 'Observação é obrigatória ao reprovar' });
  }

  const { rows } = await pool.query(
    `SELECT a.*, t.nome AS template_nome FROM auditorias a
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

  res.json({ ok: true, status: novoStatus });
});

// GET /api/auditorias/:id/pdf — gera o PDF (prévio se aguardando_aprovacao, final se aprovado)
router.get('/:id/pdf', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, t.nome AS template_nome FROM auditorias a
     JOIN templates t ON t.id = a.template_id WHERE a.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
  const auditoria = rows[0];

  if (!['aguardando_aprovacao', 'aprovado'].includes(auditoria.status)) {
    return res.status(409).json({ error: 'Relatório ainda não disponível para este status' });
  }

  const itens = await carregarItensComRespostas(auditoria.id, auditoria.template_id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="auditoria-${auditoria.template_nome}-${auditoria.id}.pdf"`
  );
  gerarRelatorioPDF(res, auditoria, auditoria.template_nome, itens, auditoria.status === 'aprovado');
});

module.exports = router;

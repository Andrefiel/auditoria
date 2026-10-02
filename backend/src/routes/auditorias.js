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

const revisarAuxiliarSchema = z.object({
  decisao: z.enum(['concordo', 'devolver'], { required_error: "decisao deve ser 'concordo' ou 'devolver'" }),
  observacao: z.string().max(2000, 'Observação muito longa').nullable().optional(),
});

const alterarAuxiliarSchema = z.object({
  auditor_auxiliar: z.string().trim().max(120).nullable().optional(),
});

// Garante que as colunas e tabelas do 5S e assinaturas existam no PostgreSQL
let migrationPromise = null;
function ensureColumns() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      try {
        await pool.query(`
          ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS auditor_observador VARCHAR(120);
          ALTER TABLE auditorias ALTER COLUMN auditor_auxiliar DROP NOT NULL;
          ALTER TABLE auditorias ALTER COLUMN status TYPE VARCHAR(32);
          ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS assinado_por_executor VARCHAR(120);
          ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS assinado_em_executor TIMESTAMPTZ;
          ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS assinado_por_auxiliar VARCHAR(120);
          ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS assinado_em_auxiliar TIMESTAMPTZ;
          ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS observacao_auxiliar TEXT;
          ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS observacao_aprovacao TEXT;
          ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS observacao_reprovacao TEXT;

          DO $$ BEGIN
            ALTER TABLE auditorias DROP CONSTRAINT IF EXISTS auditorias_status_check;
            ALTER TABLE auditorias ADD CONSTRAINT auditorias_status_check
              CHECK (status IN ('rascunho','aguardando_revisao_auxiliar','aguardando_aprovacao','aprovado','reprovado'));
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END $$;

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
      } catch (err) {
        console.error('[MIGRATION] Erro ao verificar tabelas/colunas de assinatura:', err.message);
      }
    })();
  }
  return migrationPromise;
}

// Inicializa no carregamento do módulo
ensureColumns();

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

// GET /api/auditorias/sugestoes-auxiliares — lista nomes sugeridos para autocompletar
router.get('/sugestoes-auxiliares', async (req, res) => {
  try {
    await ensureColumns();
    const { rows } = await pool.query(`
      SELECT DISTINCT TRIM(nome) AS nome FROM (
        SELECT auditor_auxiliar AS nome FROM auditorias WHERE auditor_auxiliar IS NOT NULL AND TRIM(auditor_auxiliar) != ''
        UNION
        SELECT auditor_lider AS nome FROM auditorias WHERE auditor_lider IS NOT NULL AND TRIM(auditor_lider) != ''
        UNION
        SELECT assinado_por_executor AS nome FROM auditorias WHERE assinado_por_executor IS NOT NULL AND TRIM(assinado_por_executor) != ''
        UNION
        SELECT criado_por AS nome FROM auditorias WHERE criado_por IS NOT NULL AND TRIM(criado_por) != ''
      ) s WHERE nome IS NOT NULL AND LENGTH(TRIM(nome)) > 1
      ORDER BY nome ASC LIMIT 50
    `);
    res.json(rows.map((r) => r.nome));
  } catch (err) {
    res.json([]);
  }
});

// POST /api/auditorias — cria um rascunho novo
router.post('/', validateBody(criarAuditoriaSchema), async (req, res) => {
  await ensureColumns();
  const { template_id, setor_unidade, auditor_lider, auditor_auxiliar, auditor_observador } = req.body;
  const liderEscolhido = auditor_lider || (req.user.isLider ? req.user.displayName : null);
  const auxiliarEscolhido = auditor_auxiliar?.trim() || null;
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

// GET /api/auditorias/mine — minhas auditorias + rascunhos em andamento da equipe + pendentes de revisão do auxiliar
router.get('/mine', async (req, res) => {
  await ensureColumns();
  const username = req.user.username;
  const displayName = req.user.displayName || username;

  const { rows } = await pool.query(
    `SELECT a.id, a.setor_unidade, a.status, a.criado_em, a.auditor_lider, a.auditor_auxiliar, a.auditor_observador, a.criado_por,
            a.assinado_por_executor, a.assinado_em_executor, a.assinado_por_auxiliar, a.assinado_em_auxiliar, a.observacao_auxiliar,
            t.nome AS template_nome
     FROM auditorias a JOIN templates t ON t.id = a.template_id
     WHERE a.criado_por = $1
        OR a.status = 'rascunho'
        OR (
             a.status = 'aguardando_revisao_auxiliar' AND (
               a.auditor_auxiliar ILIKE '%' || $1 || '%' OR
               a.auditor_auxiliar ILIKE '%' || $2 || '%' OR
               $2 ILIKE '%' || a.auditor_auxiliar || '%'
             )
           )
     ORDER BY a.atualizado_em DESC`,
    [username, displayName]
  );
  res.json(rows);
});

// GET /api/auditorias/pendentes — fila de aprovação (só auditores_lideres)
router.get('/pendentes', requireLider, async (req, res) => {
  await ensureColumns();
  const { rows } = await pool.query(
    `SELECT a.id, a.setor_unidade, a.criado_em, a.auditor_auxiliar, a.auditor_observador,
            a.assinado_por_executor, a.assinado_por_auxiliar, t.nome AS template_nome,
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
  a.conclusao, a.status, a.criado_por,
  a.assinado_por_executor, a.assinado_em_executor,
  a.assinado_por_auxiliar, a.assinado_em_auxiliar, a.observacao_auxiliar,
  a.aprovado_por, a.aprovado_em, a.observacao_aprovacao, a.observacao_reprovacao,
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

// PATCH /api/auditorias/:id/auxiliar — corrige ou altera o auditor auxiliar
router.patch('/:id/auxiliar', validateBody(alterarAuxiliarSchema), async (req, res) => {
  try {
    await ensureColumns();
    const { auditor_auxiliar } = req.body;
    const novoAuxiliar = auditor_auxiliar && auditor_auxiliar.trim() ? auditor_auxiliar.trim() : null;

    const { rows } = await pool.query(
      `SELECT id, criado_por, status, auditor_auxiliar FROM auditorias WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
    const auditoria = rows[0];

    const podeAlterar = req.user.isLider || auditoria.criado_por === req.user.username;
    if (!podeAlterar) {
      return res.status(403).json({ error: 'Sem permissão para alterar o auditor auxiliar desta auditoria' });
    }

    await pool.query(
      `UPDATE auditorias SET auditor_auxiliar = $1, atualizado_em = now() WHERE id = $2`,
      [novoAuxiliar, req.params.id]
    );

    await pool.query(
      `INSERT INTO auditoria_historico (auditoria_id, usuario, de_status, para_status, observacao)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, req.user.username, auditoria.status, auditoria.status, `Auditor auxiliar atualizado para: ${novoAuxiliar || 'Nenhum'}`]
    );

    res.json({ ok: true, auditor_auxiliar: novoAuxiliar });
  } catch (err) {
    console.error('[ERRO ALTERAR AUXILIAR]:', err);
    res.status(500).json({ error: 'Erro ao atualizar auditor auxiliar' });
  }
});

// POST /api/auditorias/:id/reabrir-rascunho — devolve para rascunho pelo criador ou líder para correções
router.post('/:id/reabrir-rascunho', async (req, res) => {
  try {
    await ensureColumns();
    const { rows } = await pool.query(
      `SELECT id, criado_por, status FROM auditorias WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
    const auditoria = rows[0];

    const podeReabrir = req.user.isLider || auditoria.criado_por === req.user.username;
    if (!podeReabrir) {
      return res.status(403).json({ error: 'Sem permissão para reabrir esta auditoria' });
    }

    await pool.query(
      `UPDATE auditorias SET status = 'rascunho', atualizado_em = now() WHERE id = $1`,
      [req.params.id]
    );

    await pool.query(
      `INSERT INTO auditoria_historico (auditoria_id, usuario, de_status, para_status, observacao)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, req.user.username, auditoria.status, 'rascunho', 'Retornado para rascunho para correções']
    );

    res.json({ ok: true, status: 'rascunho' });
  } catch (err) {
    console.error('[ERRO REABRIR RASCUNHO]:', err);
    res.status(500).json({ error: 'Erro ao reabrir auditoria para rascunho' });
  }
});

// POST /api/auditorias/:id/enviar — finaliza preenchimento, assina pelo executor e manda para auxiliar ou líder
router.post('/:id/enviar', async (req, res) => {
  try {
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

    // Se houver auditor auxiliar informado e diferente do usuário executor logado
    const auxClean = (auditoria.auditor_auxiliar || '').trim().toLowerCase();
    const userDisplay = (req.user.displayName || '').trim().toLowerCase();
    const userName = (req.user.username || '').trim().toLowerCase();
    const temAuxiliar = Boolean(
      auxClean &&
      auxClean !== userDisplay &&
      auxClean !== userName
    );

    const novoStatus = temAuxiliar ? 'aguardando_revisao_auxiliar' : 'aguardando_aprovacao';

    await pool.query(
      `UPDATE auditorias
       SET status = $1, assinado_por_executor = $2, assinado_em_executor = now()
       WHERE id = $3`,
      [novoStatus, req.user.displayName, req.params.id]
    );

    await pool.query(
      `INSERT INTO auditoria_historico (auditoria_id, usuario, de_status, para_status, observacao)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        req.params.id,
        req.user.username,
        auditoria.status,
        novoStatus,
        temAuxiliar
          ? 'Assinado pelo executor e encaminhado para revisão e De Acordo do auxiliar'
          : 'Assinado pelo executor e encaminhado para aprovação do líder',
      ]
    );

    if (novoStatus === 'aguardando_aprovacao' && LIDERES_EMAIL) {
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
      acao: novoStatus === 'aguardando_revisao_auxiliar' ? 'ENVIAR_REVISAO_AUXILIAR' : 'ENVIAR_APROVACAO',
      recurso: 'auditoria',
      recurso_id: req.params.id,
      req,
      detalhes: { setor: auditoria.template_nome, unidade: auditoria.setor_unidade, novoStatus },
    });

    res.json({ ok: true, status: novoStatus });
  } catch (err) {
    console.error('[ERRO ENVIAR]:', err);
    res.status(500).json({ error: err.message || 'Erro ao enviar auditoria' });
  }
});

// POST /api/auditorias/:id/revisar-auxiliar — Auditor auxiliar confere e dá o De Acordo ou Devolve
router.post('/:id/revisar-auxiliar', validateBody(revisarAuxiliarSchema), async (req, res) => {
  try {
    const { decisao, observacao } = req.body;
    if (decisao === 'devolver' && !observacao) {
      return res.status(422).json({ error: 'Observação é obrigatória ao devolver para ajustes' });
    }

    const { rows } = await pool.query(
      `SELECT ${AUDITORIA_SELECT_FIELDS} FROM auditorias a
       JOIN templates t ON t.id = a.template_id WHERE a.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Auditoria não encontrada' });
    const auditoria = rows[0];

    if (auditoria.status !== 'aguardando_revisao_auxiliar') {
      return res.status(409).json({ error: 'Esta auditoria não está aguardando revisão do auditor auxiliar' });
    }

    if (decisao === 'concordo') {
      await pool.query(
        `UPDATE auditorias
         SET status = 'aguardando_aprovacao',
             assinado_por_auxiliar = $1,
             assinado_em_auxiliar = now(),
             observacao_auxiliar = $2
         WHERE id = $3`,
        [req.user.displayName, observacao || null, req.params.id]
      );

      await pool.query(
        `INSERT INTO auditoria_historico (auditoria_id, usuario, de_status, para_status, observacao)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, req.user.username, 'aguardando_revisao_auxiliar', 'aguardando_aprovacao', observacao || 'De acordo pelo auditor auxiliar']
      );

      if (LIDERES_EMAIL) {
        notificarEnvioParaAprovacao({
          to: LIDERES_EMAIL,
          setorNome: auditoria.template_nome,
          unidade: auditoria.setor_unidade,
          auditor: `${auditoria.assinado_por_executor || auditoria.criado_por} e ${req.user.displayName} (Auxiliar)`,
          link: `${APP_URL}/auditorias/${auditoria.id}`,
        });
      }

      registrarLog({
        usuario: req.user.username,
        acao: 'DE_ACORDO_AUXILIAR',
        recurso: 'auditoria',
        recurso_id: req.params.id,
        req,
        detalhes: { observacao },
      });

      res.json({ ok: true, status: 'aguardando_aprovacao' });
    } else {
      // Devolve para rascunho
      await pool.query(
        `UPDATE auditorias
         SET status = 'rascunho',
             observacao_auxiliar = $1
         WHERE id = $2`,
        [observacao, req.params.id]
      );

      await pool.query(
        `INSERT INTO auditoria_historico (auditoria_id, usuario, de_status, para_status, observacao)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, req.user.username, 'aguardando_revisao_auxiliar', 'rascunho', observacao]
      );

      registrarLog({
        usuario: req.user.username,
        acao: 'DEVOLVER_REVISAO_AUXILIAR',
        recurso: 'auditoria',
        recurso_id: req.params.id,
        req,
        detalhes: { observacao },
      });

      res.json({ ok: true, status: 'rascunho' });
    }
  } catch (err) {
    console.error('[ERRO REVISAR AUXILIAR]:', err);
    res.status(500).json({ error: err.message || 'Erro ao processar revisão do auxiliar' });
  }
});

// POST /api/auditorias/:id/decidir — aprovar ou reprovar (só auditores_lideres)
router.post('/:id/decidir', requireLider, validateBody(decidirSchema), async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[ERRO DECIDIR]:', err);
    res.status(500).json({ error: err.message || 'Erro ao processar decisão' });
  }
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

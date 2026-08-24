const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireLider } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/templates — lista os setores/roteiros com contagem de itens
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.id, t.nome, t.status, COUNT(tr.requisito_id)::int AS itens
    FROM templates t
    LEFT JOIN template_requisitos tr ON tr.template_id = t.id
    GROUP BY t.id
    ORDER BY t.nome
  `);
  res.json(rows);
});

// GET /api/templates/:id/itens — requisitos de um roteiro, na ordem cadastrada
router.get('/:id/itens', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.codigo, r.nome, r.requisito, r.evidencia, r.core, r.tag
     FROM template_requisitos tr
     JOIN requisitos r ON r.id = tr.requisito_id
     WHERE tr.template_id = $1
     ORDER BY tr.ordem`,
    [req.params.id]
  );
  res.json(rows);
});

// ---------- A partir daqui, só auditores_lideres ----------
router.use(requireLider);

// POST /api/templates/:id/itens — adiciona um requisito ao roteiro
router.post('/:id/itens', async (req, res) => {
  const { codigo, nome, requisito, evidencia, core, tag } = req.body || {};
  if (!codigo || !nome) {
    return res.status(400).json({ error: 'Código e nome são obrigatórios' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rRes = await client.query(
      `INSERT INTO requisitos (codigo, nome, requisito, evidencia, core, tag)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (codigo) DO UPDATE SET
         nome=EXCLUDED.nome, requisito=EXCLUDED.requisito,
         evidencia=EXCLUDED.evidencia, core=EXCLUDED.core, tag=EXCLUDED.tag
       RETURNING id`,
      [codigo, nome, requisito || '', evidencia || '', !!core, tag || null]
    );
    const requisitoId = rRes.rows[0].id;
    const { rows: ordemRows } = await client.query(
      `SELECT COALESCE(MAX(ordem), -1) + 1 AS next FROM template_requisitos WHERE template_id = $1`,
      [req.params.id]
    );
    await client.query(
      `INSERT INTO template_requisitos (template_id, requisito_id, ordem)
       VALUES ($1,$2,$3)
       ON CONFLICT (template_id, requisito_id) DO NOTHING`,
      [req.params.id, requisitoId, ordemRows[0].next]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: requisitoId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar item' });
  } finally {
    client.release();
  }
});

// PUT /api/templates/:id/itens/:requisitoId — edita um requisito
router.put('/:id/itens/:requisitoId', async (req, res) => {
  const { codigo, nome, requisito, evidencia, core, tag } = req.body || {};
  await pool.query(
    `UPDATE requisitos SET codigo=$1, nome=$2, requisito=$3, evidencia=$4, core=$5, tag=$6
     WHERE id = $7`,
    [codigo, nome, requisito || '', evidencia || '', !!core, tag || null, req.params.requisitoId]
  );
  res.json({ ok: true });
});

// DELETE /api/templates/:id/itens/:requisitoId — remove do roteiro (não apaga o requisito, só o vínculo)
router.delete('/:id/itens/:requisitoId', async (req, res) => {
  await pool.query(
    `DELETE FROM template_requisitos WHERE template_id = $1 AND requisito_id = $2`,
    [req.params.id, req.params.requisitoId]
  );
  res.json({ ok: true });
});

// POST /api/templates/:id/ativar — marca o roteiro como pronto pra uso
router.post('/:id/ativar', async (req, res) => {
  await pool.query(`UPDATE templates SET status = 'ativo' WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;

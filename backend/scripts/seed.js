// Popula os 24 templates (setores) e seus requisitos a partir de data/requisitos.json
// Uso: node scripts/seed.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'requisitos.json'), 'utf-8');
  const data = JSON.parse(raw);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [sector, itens] of Object.entries(data)) {
      const tRes = await client.query(
        `INSERT INTO templates (nome, status)
         VALUES ($1, 'ativo')
         ON CONFLICT (nome) DO UPDATE SET status = 'ativo'
         RETURNING id`,
        [sector]
      );
      const templateId = tRes.rows[0].id;

      let ordem = 0;
      for (const it of itens) {
        if (!it.codigo) continue; // pula itens sem código (falha de parsing residual)
        const rRes = await client.query(
          `INSERT INTO requisitos (codigo, nome, requisito, evidencia, core, tag)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (codigo) DO UPDATE SET
             nome = EXCLUDED.nome,
             requisito = EXCLUDED.requisito,
             evidencia = EXCLUDED.evidencia,
             core = EXCLUDED.core,
             tag = EXCLUDED.tag
           RETURNING id`,
          [it.codigo, it.nome || '', it.requisito || '', it.evidencia || '', !!it.core, it.tag || null]
        );
        const requisitoId = rRes.rows[0].id;

        await client.query(
          `INSERT INTO template_requisitos (template_id, requisito_id, ordem)
           VALUES ($1,$2,$3)
           ON CONFLICT (template_id, requisito_id) DO UPDATE SET ordem = EXCLUDED.ordem`,
          [templateId, requisitoId, ordem]
        );
        ordem += 1;
      }
      console.log(`✓ ${sector}: ${ordem} itens`);
    }

    await client.query('COMMIT');
    console.log('Seed concluído com sucesso.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no seed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

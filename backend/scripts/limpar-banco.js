// Script para resetar/limpar os dados transacionais de teste para entrada em produção
// Preserva intactos: templates, requisitos e sistema_configuracoes.
// Uso: node scripts/limpar-banco.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function limpar() {
  const client = await pool.connect();
  try {
    console.log('Iniciando limpeza de dados de teste...');
    await client.query('BEGIN');

    // Remove todas as auditorias e em cascata suas respostas, histórico e dados 5S
    await client.query('TRUNCATE TABLE auditorias CASCADE');
    console.log('✓ Auditorias, respostas, histórico e avaliações 5S de teste removidas.');

    // Limpa os logs de auditoria de testes
    await client.query('TRUNCATE TABLE seguranca_audit_logs');
    console.log('✓ Logs de auditoria de teste limpos.');

    await client.query('COMMIT');
    console.log('\n✅ Banco de dados preparado para produção com sucesso!');
    console.log('Setores e requisitos mantidos intactos.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro na limpeza do banco:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

limpar();

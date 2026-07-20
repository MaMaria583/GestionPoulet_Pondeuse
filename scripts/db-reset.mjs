/**
 * Réinitialise complètement le schéma public, puis réapplique docs/schema.sql.
 *
 * GARDE-FOU : refuse de s'exécuter si une table contient des données.
 * Forcer avec --force, à n'utiliser qu'en connaissance de cause.
 *
 * Destiné à la phase de conception, tant que le schéma bouge encore. Une fois
 * en production, on passera à des migrations incrémentales.
 */
import { readFile } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';

const force = process.argv.includes('--force');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'`,
  );

  if (tables.length > 0) {
    const comptes = [];
    for (const { table_name } of tables) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM public.${JSON.stringify(table_name)}`,
      );
      if (rows[0].n > 0) comptes.push(`${table_name} (${rows[0].n})`);
    }

    if (comptes.length > 0 && !force) {
      console.error('✘ Réinitialisation refusée : des tables contiennent des données.');
      console.error(`  ${comptes.join(', ')}`);
      console.error('  Relancez avec --force si la perte de ces données est intentionnelle.');
      process.exitCode = 1;
      throw new Error('abandon');
    }
    if (comptes.length > 0) {
      console.warn(`⚠ --force : suppression de ${comptes.join(', ')}`);
    }
  }

  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log('✔ Schéma public réinitialisé.');

  const sql = await readFile('docs/schema.sql', 'utf8');
  await client.query(sql);
  console.log('✔ docs/schema.sql réappliqué.');
} catch (err) {
  if (err.message !== 'abandon') {
    console.error('✘', err.message);
    if (err.detail) console.error('  détail :', err.detail);
    process.exitCode = 1;
  }
} finally {
  client.release();
  await pool.end();
}

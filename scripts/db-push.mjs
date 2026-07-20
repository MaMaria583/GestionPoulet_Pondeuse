/**
 * Applique docs/schema.sql à la base Neon.
 *
 * On utilise Pool (WebSocket) et non le driver HTTP : le fichier contient des
 * corps de fonctions délimités par $$, que découper naïvement sur « ; »
 * casserait. Le protocole simple envoie le fichier entier au serveur, qui
 * l'exécute dans une transaction implicite — donc tout ou rien.
 */
import { readFile } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';

const fichier = process.argv[2] ?? 'docs/schema.sql';
const sql = await readFile(fichier, 'utf8');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log(`✔ ${fichier} appliqué avec succès.`);
} catch (err) {
  console.error(`✘ Échec de l'application de ${fichier}`);
  console.error(`  ${err.message}`);
  if (err.position) {
    const pos = Number(err.position);
    const avant = sql.slice(0, pos);
    const ligne = avant.split('\n').length;
    console.error(`  → ligne ${ligne} : ${sql.slice(pos - 60, pos + 60).replace(/\s+/g, ' ').trim()}`);
  }
  if (err.detail) console.error(`  détail : ${err.detail}`);
  if (err.hint) console.error(`  piste  : ${err.hint}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../drizzle/schema';
import * as relations from '../../drizzle/relations';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL est absent. Copiez .env.example en .env.local et renseignez-le.',
  );
}

/**
 * Client Drizzle sur Neon (driver HTTP).
 *
 * Le driver HTTP suffit ici : chaque requête est indépendante, il n'y a pas
 * de pool à maintenir entre les invocations serverless. Les rares opérations
 * multi-instructions (application du schéma) passent par `Pool`, dans scripts/.
 */
export const db = drizzle(neon(process.env.DATABASE_URL), {
  schema: { ...schema, ...relations },
  casing: 'snake_case',
});

export { schema, relations };

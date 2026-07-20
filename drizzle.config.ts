import { defineConfig } from 'drizzle-kit';

/**
 * La BASE fait autorité, pas ce fichier TypeScript.
 *
 * Le schéma contient des triggers, des vues et une contrainte EXCLUDE que
 * Drizzle ne sait pas exprimer. On écrit donc le SQL à la main dans
 * docs/schema.sql, on l'applique (`npm run db:push`), puis on régénère les
 * types par introspection (`npm run db:pull`). L'inverse — générer le SQL
 * depuis TypeScript — ferait silencieusement disparaître les garde-fous.
 */
export default defineConfig({
  dialect: 'postgresql',
  // Fichiers GÉNÉRÉS par `db:pull` — ne pas les éditer à la main,
  // toute modification se fait dans docs/schema.sql.
  schema: './drizzle/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  casing: 'snake_case',
});

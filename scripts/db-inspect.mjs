import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`;
const types = await sql`
  SELECT typname FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY typname
`;
const version = await sql`SELECT version()`;

console.log('PostgreSQL :', version[0].version.split(',')[0]);
console.log('Tables publiques :', tables.length ? tables.map((t) => t.table_name).join(', ') : '(aucune)');
console.log('Types énumérés  :', types.length ? types.map((t) => t.typname).join(', ') : '(aucun)');

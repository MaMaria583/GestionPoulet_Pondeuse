import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { TableSupprimable } from '@/lib/actions/suppressions';
import type { DateISO } from '@/lib/domain/types';
import type { role_utilisateur } from '@/lib/auth/roles';

const dateISO = (v: unknown): DateISO =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

export interface LigneHistorique {
  id: string;
  table: TableSupprimable;
  date: DateISO;
  categorie: string;
  libelle: string;
  detail: string | null;
  montant: number | null;
  auteur: string | null;
}

/**
 * Journal unifié des saisies récentes, toutes natures confondues.
 *
 * Un UNION ALL plutôt que cinq requêtes séparées : l'utilisatrice pense en
 * « ce que j'ai saisi hier », pas en « mes récoltes, puis mes ventes ».
 * Le tri chronologique global n'est possible qu'en fusionnant côté SQL.
 */
export async function chargerHistorique(bandeId: string, limite = 60): Promise<LigneHistorique[]> {
  const { rows } = await db.execute(sql`
    SELECT * FROM (
      SELECT r.id, 'recoltes_oeufs' AS source, r.date_recolte AS date,
             'Récolte' AS categorie,
             r.creneau::text AS libelle,
             r.nombre_oeufs || ' œufs'
               || CASE WHEN r.oeufs_casses > 0
                       THEN ' (' || r.oeufs_casses || ' cassés)' ELSE '' END AS detail,
             NULL::numeric AS montant, r.created_at, u.nom_complet AS auteur
      FROM recoltes_oeufs r LEFT JOIN users u ON u.id = r.created_by
      WHERE r.bande_id = ${bandeId}

      UNION ALL
      SELECT s.id, 'sorties_oeufs', s.date_sortie, 'Sortie d''œufs',
             replace(s.type::text, '_', ' '),
             s.nombre_oeufs || ' œufs'
               || CASE WHEN s.client IS NOT NULL THEN ' — ' || s.client ELSE '' END,
             s.montant_total, s.created_at, u.nom_complet
      FROM sorties_oeufs s LEFT JOIN users u ON u.id = s.created_by
      WHERE s.bande_id = ${bandeId}

      UNION ALL
      SELECT m.id, 'mouvements_effectif', m.date_mouvement, 'Sortie de poules',
             replace(m.type::text, '_', ' '),
             m.quantite || ' poule(s)'
               || CASE WHEN m.motif IS NOT NULL THEN ' — ' || m.motif ELSE '' END,
             m.montant_total, m.created_at, u.nom_complet
      FROM mouvements_effectif m LEFT JOIN users u ON u.id = m.created_by
      WHERE m.bande_id = ${bandeId}

      UNION ALL
      SELECT d.id, 'depenses', d.date_depense, 'Dépense',
             replace(d.categorie::text, '_', ' '), d.libelle,
             d.montant, d.created_at, u.nom_complet
      FROM depenses d LEFT JOIN users u ON u.id = d.created_by
      WHERE d.bande_id = ${bandeId}

      UNION ALL
      SELECT a.id, 'alimentations', a.date_conso, 'Alimentation',
             a.type_aliment::text, a.quantite_kg || ' kg',
             a.montant_total, a.created_at, NULL
      FROM alimentations a
      WHERE a.bande_id = ${bandeId}
    ) t
    ORDER BY date DESC, created_at DESC
    LIMIT ${limite}
  `);

  return rows.map((r) => ({
    id: String(r.id),
    table: r.source as TableSupprimable,
    date: dateISO(r.date),
    categorie: String(r.categorie),
    libelle: String(r.libelle),
    detail: r.detail == null ? null : String(r.detail),
    montant: r.montant == null ? null : Number(r.montant),
    auteur: r.auteur == null ? null : String(r.auteur),
  }));
}

export interface Utilisateur {
  id: string;
  email: string;
  nomComplet: string;
  role: role_utilisateur;
  actif: boolean;
  derniereConnexion: string | null;
}

export async function listerUtilisateurs(fermeId: string): Promise<Utilisateur[]> {
  const { rows } = await db.execute(sql`
    SELECT id, email, nom_complet, role, actif, derniere_connexion
    FROM users WHERE ferme_id = ${fermeId}
    ORDER BY actif DESC, nom_complet
  `);
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    nomComplet: String(r.nom_complet),
    role: r.role as role_utilisateur,
    actif: r.actif === true,
    derniereConnexion: r.derniere_connexion ? String(r.derniere_connexion) : null,
  }));
}

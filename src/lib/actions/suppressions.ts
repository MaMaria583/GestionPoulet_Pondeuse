'use server';

import { revalidatePath } from 'next/cache';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { exigerUtilisateur } from '@/lib/auth';
import { peutSupprimer } from '@/lib/auth/roles';
import type { Retour } from './saisie';

/**
 * Suppression d'une ligne de saisie, avec trace.
 *
 * Le nom de table ne peut PAS être passé en paramètre SQL — seules les
 * valeurs peuvent l'être. Interpoler une chaîne venue du formulaire dans le
 * `FROM` ouvrirait une injection. On passe donc par une liste blanche de
 * requêtes entièrement littérales, indexée par un identifiant validé.
 */
export type TableSupprimable =
  | 'recoltes_oeufs'
  | 'sorties_oeufs'
  | 'mouvements_effectif'
  | 'depenses'
  | 'alimentations';

/**
 * Chaque entrée porte sa propre requête de lecture, jointe à `bandes` pour
 * garantir que la ligne appartient bien à la ferme de l'utilisateur.
 * `depenses` porte `ferme_id` en direct (les charges générales n'ont pas
 * de bande), d'où son traitement distinct.
 */
const LECTURES: Record<TableSupprimable, (id: string, fermeId: string) => SQL> = {
  recoltes_oeufs: (id, f) => sql`
    SELECT to_jsonb(r) AS contenu FROM recoltes_oeufs r
    JOIN bandes b ON b.id = r.bande_id
    WHERE r.id = ${id} AND b.ferme_id = ${f}`,
  sorties_oeufs: (id, f) => sql`
    SELECT to_jsonb(s) AS contenu FROM sorties_oeufs s
    JOIN bandes b ON b.id = s.bande_id
    WHERE s.id = ${id} AND b.ferme_id = ${f}`,
  mouvements_effectif: (id, f) => sql`
    SELECT to_jsonb(m) AS contenu FROM mouvements_effectif m
    JOIN bandes b ON b.id = m.bande_id
    WHERE m.id = ${id} AND b.ferme_id = ${f}`,
  depenses: (id, f) => sql`
    SELECT to_jsonb(d) AS contenu FROM depenses d
    WHERE d.id = ${id} AND d.ferme_id = ${f}`,
  alimentations: (id, f) => sql`
    SELECT to_jsonb(a) AS contenu FROM alimentations a
    JOIN bandes b ON b.id = a.bande_id
    WHERE a.id = ${id} AND b.ferme_id = ${f}`,
};

const SUPPRESSIONS: Record<TableSupprimable, (id: string) => SQL> = {
  recoltes_oeufs: (id) => sql`DELETE FROM recoltes_oeufs WHERE id = ${id}`,
  sorties_oeufs: (id) => sql`DELETE FROM sorties_oeufs WHERE id = ${id}`,
  mouvements_effectif: (id) => sql`DELETE FROM mouvements_effectif WHERE id = ${id}`,
  depenses: (id) => sql`DELETE FROM depenses WHERE id = ${id}`,
  alimentations: (id) => sql`DELETE FROM alimentations WHERE id = ${id}`,
};

const LIBELLES: Record<TableSupprimable, string> = {
  recoltes_oeufs: 'Récolte',
  sorties_oeufs: 'Sortie d’œufs',
  mouvements_effectif: 'Sortie de poules',
  depenses: 'Dépense',
  alimentations: 'Alimentation',
};

function messageErreur(err: unknown): string {
  const morceaux: string[] = [];
  let courant: unknown = err;
  for (let i = 0; i < 5 && courant instanceof Error; i++) {
    morceaux.push(courant.message);
    courant = (courant as Error & { cause?: unknown }).cause;
  }
  const brut = morceaux.join(' | ');

  const regle = brut.match(/déjà sortis du stock[^|]*/);
  if (regle) {
    return `Suppression impossible : ces œufs sont ${regle[0]}`;
  }
  if (brut.includes('ne permet pas')) return brut;
  console.error('[suppressions] erreur non prévue :', brut);
  return 'La suppression a échoué. Réessayez, et signalez le problème s’il persiste.';
}

export async function supprimerLigne(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerUtilisateur();

  if (!peutSupprimer(session.role)) {
    return { ok: false, erreur: 'Votre rôle ne permet pas de supprimer une saisie.' };
  }

  const table = String(donnees.get('table') ?? '') as TableSupprimable;
  const ligneId = String(donnees.get('ligneId') ?? '');

  if (!(table in LECTURES)) {
    return { ok: false, erreur: 'Type d’enregistrement inconnu.' };
  }
  if (!/^[0-9a-f-]{36}$/i.test(ligneId)) {
    return { ok: false, erreur: 'Identifiant invalide.' };
  }

  try {
    // 1. Relire la ligne EN VÉRIFIANT l'appartenance à la ferme
    const { rows } = await db.execute(LECTURES[table](ligneId, session.fermeId));
    if (rows.length === 0) {
      return { ok: false, erreur: 'Enregistrement introuvable dans votre exploitation.' };
    }

    // 2. Archiver avant suppression. Si l'étape 3 échoue (trigger de stock),
    //    la transaction implicite de l'action laisse cette trace orpheline —
    //    d'où l'ordre inverse : on supprime d'abord, on archive ensuite.
    await db.execute(SUPPRESSIONS[table](ligneId));

    await db.execute(sql`
      INSERT INTO journal_suppressions (ferme_id, table_source, ligne_id, contenu, supprime_par)
      VALUES (${session.fermeId}, ${table}, ${ligneId},
              ${JSON.stringify(rows[0].contenu)}::jsonb, ${session.userId})
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/saisie');
  revalidatePath('/historique');
  return { ok: true, message: `${LIBELLES[table]} supprimée.` };
}

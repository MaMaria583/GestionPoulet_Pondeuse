'use server';

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { hacherMotDePasse, LONGUEUR_MIN_MOT_DE_PASSE } from '@/lib/auth/password';
import { creerSession } from '@/lib/auth/session';
import type { Retour } from './saisie';

export type { Retour };

/**
 * Inscription : crée une exploitation ET son compte propriétaire.
 *
 * C'est le seul point d'entrée pour un visiteur sans compte. Les autres
 * comptes d'une exploitation sont créés depuis /utilisateurs, par son
 * propriétaire — sinon n'importe qui pourrait s'ajouter à une ferme existante.
 */

const schema = z
  .object({
    nomFerme: z.string().min(1, 'Indiquez le nom de votre exploitation').max(200),
    localisation: z.string().max(200).optional().transform((v) => v?.trim() || undefined),
    nomComplet: z.string().min(1, 'Indiquez votre nom').max(200),
    email: z.string().email('Adresse e-mail invalide').max(200),
    motDePasse: z.string().min(
      LONGUEUR_MIN_MOT_DE_PASSE,
      `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères`,
    ),
    confirmation: z.string(),
  })
  .refine((d) => d.motDePasse === d.confirmation, {
    message: 'La confirmation ne correspond pas au mot de passe',
    path: ['confirmation'],
  });

export async function inscrire(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const analyse = schema.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) return { ok: false, erreur: analyse.error.issues[0].message };
  const d = analyse.data;

  const email = d.email.toLowerCase().trim();

  try {
    const hash = await hacherMotDePasse(d.motDePasse);

    /*
     * Ferme et compte sont créés par UNE SEULE instruction, via une CTE
     * modifiante. Le driver HTTP de Neon est sans état : il ne porte pas de
     * transaction sur plusieurs requêtes. En deux instructions séparées, un
     * e-mail déjà pris ferait échouer la seconde et laisserait une
     * exploitation orpheline, sans propriétaire et invisible.
     * Ici, tout réussit ou rien n'est écrit.
     */
    const { rows } = await db.execute(sql`
      WITH nouvelle_ferme AS (
        INSERT INTO fermes (nom, localisation)
        VALUES (${d.nomFerme}, ${d.localisation ?? null})
        RETURNING id
      )
      INSERT INTO users (ferme_id, email, nom_complet, password_hash, role)
      SELECT nf.id, ${email}, ${d.nomComplet}, ${hash}, 'proprietaire'
      FROM nouvelle_ferme nf
      RETURNING id, ferme_id
    `);

    const u = rows[0];
    await creerSession({
      userId: String(u.id),
      fermeId: String(u.ferme_id),
      email,
      nom: d.nomComplet,
      role: 'proprietaire',
    });
  } catch (err) {
    const brut = err instanceof Error ? err.message : String(err);
    const cause = (err as Error & { cause?: Error })?.cause?.message ?? '';
    const complet = `${brut} ${cause}`;

    if (complet.includes('users_email_unique')) {
      return {
        ok: false,
        erreur: 'Un compte utilise déjà cette adresse e-mail. Connectez-vous plutôt.',
      };
    }
    if (complet.includes('chk_email_format')) {
      return { ok: false, erreur: 'Adresse e-mail invalide.' };
    }
    console.error('[inscription] erreur non prévue :', complet);
    return { ok: false, erreur: 'La création du compte a échoué. Réessayez.' };
  }

  // Succès : le composant client redirige, la session étant déjà posée.
  return { ok: true, message: 'Compte créé.' };
}

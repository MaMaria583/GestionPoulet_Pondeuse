'use server';

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { exigerUtilisateur, utilisateurCourant } from '@/lib/auth';
import { hacherMotDePasse, verifierMotDePasse, LONGUEUR_MIN_MOT_DE_PASSE } from '@/lib/auth/password';
import { peutGererUtilisateurs } from '@/lib/auth/roles';
import type { Retour } from './saisie';

export type { Retour };

async function exigerGestionUtilisateurs() {
  const session = await exigerUtilisateur();
  if (!peutGererUtilisateurs(session.role)) {
    throw new Error('Seul le propriétaire peut gérer les comptes.');
  }
  return session;
}

function messageErreur(err: unknown): string {
  const brut = err instanceof Error ? err.message : String(err);
  if (brut.includes('users_email_unique')) {
    return 'Un compte utilise déjà cette adresse e-mail.';
  }
  if (brut.includes('chk_email_format')) return 'Adresse e-mail invalide.';
  if (brut.includes('propriétaire peut') || brut.includes('au moins')) return brut;
  console.error('[utilisateurs] erreur non prévue :', brut);
  return 'L’opération a échoué. Réessayez, et signalez le problème s’il persiste.';
}

// ---------------------------------------------------------------------------
const schemaCreation = z.object({
  email: z.string().email('Adresse e-mail invalide').max(200),
  nomComplet: z.string().min(1, 'Indiquez un nom').max(200),
  role: z.enum(['proprietaire', 'gestionnaire', 'saisie', 'lecture']),
  motDePasse: z.string().min(
    LONGUEUR_MIN_MOT_DE_PASSE,
    `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères`,
  ),
});

export async function creerUtilisateur(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerGestionUtilisateurs();
  const analyse = schemaCreation.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) return { ok: false, erreur: analyse.error.issues[0].message };
  const d = analyse.data;

  try {
    const hash = await hacherMotDePasse(d.motDePasse);
    // L'e-mail est normalisé en minuscules : l'index unique porte sur
    // lower(email), autant stocker la forme qui sera comparée.
    await db.execute(sql`
      INSERT INTO users (ferme_id, email, nom_complet, password_hash, role)
      VALUES (${session.fermeId}, ${d.email.toLowerCase()}, ${d.nomComplet}, ${hash}, ${d.role})
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/utilisateurs');
  return { ok: true, message: `Compte créé pour ${d.nomComplet}.` };
}

// ---------------------------------------------------------------------------
const schemaRole = z.object({
  userId: z.string().uuid(),
  role: z.enum(['proprietaire', 'gestionnaire', 'saisie', 'lecture']),
});

export async function changerRole(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerGestionUtilisateurs();
  const analyse = schemaRole.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) return { ok: false, erreur: analyse.error.issues[0].message };
  const d = analyse.data;

  // On ne peut pas se rétrograder soi-même : l'exploitation se retrouverait
  // sans aucun propriétaire, donc sans personne pour rétablir les droits.
  if (d.userId === session.userId && d.role !== 'proprietaire') {
    return {
      ok: false,
      erreur: 'Vous ne pouvez pas modifier votre propre rôle. Demandez à un autre propriétaire.',
    };
  }

  try {
    await db.execute(sql`
      UPDATE users SET role = ${d.role}
      WHERE id = ${d.userId} AND ferme_id = ${session.fermeId}
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/utilisateurs');
  return { ok: true, message: 'Rôle mis à jour.' };
}

// ---------------------------------------------------------------------------
export async function basculerActivation(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerGestionUtilisateurs();
  const userId = String(donnees.get('userId') ?? '');

  if (userId === session.userId) {
    return { ok: false, erreur: 'Vous ne pouvez pas désactiver votre propre compte.' };
  }

  try {
    // Le `ferme_id` dans le WHERE fait le cloisonnement : sans lui, un
    // propriétaire pourrait désactiver le compte d'une autre exploitation.
    const { rows } = await db.execute(sql`
      UPDATE users SET actif = NOT actif
      WHERE id = ${userId} AND ferme_id = ${session.fermeId}
      RETURNING actif, nom_complet
    `);
    if (rows.length === 0) return { ok: false, erreur: 'Compte introuvable.' };

    revalidatePath('/utilisateurs');
    return {
      ok: true,
      message: `${rows[0].nom_complet} ${rows[0].actif ? 'réactivé' : 'désactivé'}.`,
    };
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }
}

// ---------------------------------------------------------------------------
const schemaMotDePasse = z.object({
  ancien: z.string().min(1, 'Indiquez votre mot de passe actuel'),
  nouveau: z.string().min(
    LONGUEUR_MIN_MOT_DE_PASSE,
    `Le nouveau mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères`,
  ),
  confirmation: z.string(),
}).refine((d) => d.nouveau === d.confirmation, {
  message: 'La confirmation ne correspond pas au nouveau mot de passe',
  path: ['confirmation'],
});

/** Changement de son PROPRE mot de passe. Accessible à tous les rôles. */
export async function changerMonMotDePasse(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await utilisateurCourant();
  if (!session) return { ok: false, erreur: 'Session expirée. Reconnectez-vous.' };

  const analyse = schemaMotDePasse.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) return { ok: false, erreur: analyse.error.issues[0].message };
  const d = analyse.data;

  try {
    const { rows } = await db.execute(sql`
      SELECT password_hash FROM users WHERE id = ${session.userId}
    `);
    if (rows.length === 0) return { ok: false, erreur: 'Compte introuvable.' };

    // On revérifie l'ancien mot de passe : sans cela, un cookie volé
    // suffirait à verrouiller le compte de son propriétaire légitime.
    const valide = await verifierMotDePasse(d.ancien, String(rows[0].password_hash));
    if (!valide) return { ok: false, erreur: 'Mot de passe actuel incorrect.' };

    await db.execute(sql`
      UPDATE users SET password_hash = ${await hacherMotDePasse(d.nouveau)}
      WHERE id = ${session.userId}
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  return { ok: true, message: 'Mot de passe modifié.' };
}

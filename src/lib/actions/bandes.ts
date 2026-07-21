'use server';

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { exigerBandeDeLaFerme, exigerUtilisateur } from '@/lib/auth';
import { peutGererBandes } from '@/lib/auth/roles';
import { estDateISO } from '@/lib/domain/dates';
import type { Retour } from './saisie';

const dateISO = z.string().refine(estDateISO, 'Date invalide (format attendu : AAAA-MM-JJ)');

async function exigerGestionBandes() {
  const session = await exigerUtilisateur();
  if (!peutGererBandes(session.role)) {
    throw new Error('Votre rôle ne permet pas de gérer les bandes.');
  }
  return session;
}

function messageErreur(err: unknown): string {
  const brut = err instanceof Error ? err.message : String(err);
  if (brut.includes('bandes_code_unique')) {
    return 'Ce code de bande existe déjà dans votre exploitation.';
  }
  if (brut.includes('chk_ponte_apres_intro')) {
    return 'La date de début de ponte ne peut pas précéder la date d’introduction.';
  }
  if (brut.includes('ne permet pas')) return brut;
  console.error('[bandes] erreur non prévue :', brut);
  return 'L’opération a échoué. Réessayez, et signalez le problème s’il persiste.';
}

// ---------------------------------------------------------------------------
const schemaCreation = z.object({
  code: z.string().min(1, 'Indiquez un code').max(50),
  nom: z.string().max(200).optional().transform((v) => v?.trim() || undefined),
  dateIntroduction: dateISO,
  effectifInitial: z.coerce.number().int().positive('L’effectif doit être supérieur à zéro'),
  dateDebutPonte: z.string().optional().transform((v) => v?.trim() || undefined),
  souche: z.string().max(100).optional().transform((v) => v?.trim() || undefined),
  notes: z.string().max(1000).optional().transform((v) => v?.trim() || undefined),
});

export async function creerBande(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerGestionBandes();
  const analyse = schemaCreation.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) return { ok: false, erreur: analyse.error.issues[0].message };
  const d = analyse.data;

  if (d.dateDebutPonte && !estDateISO(d.dateDebutPonte)) {
    return { ok: false, erreur: 'Date de début de ponte invalide.' };
  }

  try {
    await db.execute(sql`
      INSERT INTO bandes (ferme_id, code, nom, date_introduction, effectif_initial,
                          date_debut_ponte, souche, notes)
      VALUES (${session.fermeId}, ${d.code}, ${d.nom ?? null}, ${d.dateIntroduction},
              ${d.effectifInitial}, ${d.dateDebutPonte ?? null}, ${d.souche ?? null},
              ${d.notes ?? null})
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/bandes');
  return { ok: true, message: `Bande ${d.code} créée.` };
}

// ---------------------------------------------------------------------------
const schemaModification = z.object({
  bandeId: z.string().uuid(),
  nom: z.string().max(200).optional().transform((v) => v?.trim() || undefined),
  dateDebutPonte: z.string().optional().transform((v) => v?.trim() || undefined),
  souche: z.string().max(100).optional().transform((v) => v?.trim() || undefined),
  notes: z.string().max(1000).optional().transform((v) => v?.trim() || undefined),
});

export async function modifierBande(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerGestionBandes();
  const analyse = schemaModification.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) return { ok: false, erreur: analyse.error.issues[0].message };
  const d = analyse.data;

  if (d.dateDebutPonte && !estDateISO(d.dateDebutPonte)) {
    return { ok: false, erreur: 'Date de début de ponte invalide.' };
  }

  try {
    await exigerBandeDeLaFerme(d.bandeId, session.fermeId);
    await db.execute(sql`
      UPDATE bandes
      SET nom = ${d.nom ?? null},
          date_debut_ponte = ${d.dateDebutPonte ?? null},
          souche = ${d.souche ?? null},
          notes = ${d.notes ?? null}
      WHERE id = ${d.bandeId}
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/bandes');
  return { ok: true, message: 'Bande mise à jour.' };
}

// ---------------------------------------------------------------------------
const schemaCloture = z.object({
  bandeId: z.string().uuid(),
  dateCloture: dateISO,
});

/**
 * Clôture une bande.
 *
 * La contrainte `chk_cloture_coherente` impose que statut et date_cloture
 * évoluent ensemble : on ne peut pas se retrouver avec une bande « clôturée »
 * sans date, ni l'inverse.
 */
export async function cloturerBande(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerGestionBandes();
  const analyse = schemaCloture.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) return { ok: false, erreur: analyse.error.issues[0].message };
  const d = analyse.data;

  try {
    await exigerBandeDeLaFerme(d.bandeId, session.fermeId);
    const { rows } = await db.execute(sql`
      SELECT date_introduction FROM bandes WHERE id = ${d.bandeId}
    `);
    const intro = String(rows[0].date_introduction).slice(0, 10);
    if (d.dateCloture < intro) {
      return { ok: false, erreur: 'La date de clôture ne peut pas précéder l’introduction.' };
    }

    await db.execute(sql`
      UPDATE bandes SET statut = 'cloturee', date_cloture = ${d.dateCloture}
      WHERE id = ${d.bandeId}
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/bandes');
  return { ok: true, message: 'Bande clôturée. Elle n’émet plus d’alerte.' };
}

export async function rouvrirBande(_p: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerGestionBandes();
  const bandeId = String(donnees.get('bandeId') ?? '');

  try {
    await exigerBandeDeLaFerme(bandeId, session.fermeId);
    await db.execute(sql`
      UPDATE bandes SET statut = 'active', date_cloture = NULL WHERE id = ${bandeId}
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/bandes');
  return { ok: true, message: 'Bande rouverte.' };
}

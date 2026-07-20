'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { detruireSession, exigerBandeDeLaFerme, exigerSaisie } from '@/lib/auth';
import { versOeufs } from '@/lib/domain/oeufs';
import { estDateISO } from '@/lib/domain/dates';

/**
 * Actions de saisie quotidienne.
 *
 * Chaîne de validation, dans cet ordre :
 *   1. Rôle          — `exigerSaisie()`
 *   2. Appartenance  — la bande est bien dans la ferme de l'utilisateur
 *   3. Forme         — Zod (types, bornes, format de date)
 *   4. Métier        — fonctions du domaine (conversion alvéoles → œufs)
 *   5. Intégrité     — triggers PostgreSQL (stock, effectif)
 *
 * Les étapes 1 à 4 servent le confort et la clarté des messages. L'étape 5
 * est la seule qui ne peut pas être contournée, et c'est elle qui garantit
 * qu'aucune vente ne dépassera jamais le stock.
 */

export type Retour = { ok: true; message: string } | { ok: false; erreur: string };

const dateISO = z.string().refine(estDateISO, 'Date invalide (format attendu : AAAA-MM-JJ)');
const uuid = z.string().uuid('Bande invalide');
const unite = z.enum(['oeuf', 'alveole']);

/**
 * Champ texte facultatif.
 *
 * Un `<input>` vide arrive dans FormData comme chaîne vide, pas comme absent.
 * Sans cette transformation, la base stockerait `''` au lieu de `NULL` — et
 * « client = chaîne vide » se distingue mal de « client renseigné » dans les
 * requêtes ultérieures.
 */
const texteOptionnel = (max: number) =>
  z.string().max(max).optional().transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

/**
 * Aplatit la chaîne des causes d'une erreur.
 *
 * Le driver Neon enveloppe les erreurs PostgreSQL : `err.message` ne contient
 * que « Failed query: … », et le message levé par nos triggers se trouve dans
 * `err.cause`. Ne lire que le premier niveau ferait passer toutes les
 * violations de règle métier pour des pannes imprévues.
 */
function texteComplet(err: unknown): string {
  const morceaux: string[] = [];
  let courant: unknown = err;
  for (let i = 0; i < 5 && courant instanceof Error; i++) {
    morceaux.push(courant.message);
    courant = (courant as Error & { cause?: unknown }).cause;
  }
  return morceaux.length > 0 ? morceaux.join(' | ') : String(err);
}

/** Convertit une erreur PostgreSQL en message lisible par l'utilisatrice. */
function messageErreur(err: unknown): string {
  const brut = texteComplet(err);

  // Messages levés par nos propres triggers : déjà rédigés pour l'utilisateur.
  // On extrait la phrase seule, sans le bruit d'enveloppe du driver.
  const regleMetier = brut.match(/(Stock insuffisant|Effectif insuffisant)[^|]*/);
  if (regleMetier) {
    return regleMetier[0].replace(/\s*\(bande [0-9a-f-]+\)/i, '').trim();
  }
  if (brut.includes('recolte_unique_par_creneau')) {
    return 'Une récolte est déjà enregistrée pour ce créneau. Modifiez-la plutôt que d’en créer une seconde.';
  }
  if (brut.includes('n’appartient pas') || brut.includes("n'appartient pas")) {
    return 'Cette bande n’appartient pas à votre exploitation.';
  }
  console.error('[saisie] erreur non prévue :', brut);
  return 'L’enregistrement a échoué. Réessayez, et signalez le problème s’il persiste.';
}

// ---------------------------------------------------------------------------
// Récolte d'œufs
// ---------------------------------------------------------------------------
const schemaRecolte = z.object({
  bandeId: uuid,
  dateRecolte: dateISO,
  creneau: z.enum(['matin', 'midi', 'soir']),
  quantite: z.coerce.number().min(0, 'La quantité ne peut pas être négative'),
  unite,
  oeufsCasses: z.coerce.number().int().min(0).default(0),
  notes: texteOptionnel(500),
});

export async function enregistrerRecolte(_precedent: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerSaisie();
  const analyse = schemaRecolte.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) {
    return { ok: false, erreur: analyse.error.issues[0].message };
  }
  const d = analyse.data;

  const converti = versOeufs(d.quantite, d.unite);
  if (!converti.ok) return { ok: false, erreur: converti.erreur };
  const nombreOeufs = converti.valeur;

  if (d.oeufsCasses > nombreOeufs) {
    return { ok: false, erreur: 'Il ne peut pas y avoir plus d’œufs cassés que d’œufs récoltés.' };
  }

  try {
    await exigerBandeDeLaFerme(d.bandeId, session.fermeId);
    await db.execute(sql`
      INSERT INTO recoltes_oeufs
        (bande_id, date_recolte, creneau, nombre_oeufs, oeufs_casses,
         unite_saisie, quantite_saisie, notes, created_by)
      VALUES (${d.bandeId}, ${d.dateRecolte}, ${d.creneau}, ${nombreOeufs}, ${d.oeufsCasses},
              ${d.unite}, ${d.quantite}, ${d.notes ?? null}, ${session.userId})
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/saisie');
  return { ok: true, message: `Récolte enregistrée : ${nombreOeufs} œufs.` };
}

// ---------------------------------------------------------------------------
// Sortie de poules (mortalité, vente, réforme, consommation)
// ---------------------------------------------------------------------------
const schemaMouvement = z.object({
  bandeId: uuid,
  dateMouvement: dateISO,
  type: z.enum(['mortalite', 'vente_poule', 'vente_reforme', 'consommation_perso', 'sortie_diverse']),
  quantite: z.coerce.number().int().positive('La quantité doit être supérieure à zéro'),
  montantTotal: z.coerce.number().min(0).optional(),
  tiers: texteOptionnel(200),
  motif: texteOptionnel(500),
});

export async function enregistrerMouvement(_precedent: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerSaisie();
  const analyse = schemaMouvement.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) {
    return { ok: false, erreur: analyse.error.issues[0].message };
  }
  const d = analyse.data;

  const estVente = d.type === 'vente_poule' || d.type === 'vente_reforme';
  if (estVente && (d.montantTotal == null || d.montantTotal <= 0)) {
    return { ok: false, erreur: 'Indiquez le montant de la vente.' };
  }

  try {
    await exigerBandeDeLaFerme(d.bandeId, session.fermeId);
    await db.execute(sql`
      INSERT INTO mouvements_effectif
        (bande_id, date_mouvement, type, quantite, montant_total, tiers, motif, created_by)
      VALUES (${d.bandeId}, ${d.dateMouvement}, ${d.type}, ${d.quantite},
              ${estVente ? d.montantTotal : null}, ${d.tiers ?? null}, ${d.motif ?? null},
              ${session.userId})
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/saisie');
  return { ok: true, message: `${d.quantite} poule(s) enregistrée(s) en sortie.` };
}

// ---------------------------------------------------------------------------
// Sortie d'œufs (vente et autres)
// ---------------------------------------------------------------------------
const schemaSortieOeufs = z.object({
  bandeId: uuid,
  dateSortie: dateISO,
  type: z.enum(['vente', 'consommation_perso', 'casse', 'don', 'perte']),
  quantite: z.coerce.number().positive('La quantité doit être supérieure à zéro'),
  unite,
  prixUnitaire: z.coerce.number().min(0).optional(),
  client: texteOptionnel(200),
});

export async function enregistrerSortieOeufs(_precedent: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerSaisie();
  const analyse = schemaSortieOeufs.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) {
    return { ok: false, erreur: analyse.error.issues[0].message };
  }
  const d = analyse.data;

  const converti = versOeufs(d.quantite, d.unite);
  if (!converti.ok) return { ok: false, erreur: converti.erreur };
  const nombreOeufs = converti.valeur;

  if (d.type === 'vente' && (d.prixUnitaire == null || d.prixUnitaire <= 0)) {
    return { ok: false, erreur: 'Indiquez le prix unitaire de la vente.' };
  }

  // Le prix est saisi dans l'unité choisie : un prix « par alvéole » se
  // multiplie par le nombre d'alvéoles, pas par le nombre d'œufs.
  const montantTotal = d.prixUnitaire != null ? d.prixUnitaire * d.quantite : null;

  try {
    await exigerBandeDeLaFerme(d.bandeId, session.fermeId);
    await db.execute(sql`
      INSERT INTO sorties_oeufs
        (bande_id, date_sortie, type, nombre_oeufs, unite_saisie, quantite_saisie,
         prix_unitaire, montant_total, client, created_by)
      VALUES (${d.bandeId}, ${d.dateSortie}, ${d.type}, ${nombreOeufs}, ${d.unite}, ${d.quantite},
              ${d.prixUnitaire ?? null}, ${montantTotal}, ${d.client ?? null}, ${session.userId})
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/saisie');
  return { ok: true, message: `Sortie enregistrée : ${nombreOeufs} œufs.` };
}

// ---------------------------------------------------------------------------
// Dépense
// ---------------------------------------------------------------------------
const schemaDepense = z.object({
  bandeId: uuid,
  dateDepense: dateISO,
  categorie: z.enum([
    'equipement', 'main_oeuvre', 'energie', 'eau', 'transport',
    'litiere', 'reparation', 'loyer', 'autre',
  ]),
  libelle: z.string().min(1, 'Indiquez un libellé').max(200),
  montant: z.coerce.number().positive('Le montant doit être supérieur à zéro'),
});

export async function enregistrerDepense(_precedent: Retour | null, donnees: FormData): Promise<Retour> {
  const session = await exigerSaisie();
  const analyse = schemaDepense.safeParse(Object.fromEntries(donnees));
  if (!analyse.success) {
    return { ok: false, erreur: analyse.error.issues[0].message };
  }
  const d = analyse.data;

  try {
    await exigerBandeDeLaFerme(d.bandeId, session.fermeId);
    await db.execute(sql`
      INSERT INTO depenses (ferme_id, bande_id, date_depense, categorie, libelle, montant, created_by)
      VALUES (${session.fermeId}, ${d.bandeId}, ${d.dateDepense}, ${d.categorie},
              ${d.libelle}, ${d.montant}, ${session.userId})
    `);
  } catch (err) {
    return { ok: false, erreur: messageErreur(err) };
  }

  revalidatePath('/');
  revalidatePath('/saisie');
  return { ok: true, message: 'Dépense enregistrée.' };
}

// ---------------------------------------------------------------------------
// Déconnexion
// ---------------------------------------------------------------------------
export async function deconnecter(): Promise<void> {
  await detruireSession();
  redirect('/connexion');
}

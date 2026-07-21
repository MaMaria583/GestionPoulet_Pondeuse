import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { DateISO } from '@/lib/domain/types';

/**
 * Requêtes du tableau de bord.
 *
 * Les agrégats sont calculés PAR LA BASE, via les vues de docs/schema.sql.
 * Rapatrier les lignes pour les additionner en TypeScript ferait transiter
 * des milliers d'enregistrements et dupliquerait une logique déjà écrite.
 *
 * CLOISONNEMENT — `fermeId` est un paramètre OBLIGATOIRE, jamais optionnel et
 * jamais déduit à l'intérieur. Le compilateur refuse ainsi tout appel qui
 * l'oublierait, au lieu de laisser passer une requête sans filtre.
 *
 * Ces fonctions ont longtemps lu la table entière : n'importe quel compte
 * voyait les bandes, les finances et l'historique de TOUTES les exploitations,
 * l'inscription étant ouverte à tous. Le contrôle n'existait qu'en écriture,
 * via `exigerBandeDeLaFerme()`. Ne jamais rétablir une lecture non filtrée,
 * même « temporairement » pour déboguer.
 */

/** Les colonnes NUMERIC reviennent en `string` : conversion explicite, jamais implicite. */
const nombre = (v: unknown): number => (v == null ? 0 : Number(v));

/** Les colonnes DATE reviennent en objet Date via le driver : on repasse en ISO. */
const dateISO = (v: unknown): DateISO =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

export interface ResumeBande {
  id: string;
  code: string;
  nom: string | null;
  souche: string | null;
  statut: 'active' | 'cloturee';
  dateIntroduction: DateISO;
  dateDebutPonte: DateISO | null;
  effectifInitial: number;
}

export async function listerBandes(fermeId: string): Promise<ResumeBande[]> {
  const { rows } = await db.execute(sql`
    SELECT id, code, nom, souche, statut, date_introduction, date_debut_ponte, effectif_initial
    FROM bandes
    WHERE ferme_id = ${fermeId}
    ORDER BY statut, date_introduction DESC
  `);
  return rows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    nom: r.nom as string | null,
    souche: r.souche as string | null,
    statut: r.statut as 'active' | 'cloturee',
    dateIntroduction: dateISO(r.date_introduction),
    dateDebutPonte: r.date_debut_ponte ? dateISO(r.date_debut_ponte) : null,
    effectifInitial: nombre(r.effectif_initial),
  }));
}

export interface DetailBande extends ResumeBande {
  effectif: {
    actuel: number;
    mortalites: number;
    ventesPoules: number;
    reformes: number;
    consoPerso: number;
    sortiesDiverses: number;
    tauxMortalite: number;
  };
  stock: {
    actuel: number;
    totalRecolte: number;
    totalCasse: number;
    totalVendu: number;
    autresSorties: number;
  };
  finances: {
    recettesOeufs: number;
    recettesPoules: number;
    coutAlimentation: number;
    coutSante: number;
    coutDivers: number;
    totalRecettes: number;
    totalDepenses: number;
    resultat: number;
  };
}

export async function chargerBande(
  bandeId: string,
  fermeId: string,
): Promise<DetailBande | null> {
  const { rows } = await db.execute(sql`
    SELECT b.id, b.code, b.nom, b.souche, b.statut, b.date_introduction,
           b.date_debut_ponte, b.effectif_initial,
           e.effectif_actuel, e.total_mortalites, e.total_ventes_poules,
           e.total_reformes, e.total_conso_perso, e.total_sorties_diverses,
           e.taux_mortalite_pct,
           s.stock_actuel, s.total_recolte, s.total_casse_recolte,
           s.total_vendu, s.total_sorti,
           f.recettes_oeufs, f.recettes_poules,
           f.cout_alimentation, f.cout_sante, f.cout_divers
    FROM bandes b
    JOIN v_bande_effectif    e ON e.bande_id = b.id
    JOIN v_bande_stock_oeufs s ON s.bande_id = b.id
    JOIN v_bande_finances    f ON f.bande_id = b.id
    WHERE b.id = ${bandeId} AND b.ferme_id = ${fermeId}
  `);

  const r = rows[0];
  if (!r) return null;

  const recettesOeufs = nombre(r.recettes_oeufs);
  const recettesPoules = nombre(r.recettes_poules);
  const coutAlimentation = nombre(r.cout_alimentation);
  const coutSante = nombre(r.cout_sante);
  const coutDivers = nombre(r.cout_divers);
  const totalRecettes = recettesOeufs + recettesPoules;
  const totalDepenses = coutAlimentation + coutSante + coutDivers;

  return {
    id: String(r.id),
    code: String(r.code),
    nom: r.nom as string | null,
    souche: r.souche as string | null,
    statut: r.statut as 'active' | 'cloturee',
    dateIntroduction: dateISO(r.date_introduction),
    dateDebutPonte: r.date_debut_ponte ? dateISO(r.date_debut_ponte) : null,
    effectifInitial: nombre(r.effectif_initial),
    effectif: {
      actuel: nombre(r.effectif_actuel),
      mortalites: nombre(r.total_mortalites),
      ventesPoules: nombre(r.total_ventes_poules),
      reformes: nombre(r.total_reformes),
      consoPerso: nombre(r.total_conso_perso),
      sortiesDiverses: nombre(r.total_sorties_diverses),
      tauxMortalite: nombre(r.taux_mortalite_pct),
    },
    stock: {
      actuel: nombre(r.stock_actuel),
      totalRecolte: nombre(r.total_recolte),
      totalCasse: nombre(r.total_casse_recolte),
      totalVendu: nombre(r.total_vendu),
      autresSorties: nombre(r.total_sorti) - nombre(r.total_vendu),
    },
    finances: {
      recettesOeufs,
      recettesPoules,
      coutAlimentation,
      coutSante,
      coutDivers,
      totalRecettes,
      totalDepenses,
      resultat: totalRecettes - totalDepenses,
    },
  };
}

export interface PointProduction {
  jour: DateISO;
  oeufs: number;
  /** 0 = aucune saisie ce jour-là. À ne PAS confondre avec « 0 œuf récolté ». */
  nbSaisies: number;
  effectif: number;
  tauxPonte: number | null;
  enMonteePonte: boolean;
  alerteAbsence: boolean;
  alerteBaisse: boolean;
}

export async function chargerProduction(bandeId: string): Promise<PointProduction[]> {
  const { rows } = await db.execute(sql`
    SELECT jour, oeufs_recoltes, nb_saisies, effectif_jour, taux_ponte_pct,
           en_montee_ponte, alerte_absence_recolte, alerte_baisse_production
    FROM v_production_journaliere
    WHERE bande_id = ${bandeId}
    ORDER BY jour
  `);
  return rows.map((r) => ({
    jour: dateISO(r.jour),
    oeufs: nombre(r.oeufs_recoltes),
    nbSaisies: nombre(r.nb_saisies),
    effectif: nombre(r.effectif_jour),
    tauxPonte: r.taux_ponte_pct == null ? null : nombre(r.taux_ponte_pct),
    enMonteePonte: Boolean(r.en_montee_ponte),
    alerteAbsence: Boolean(r.alerte_absence_recolte),
    alerteBaisse: Boolean(r.alerte_baisse_production),
  }));
}

export interface Intervention {
  id: string;
  datePrevue: DateISO;
  libelle: string;
  type: string;
  produit: string | null;
  statut: 'planifie' | 'realise' | 'annule';
}

export async function chargerProchainesInterventions(
  bandeId: string,
  limite = 4,
): Promise<Intervention[]> {
  const { rows } = await db.execute(sql`
    SELECT id, date_prevue, libelle, type, produit, statut
    FROM interventions_sante
    WHERE bande_id = ${bandeId} AND statut = 'planifie'
    ORDER BY date_prevue
    LIMIT ${limite}
  `);
  return rows.map((r) => ({
    id: String(r.id),
    datePrevue: dateISO(r.date_prevue),
    libelle: String(r.libelle),
    type: String(r.type),
    produit: r.produit as string | null,
    statut: r.statut as 'planifie' | 'realise' | 'annule',
  }));
}

export interface LigneDepense {
  categorie: string;
  montant: number;
}

/** Dépenses regroupées par nature, alimentation et santé comprises. */
export async function chargerRepartitionDepenses(bandeId: string): Promise<LigneDepense[]> {
  const { rows } = await db.execute(sql`
    SELECT 'Alimentation' AS categorie, COALESCE(SUM(montant_total), 0) AS montant
    FROM alimentations WHERE bande_id = ${bandeId}
    UNION ALL
    SELECT 'Santé', COALESCE(SUM(cout), 0)
    FROM interventions_sante WHERE bande_id = ${bandeId} AND statut = 'realise'
    UNION ALL
    SELECT initcap(replace(categorie::text, '_', ' ')), SUM(montant)
    FROM depenses WHERE bande_id = ${bandeId}
    GROUP BY categorie
  `);
  return rows
    .map((r) => ({ categorie: String(r.categorie), montant: nombre(r.montant) }))
    .filter((l) => l.montant > 0)
    .sort((a, b) => b.montant - a.montant);
}

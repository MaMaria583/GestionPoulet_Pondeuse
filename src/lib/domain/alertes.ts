import {
  DELAI_ALERTE_RECOLTE_JOURS,
  DELAI_PIC_PONTE_JOURS,
  SEUIL_ALERTE_PONTE,
} from './constants';
import { ajouterJours, differenceJours, intervalleJours } from './dates';
import { calculerEffectif } from './effectif';
import type { DateISO, MouvementEffectif, Recolte } from './types';

/**
 * Alertes automatiques.
 *
 * Principe : une alerte est DÉRIVÉE de l'état, jamais stockée.
 * Elle est recalculée à chaque lecture, donc elle disparaît d'elle-même dès
 * que la donnée manquante est saisie — sans job de nettoyage, et sans risque
 * d'alerte fantôme survivant à la correction qui l'a résolue.
 */

export type NiveauAlerte = 'critique' | 'avertissement';

export interface Alerte {
  code: 'absence_recolte' | 'baisse_production';
  niveau: NiveauAlerte;
  jour: DateISO;
  message: string;
}

export interface JourneeProduction {
  jour: DateISO;
  oeufsRecoltes: number;
  /** Nombre de saisies enregistrées ce jour (0 = aucune récolte saisie). */
  nbSaisies: number;
  effectifJour: number;
  /** Œufs récoltés rapportés à l'effectif, en %. `null` si effectif nul. */
  tauxPonte: number | null;
  /** Vrai pendant la montée en ponte : un taux bas y est normal, pas anormal. */
  enMonteePonte: boolean;
  alertes: Alerte[];
}

export interface ParametresAnalyse {
  effectifInitial: number;
  dateDebutPonte: DateISO | null;
  dateFin: DateISO;
  mouvements: readonly MouvementEffectif[];
  recoltes: readonly Recolte[];
  /** Une bande clôturée n'émet plus d'alerte. */
  bandeActive: boolean;
}

/**
 * Construit la série journalière depuis le début de ponte, en incluant
 * les jours SANS récolte — c'est précisément l'absence de ligne qui
 * déclenche l'alerte, donc elle ne peut pas être détectée en parcourant
 * uniquement les récoltes existantes.
 */
export function analyserProduction(p: ParametresAnalyse): JourneeProduction[] {
  if (!p.dateDebutPonte) return [];

  const recoltesParJour = new Map<DateISO, { oeufs: number; saisies: number }>();
  for (const r of p.recoltes) {
    const courant = recoltesParJour.get(r.dateRecolte) ?? { oeufs: 0, saisies: 0 };
    courant.oeufs += r.nombreOeufs;
    courant.saisies += 1;
    recoltesParJour.set(r.dateRecolte, courant);
  }

  const premierJourAlerte = ajouterJours(p.dateDebutPonte, DELAI_ALERTE_RECOLTE_JOURS);
  const finMonteeEnPonte = ajouterJours(p.dateDebutPonte, DELAI_PIC_PONTE_JOURS);

  return intervalleJours(p.dateDebutPonte, p.dateFin).map((jour) => {
    const { oeufs, saisies } = recoltesParJour.get(jour) ?? { oeufs: 0, saisies: 0 };
    const effectifJour = calculerEffectif(p.effectifInitial, p.mouvements, jour).effectifActuel;

    const tauxPonte =
      effectifJour > 0 ? Math.round((oeufs / effectifJour) * 10_000) / 100 : null;

    const alertes: Alerte[] = [];

    if (p.bandeActive) {
      // 1. Aucune récolte saisie, passé le délai de grâce d'une semaine.
      if (saisies === 0 && jour >= premierJourAlerte) {
        alertes.push({
          code: 'absence_recolte',
          niveau: 'critique',
          jour,
          message: `Aucune récolte enregistrée le ${formaterJour(jour)}.`,
        });
      }

      // 2. Production sous le seuil. Trois conditions cumulatives :
      //    - une récolte a bien été saisie (sinon un jour non saisi déclencherait
      //      les DEUX alertes et laisserait croire à un effondrement) ;
      //    - la montée en ponte est terminée (avant le pic, être sous 80 % est
      //      normal — alerter là-dessus noierait les vraies chutes) ;
      //    - l'effectif est non nul.
      if (
        saisies > 0 &&
        jour >= finMonteeEnPonte &&
        effectifJour > 0 &&
        oeufs < effectifJour * SEUIL_ALERTE_PONTE
      ) {
        alertes.push({
          code: 'baisse_production',
          niveau: 'avertissement',
          jour,
          message:
            `Production faible le ${formaterJour(jour)} : ${oeufs} œufs pour ` +
            `${effectifJour} poules (${tauxPonte} %, seuil ${SEUIL_ALERTE_PONTE * 100} %).`,
        });
      }
    }

    return {
      jour,
      oeufsRecoltes: oeufs,
      nbSaisies: saisies,
      effectifJour,
      tauxPonte,
      enMonteePonte: jour < finMonteeEnPonte,
      alertes,
    };
  });
}

/** Toutes les alertes actives, les plus récentes d'abord. */
export function alertesActives(journees: readonly JourneeProduction[]): Alerte[] {
  return journees
    .flatMap((j) => j.alertes)
    .sort((a, b) => (a.jour < b.jour ? 1 : a.jour > b.jour ? -1 : 0));
}

/**
 * Date de début de ponte déduite de la première récolte non nulle,
 * quand elle n'a pas été saisie manuellement.
 */
export function deduireDebutPonte(recoltes: readonly Recolte[]): DateISO | null {
  const avecOeufs = recoltes.filter((r) => r.nombreOeufs > 0);
  if (avecOeufs.length === 0) return null;
  return avecOeufs.reduce((min, r) => (r.dateRecolte < min ? r.dateRecolte : min), avecOeufs[0].dateRecolte);
}

/** Âge de la bande en jours, à la date donnée. */
export function ageEnJours(dateIntroduction: DateISO, aLaDate: DateISO): number {
  return differenceJours(dateIntroduction, aLaDate);
}

const formaterJour = (jour: DateISO) => {
  const [a, m, j] = jour.split('-');
  return `${j}/${m}/${a}`;
};

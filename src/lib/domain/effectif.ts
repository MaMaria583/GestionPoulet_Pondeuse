import { echec, succes, type DateISO, type MouvementEffectif, type Resultat } from './types';

/**
 * Réconciliation de l'effectif d'une bande.
 *
 *   Effectif théorique = Effectif initial
 *                        − Mortalités
 *                        − Ventes de poules
 *                        − Ventes en réforme
 *                        − Consommations personnelles / sorties diverses
 *
 * Les cinq causes de sortie partagent une seule table (`mouvements_effectif`),
 * donc une seule soustraction. Le détail par cause reste disponible pour
 * l'analyse (taux de mortalité, recettes) sans changer la formule.
 */

export interface DetailEffectif {
  effectifInitial: number;
  mortalites: number;
  ventesPoules: number;
  ventesReforme: number;
  consommationPerso: number;
  sortiesDiverses: number;
  /** Somme de toutes les sorties, quelle qu'en soit la cause. */
  totalSorties: number;
  effectifActuel: number;
  /** Part de l'effectif initial perdue par mortalité, en %. */
  tauxMortalite: number;
}

/**
 * Calcule l'effectif à une date donnée.
 * Sans `aLaDate`, tous les mouvements sont pris en compte (effectif courant).
 */
export function calculerEffectif(
  effectifInitial: number,
  mouvements: readonly MouvementEffectif[],
  aLaDate?: DateISO,
): DetailEffectif {
  if (!Number.isInteger(effectifInitial) || effectifInitial <= 0) {
    throw new RangeError(`effectifInitial doit être un entier > 0, reçu ${effectifInitial}`);
  }

  const retenus = aLaDate
    ? mouvements.filter((m) => m.dateMouvement <= aLaDate) // comparaison lexicographique valide en ISO
    : mouvements;

  const total = (type: MouvementEffectif['type']) =>
    retenus.reduce((somme, m) => (m.type === type ? somme + m.quantite : somme), 0);

  const mortalites = total('mortalite');
  const ventesPoules = total('vente_poule');
  const ventesReforme = total('vente_reforme');
  const consommationPerso = total('consommation_perso');
  const sortiesDiverses = total('sortie_diverse');

  const totalSorties =
    mortalites + ventesPoules + ventesReforme + consommationPerso + sortiesDiverses;

  return {
    effectifInitial,
    mortalites,
    ventesPoules,
    ventesReforme,
    consommationPerso,
    sortiesDiverses,
    totalSorties,
    effectifActuel: effectifInitial - totalSorties,
    tauxMortalite: arrondi2((mortalites / effectifInitial) * 100),
  };
}

/**
 * Vérifie qu'une nouvelle sortie de poules est possible.
 * Miroir applicatif du trigger `check_effectif` : l'interface doit refuser
 * la saisie avant même l'appel serveur, mais la base reste l'autorité.
 */
export function verifierSortieEffectif(
  effectifActuel: number,
  quantiteDemandee: number,
): Resultat<number> {
  if (!Number.isInteger(quantiteDemandee) || quantiteDemandee <= 0) {
    return echec('La quantité doit être un entier supérieur à zéro.');
  }
  if (quantiteDemandee > effectifActuel) {
    return echec(
      `Effectif insuffisant : ${quantiteDemandee} poules demandées, ` +
        `${effectifActuel} présentes dans la bande.`,
    );
  }
  return succes(effectifActuel - quantiteDemandee);
}

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

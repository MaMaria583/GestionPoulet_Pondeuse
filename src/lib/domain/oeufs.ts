import { OEUFS_PAR_ALVEOLE } from './constants';
import { echec, succes, type Resultat, type UniteSaisie } from './types';

/**
 * Conversion alvéoles ↔ œufs.
 *
 * L'ŒUF est l'unité pivot : c'est lui qui est stocké en base et qui sert à
 * tous les calculs. L'alvéole n'est qu'un confort de saisie. Stocker des
 * alvéoles fractionnaires rendrait impossible un total exact d'œufs.
 */

/** Convertit un nombre d'alvéoles en œufs. Les décimales sont autorisées (0,5 alvéole = 15 œufs). */
export function alveolesEnOeufs(alveoles: number): Resultat<number> {
  if (!Number.isFinite(alveoles) || alveoles < 0) {
    return echec('Le nombre d’alvéoles doit être un nombre positif.');
  }
  const oeufs = alveoles * OEUFS_PAR_ALVEOLE;
  if (!Number.isInteger(oeufs)) {
    // Ex. 2,05 alvéole = 61,5 œufs. On refuse plutôt que d'arrondir en silence :
    // un arrondi tacite fausserait durablement le stock.
    return echec(
      `${alveoles} alvéoles correspondent à ${oeufs} œufs, ce qui n’est pas un nombre entier. ` +
        `Saisissez plutôt la quantité en œufs.`,
    );
  }
  return succes(oeufs);
}

/** Décompose un nombre d'œufs en alvéoles pleines + œufs restants. */
export function oeufsEnAlveoles(oeufs: number): { alveoles: number; oeufsRestants: number } {
  if (!Number.isInteger(oeufs) || oeufs < 0) {
    throw new RangeError(`oeufs doit être un entier positif, reçu ${oeufs}`);
  }
  return {
    alveoles: Math.floor(oeufs / OEUFS_PAR_ALVEOLE),
    oeufsRestants: oeufs % OEUFS_PAR_ALVEOLE,
  };
}

/**
 * Normalise une saisie utilisateur vers le nombre d'œufs à stocker.
 * C'est le point d'entrée unique de tous les formulaires de récolte et de sortie.
 */
export function versOeufs(quantite: number, unite: UniteSaisie): Resultat<number> {
  if (unite === 'alveole') return alveolesEnOeufs(quantite);

  if (!Number.isFinite(quantite) || quantite < 0) {
    return echec('Le nombre d’œufs doit être un nombre positif.');
  }
  if (!Number.isInteger(quantite)) {
    return echec('Le nombre d’œufs doit être un entier — un demi-œuf n’existe pas.');
  }
  return succes(quantite);
}

/**
 * Saisie à deux champs : « 12 alvéoles + 7 œufs ».
 * Correspond à la façon dont les quantités se comptent réellement au poulailler.
 */
export function saisieMixteVersOeufs(alveoles: number, oeufsSupplementaires: number): Resultat<number> {
  const converti = alveolesEnOeufs(alveoles);
  if (!converti.ok) return converti;

  const supp = versOeufs(oeufsSupplementaires, 'oeuf');
  if (!supp.ok) return supp;

  return succes(converti.valeur + supp.valeur);
}

/** Rend un nombre d'œufs lisible : « 12 alvéoles + 7 œufs (367) ». */
export function formaterQuantite(oeufs: number): string {
  const { alveoles, oeufsRestants } = oeufsEnAlveoles(oeufs);
  if (alveoles === 0) return `${oeufsRestants} œuf${oeufsRestants > 1 ? 's' : ''}`;

  const partAlveoles = `${alveoles} alvéole${alveoles > 1 ? 's' : ''}`;
  if (oeufsRestants === 0) return `${partAlveoles} (${oeufs} œufs)`;
  return `${partAlveoles} + ${oeufsRestants} œuf${oeufsRestants > 1 ? 's' : ''} (${oeufs} œufs)`;
}

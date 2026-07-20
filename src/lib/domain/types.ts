/** Types partagés du domaine. Miroir des ENUM PostgreSQL de docs/schema.sql. */

/**
 * Date calendaire au format `YYYY-MM-DD`.
 *
 * On n'utilise volontairement PAS `Date` : une récolte a lieu « le 3 mars »,
 * pas « le 3 mars à 00:00 UTC ». Passer par `Date` fait dépendre le jour du
 * fuseau du navigateur ou du serveur — une saisie tardive peut alors être
 * enregistrée la veille. La chaîne ISO supprime la classe de bug entière.
 */
export type DateISO = string;

export type UniteSaisie = 'oeuf' | 'alveole';

export type TypeMouvementEffectif =
  | 'mortalite'
  | 'vente_poule'
  | 'vente_reforme'
  | 'consommation_perso'
  | 'sortie_diverse';

export type TypeSortieOeuf =
  | 'vente'
  | 'consommation_perso'
  | 'casse'
  | 'don'
  | 'perte';

export interface MouvementEffectif {
  type: TypeMouvementEffectif;
  quantite: number;
  dateMouvement: DateISO;
}

export interface Recolte {
  dateRecolte: DateISO;
  nombreOeufs: number;
  oeufsCasses: number;
}

export interface SortieOeuf {
  dateSortie: DateISO;
  type: TypeSortieOeuf;
  nombreOeufs: number;
}

/**
 * Résultat d'une règle métier pouvant échouer pour une raison
 * que l'utilisateur doit comprendre et corriger.
 *
 * On préfère ce type à une exception : « stock insuffisant » n'est pas un
 * bug, c'est un cas nominal que l'interface doit afficher proprement.
 * Les exceptions restent réservées aux erreurs de programmation.
 */
export type Resultat<T> =
  | { ok: true; valeur: T }
  | { ok: false; erreur: string };

export const succes = <T>(valeur: T): Resultat<T> => ({ ok: true, valeur });
export const echec = <T = never>(erreur: string): Resultat<T> => ({ ok: false, erreur });
